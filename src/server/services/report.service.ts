// Layanan Domain Laporan

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
import {
  decryptJson,
  encryptJson,
  isEncryptedPayload,
} from '@/server/crypto/encryption';
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

// Pembuatan ID Laporan Unik
function formatReportId(date: Date, serial: number): string {
  const year = String(date.getFullYear() % 100).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const seq = String(serial).padStart(2, '0');
  return `SK-${year}${month}-${day}${seq}`;
}

async function generateUniqueReportId(db: ReturnType<typeof getAdminDb>, date: Date): Promise<string> {
  for (let serial = 1; serial <= 99; serial += 1) {
    const candidate = formatReportId(date, serial);
    const snapshot = await db.collection('reports').doc(candidate).get();
    if (!snapshot.exists) {
      return candidate;
    }
  }

  throw new Error('Tidak dapat membuat ID laporan unik hari ini.');
}

interface EncryptedReportFields {
  description: string;
  location: string | null;
}

function extractReportSensitiveFields(data: DocumentData): EncryptedReportFields {
  if (isEncryptedPayload(data.encryptedData)) {
    const decrypted = decryptJson<EncryptedReportFields>(data.encryptedData);
    if (!decrypted || typeof decrypted !== 'object' || Array.isArray(decrypted)) {
      throw ApiError.internal(
        'Struktur payload laporan terenkripsi tidak valid.',
        'Data laporan tidak dapat didekripsi.',
      );
    }
    return {
      description: typeof decrypted.description === 'string' ? decrypted.description : '',
      location: typeof decrypted.location === 'string' ? decrypted.location : null,
    };
  }

  if (data.encryptedData !== undefined && data.encryptedData !== null) {
    throw ApiError.internal(
      'Format field encryptedData pada laporan tidak valid.',
      'Data laporan tidak dapat didekripsi.',
    );
  }

  // Fallback kompatibel untuk data lama/seed yang masih tersimpan plaintext
  return {
    description: String(data.description ?? ''),
    location: typeof data.location === 'string' ? data.location : null,
  };
}

// Serialisasi Dokumen Laporan
function serializeReportDoc(id: string, data: DocumentData): SerializedReport {
  const { description, location } = extractReportSensitiveFields(data);
  return {
    id,
    reporterId: String(data.reporterId ?? ''),
    category: String(data.category ?? ''),
    incidentAt: toIsoStringOrNull(data.incidentAt),
    location,
    description,
    status: data.status as ReportStatus,
    createdAt: toIsoDateString(data.createdAt),
    updatedAt: toIsoDateString(data.updatedAt),
    resolvedAt: toIsoStringOrNull(data.resolvedAt),
  };
}

// Pembuatan Laporan Baru
export async function createReport(
  caller: AuthenticatedCaller,
  input: CreateReportInput,
  requestId: string,
): Promise<SerializedReport> {
  const authorized: AuthorizedCaller = requireRole(caller, ['reporter']);
  const db = getAdminDb();
  const now = new Date();
  const reportId = await generateUniqueReportId(db, now);
  const reportRef = db.collection('reports').doc(reportId);
  const historyRef = reportRef.collection('statusHistory').doc();

  const encryptedData = encryptJson<EncryptedReportFields>({
    description: input.description,
    location: input.location ?? null,
  });

  const reportData: ReportDocument = {
    reporterId: authorized.uid,
    category: input.category,
    incidentAt: input.incidentAt ?? null,
    status: 'submitted',
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    encryptedData,
  };

  const adminUsers = await db.collection('users').where('role', '==', 'admin').get();
  const batch = db.batch();
  batch.create(reportRef, reportData);
  batch.create(historyRef, {
    fromStatus: null,
    toStatus: 'submitted',
    actorUid: authorized.uid,
    note: null,
    createdAt: now,
  });
  for (const adminUser of adminUsers.docs) {
    const notificationRef = db.collection('users').doc(adminUser.id)
      .collection('notifications').doc();
    batch.create(notificationRef, {
      recipientUid: adminUser.id,
      type: 'new_report_submitted',
      title: 'Laporan Baru',
      body: 'Ada laporan baru yang menunggu peninjauan.',
      targetType: 'report',
      targetId: reportRef.id,
      isRead: false,
      readAt: null,
      createdAt: now,
    });
  }

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

// Daftar Laporan Berpaginasi
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

// Detail Laporan Lengkap
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

// Pembaruan Status Laporan
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

    if (currentData.reporterId) {
      const notifRef = db
        .collection('users')
        .doc(currentData.reporterId)
        .collection('notifications')
        .doc();

      const STATUS_LABELS: Record<ReportStatus, string> = {
        submitted: 'Menunggu tinjauan',
        under_review: 'Dalam peninjauan',
        in_progress: 'Dalam proses',
        resolved: 'Selesai',
        rejected: 'Ditolak',
      };

      tx.set(notifRef, {
        recipientUid: currentData.reporterId,
        type: 'report_status_changed',
        title: 'Status Laporan Diperbarui',
        body: `Status laporan Anda telah diperbarui menjadi '${STATUS_LABELS[toStatus]}'.`,
        targetType: 'report',
        targetId: reportId,
        isRead: false,
        readAt: null,
        createdAt: now,
      });
    }

    return serializeReportDoc(reportId, {
      ...currentData,
      status: toStatus,
      updatedAt: now,
      resolvedAt,
    });
  });

  return updatedReport;
}

// Ringkasan Statistik Laporan
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
