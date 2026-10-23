/**
 * SISKA — Report Domain Service (`ReportService`)
 * Sumber otoritas:
 * - docs/01-SRS.md FR-006, FR-008, FR-009, §7
 * - docs/02-ERD.md §2, §4, §6
 * - docs/04-API-SPEC.yaml (/reports, /reports/{reportId})
 * - docs/05-BACKEND-ARCHITECTURE.md §2.3, §4, §6 (Status dan transaksi)
 * - docs/08-AUTHORIZATION-MATRIX.md
 * - docs/09-TEST-PLAN.md REP-01..REP-06
 */

import type { DocumentData, Query } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { toIsoDateString, toIsoStringOrNull } from '@/lib/firebase/firestore';
import {
  INDISTINGUISHABLE_NOT_FOUND_MESSAGE,
  assertCanReadReport,
  requireAdmin,
  requireRole,
  type AuthorizedCaller,
} from '@/server/authz/permissions';
import type { AuthenticatedCaller } from '@/server/authz/verify-token';
import { ApiError } from '@/server/errors/api-error';
import {
  recordAuditEventInBatch,
  recordAuditEventInTransaction,
} from '@/server/services/audit.service';
import {
  assertValidStatusTransition,
  type CreateReportInput,
  type ListReportsQuery,
  type UpdateReportStatusInput,
} from '@/server/validators/report.validator';
import type {
  PaginatedReportsResult,
  ReportsSummaryResult,
  SerializedEvidenceItem,
  SerializedReport,
  SerializedReportDetail,
  SerializedStatusHistoryItem,
} from '@/types/api';
import type {
  EvidenceContentType,
  ReportDocument,
  ReportStatus,
} from '@/types/domain';
import { REPORT_STATUSES } from '@/types/domain';

export {
  toIsoStringOrNull,
  type PaginatedReportsResult,
  type ReportsSummaryResult,
  type SerializedEvidenceItem,
  type SerializedReport,
  type SerializedReportDetail,
  type SerializedStatusHistoryItem,
};

function serializeReportDoc(id: string, data: DocumentData): SerializedReport {
  return {
    id,
    reporterId: String(data.reporterId ?? ''),
    category: String(data.category ?? ''),
    incidentAt: toIsoStringOrNull(data.incidentAt),
    location: typeof data.location === 'string' ? data.location : null,
    description: String(data.description ?? ''),
    status: data.status as ReportStatus,
    createdAt: toIsoDateString(data.createdAt),
    updatedAt: toIsoDateString(data.updatedAt),
    resolvedAt: toIsoStringOrNull(data.resolvedAt),
  };
}

/**
 * Membuat laporan baru (`POST /api/v1/reports`).
 * - Hanya diizinkan untuk `reporter` terautentikasi (docs/08-AUTHORIZATION-MATRIX.md).
 * - `reporterId` diturunkan langsung dari `caller.uid` (REP-01).
 * - Menyimpan dokumen `reports/{id}`, riwayat awal `statusHistory` (`null -> submitted`),
 *   dan entri `auditEvents` secara atomik melalui WriteBatch.
 */
export async function createReport(
  caller: AuthenticatedCaller,
  input: CreateReportInput,
  requestId: string,
): Promise<SerializedReport> {
  const authorized: AuthorizedCaller = requireRole(caller, ['reporter']);
  const db = getAdminDb();
  const now = new Date();

  const reportRef = db.collection('reports').doc();
  const historyRef = reportRef.collection('statusHistory').doc();

  const reportData: ReportDocument = {
    reporterId: authorized.uid,
    category: input.category,
    incidentAt: input.incidentAt ?? null,
    location: input.location ?? null,
    description: input.description,
    status: 'submitted',
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
  };

  const batch = db.batch();
  batch.create(reportRef, reportData);
  batch.create(historyRef, {
    fromStatus: null,
    toStatus: 'submitted',
    actorUid: authorized.uid,
    note: null,
    createdAt: now,
  });
  recordAuditEventInBatch(batch, {
    actorUid: authorized.uid,
    action: 'report.created',
    targetType: 'report',
    targetId: reportRef.id,
    requestId,
    occurredAt: now,
  });

  await batch.commit();

  return serializeReportDoc(reportRef.id, reportData);
}

/**
 * Mengambil daftar laporan (`GET /api/v1/reports`) dengan paginasi cursor.
 * - Jika `caller.role === 'reporter'`, hanya mengembalikan laporan milik `caller.uid` (FR-008).
 * - Jika `caller.role === 'admin'`, mengembalikan daftar laporan sesuai filter status.
 */
export async function listReports(
  caller: AuthenticatedCaller,
  query: ListReportsQuery,
): Promise<PaginatedReportsResult> {
  const authorized = requireRole(caller, ['reporter', 'admin']);
  const db = getAdminDb();

  let fsQuery: Query = db.collection('reports');

  if (authorized.role === 'reporter') {
    fsQuery = fsQuery.where('reporterId', '==', authorized.uid);
  }

  if (query.status) {
    fsQuery = fsQuery.where('status', '==', query.status);
  }

  fsQuery = fsQuery.orderBy('createdAt', 'desc');

  if (query.cursor) {
    const cursorSnap = await db.collection('reports').doc(query.cursor).get();
    const cursorData = cursorSnap.exists
      ? (cursorSnap.data() as ReportDocument | undefined)
      : undefined;

    if (
      !cursorSnap.exists ||
      (authorized.role === 'reporter' &&
        cursorData?.reporterId !== authorized.uid)
    ) {
      const msg = "Parameter 'cursor' tidak valid.";
      throw ApiError.validation(msg, { cursor: msg });
    }
    fsQuery = fsQuery.startAfter(cursorSnap);
  }

  // Ambil limit + 1 untuk mengetahui apakah masih ada halaman berikutnya (`nextCursor`)
  const snapshot = await fsQuery.limit(query.limit + 1).get();
  const hasMore = snapshot.docs.length > query.limit;
  const pageDocs = hasMore ? snapshot.docs.slice(0, query.limit) : snapshot.docs;

  const items = pageDocs.map((doc) => serializeReportDoc(doc.id, doc.data()));
  const nextCursor =
    hasMore && pageDocs.length > 0
      ? pageDocs[pageDocs.length - 1].id
      : null;

  return {
    items,
    nextCursor,
  };
}

/**
 * Mengambil detail laporan beserta sub-koleksi `evidence` dan `statusHistory`
 * (`GET /api/v1/reports/{reportId}`).
 * - Menegakkan `assertCanReadReport`: jika pelapor A mengakses laporan pelapor B,
 *   melempar `404 NOT_FOUND` yang seragam (REP-03).
 * - Tidak pernah mengembalikan URL publik pada daftar `evidence` (docs/02-ERD.md §4).
 */
export async function getReportDetail(
  caller: AuthenticatedCaller,
  reportId: string,
): Promise<SerializedReportDetail> {
  const db = getAdminDb();
  const reportRef = db.collection('reports').doc(reportId);
  const reportSnap = await reportRef.get();

  const reportData = reportSnap.exists
    ? (reportSnap.data() as ReportDocument)
    : null;

  assertCanReadReport(caller, reportData);

  const [evidenceSnap, historySnap] = await Promise.all([
    reportRef.collection('evidence').orderBy('createdAt', 'asc').get(),
    reportRef.collection('statusHistory').orderBy('createdAt', 'asc').get(),
  ]);

  const evidence: SerializedEvidenceItem[] = evidenceSnap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      originalName: String(d.originalName ?? ''),
      contentType: d.contentType as EvidenceContentType,
      sizeBytes: Number(d.sizeBytes ?? 0),
      sha256: typeof d.sha256 === 'string' ? d.sha256 : null,
      uploadedBy: String(d.uploadedBy ?? ''),
      createdAt: toIsoDateString(d.createdAt),
    };
  });

  const statusHistory: SerializedStatusHistoryItem[] = historySnap.docs.map(
    (doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        fromStatus: (d.fromStatus as ReportStatus | null) ?? null,
        toStatus: d.toStatus as ReportStatus,
        actorUid: String(d.actorUid ?? ''),
        note: typeof d.note === 'string' ? d.note : null,
        createdAt: toIsoDateString(d.createdAt),
      };
    },
  );

  return {
    ...serializeReportDoc(reportSnap.id, reportData as DocumentData),
    evidence,
    statusHistory,
  };
}

/**
 * Memperbarui status laporan secara atomik (`PATCH /api/v1/reports/{reportId}` atau `/status`).
 * Sesuai docs/05-BACKEND-ARCHITECTURE.md §6 & REP-04 / REP-05 / REP-06:
 * 1. Hanya dapat dipanggil oleh Admin dengan Custom Claim terverifikasi (`requireAdmin`).
 * 2. Berjalan di dalam satu Firestore Transaction (`db.runTransaction`).
 * 3. Memvalidasi aturan transisi (`assertValidStatusTransition`).
 * 4. Memperbarui `reports.status`, `updatedAt`, dan `resolvedAt` (jika status menuju/dari `resolved`).
 * 5. Menambahkan dokumen baru pada sub-koleksi `reports/{reportId}/statusHistory`.
 * 6. Mencatat event pada koleksi `auditEvents` tanpa menyertakan isi laporan/catatan.
 */
export async function updateReportStatus(
  caller: AuthenticatedCaller,
  reportId: string,
  input: UpdateReportStatusInput,
  requestId: string,
): Promise<SerializedReport> {
  const adminCaller = requireAdmin(caller);
  const db = getAdminDb();
  const reportRef = db.collection('reports').doc(reportId);

  const updatedReport = await db.runTransaction(async (tx) => {
    const reportSnap = await tx.get(reportRef);
    if (!reportSnap.exists) {
      throw ApiError.notFound(INDISTINGUISHABLE_NOT_FOUND_MESSAGE);
    }

    const currentData = reportSnap.data() as ReportDocument;
    const fromStatus = currentData.status;
    const toStatus = input.status;

    assertValidStatusTransition(fromStatus, toStatus, input.note);

    const now = new Date();
    const resolvedAt = toStatus === 'resolved' ? now : null;

    tx.update(reportRef, {
      status: toStatus,
      updatedAt: now,
      resolvedAt,
    });

    const historyRef = reportRef.collection('statusHistory').doc();
    tx.create(historyRef, {
      fromStatus,
      toStatus,
      actorUid: adminCaller.uid,
      note: input.note ?? null,
      createdAt: now,
    });

    recordAuditEventInTransaction(tx, {
      actorUid: adminCaller.uid,
      action: 'report.status_changed',
      targetType: 'report',
      targetId: reportId,
      requestId,
      occurredAt: now,
    });

    return serializeReportDoc(reportId, {
      ...currentData,
      status: toStatus,
      updatedAt: now,
      resolvedAt,
    });
  });

  return updatedReport;
}

/**
 * Menghitung ringkasan statistik jumlah laporan per status (`GET /api/v1/reports/summary`).
 * Sesuai docs/01-SRS.md FR-005 & FR-015:
 * - Untuk `reporter`: hanya menghitung laporan milik pelapor yang bersangkutan (`reporterId == caller.uid`).
 * - Untuk `admin`: menghitung agregat seluruh laporan hanya dari field `status`, tanpa mengekspos data identitas atau kronologi.
 */
export async function getReportsSummary(
  caller: AuthenticatedCaller,
): Promise<ReportsSummaryResult> {
  const authorized = requireRole(caller, ['reporter', 'admin']);
  const db = getAdminDb();

  const byStatus: Record<ReportStatus, number> = {
    submitted: 0,
    under_review: 0,
    in_progress: 0,
    resolved: 0,
    rejected: 0,
  };

  let fsQuery: Query = db.collection('reports').select('status');
  if (authorized.role === 'reporter') {
    fsQuery = db
      .collection('reports')
      .where('reporterId', '==', authorized.uid)
      .select('status');
  }

  const snap = await fsQuery.get();
  let total = 0;

  for (const doc of snap.docs) {
    const status = doc.data().status as ReportStatus | undefined;
    if (status && (REPORT_STATUSES as readonly string[]).includes(status)) {
      byStatus[status] += 1;
      total += 1;
    }
  }

  return {
    scope: authorized.role === 'admin' ? 'admin_global' : 'reporter_own',
    total,
    byStatus,
  };
}
