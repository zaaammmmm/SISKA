// Layanan Domain Laporan

import type { DocumentData } from 'firebase-admin/firestore';
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
  EncryptedReportData,
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

function hasOwnField(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

// Dekode Dokumen Laporan (Mendukung Full-Encrypted, 2-Field Encrypted, dan Plaintext Lama)
export function decodeReportDocument(data: DocumentData): EncryptedReportData {
  if (isEncryptedPayload(data.encryptedData)) {
    const decrypted = decryptJson<Partial<EncryptedReportData>>(data.encryptedData);
    if (!decrypted || typeof decrypted !== 'object' || Array.isArray(decrypted)) {
      throw ApiError.internal(
        'Struktur payload laporan terenkripsi tidak valid.',
        'Data laporan tidak dapat didekripsi.',
      );
    }

    const rawIncidentAt = hasOwnField(decrypted, 'incidentAt')
      ? decrypted.incidentAt
      : data.incidentAt;
    const rawLocation = hasOwnField(decrypted, 'location')
      ? decrypted.location
      : data.location;
    const rawResolvedAt = hasOwnField(decrypted, 'resolvedAt')
      ? decrypted.resolvedAt
      : data.resolvedAt;

    return {
      reporterId: hasOwnField(decrypted, 'reporterId')
        ? String(decrypted.reporterId ?? '')
        : String(data.reporterId ?? ''),
      category: hasOwnField(decrypted, 'category')
        ? String(decrypted.category ?? '')
        : String(data.category ?? ''),
      incidentAt: rawIncidentAt ?? null,
      location: typeof rawLocation === 'string' ? rawLocation : null,
      description: hasOwnField(decrypted, 'description')
        ? String(decrypted.description ?? '')
        : String(data.description ?? ''),
      status: (hasOwnField(decrypted, 'status')
        ? decrypted.status
        : data.status) as ReportStatus,
      createdAt: hasOwnField(decrypted, 'createdAt')
        ? (decrypted.createdAt ?? new Date(0))
        : (data.createdAt ?? new Date(0)),
      updatedAt: hasOwnField(decrypted, 'updatedAt')
        ? (decrypted.updatedAt ?? new Date(0))
        : (data.updatedAt ?? new Date(0)),
      resolvedAt: rawResolvedAt ?? null,
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
    reporterId: String(data.reporterId ?? ''),
    category: String(data.category ?? ''),
    incidentAt: data.incidentAt ?? null,
    location: typeof data.location === 'string' ? data.location : null,
    description: String(data.description ?? ''),
    status: data.status as ReportStatus,
    createdAt: data.createdAt ?? new Date(0),
    updatedAt: data.updatedAt ?? new Date(0),
    resolvedAt: data.resolvedAt ?? null,
  };
}

function toSerializedReport(id: string, decoded: EncryptedReportData): SerializedReport {
  return {
    id,
    reporterId: decoded.reporterId,
    category: decoded.category,
    incidentAt: toIsoStringOrNull(decoded.incidentAt),
    location: decoded.location,
    description: decoded.description,
    status: decoded.status,
    createdAt: toIsoDateString(decoded.createdAt),
    updatedAt: toIsoDateString(decoded.updatedAt),
    resolvedAt: toIsoStringOrNull(decoded.resolvedAt),
  };
}

// Serialisasi Dokumen Laporan
function serializeReportDoc(id: string, data: DocumentData): SerializedReport {
  return toSerializedReport(id, decodeReportDocument(data));
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

  const fullPayload: EncryptedReportData = {
    reporterId: authorized.uid,
    category: input.category,
    incidentAt: input.incidentAt ? input.incidentAt.toISOString() : null,
    location: input.location ?? null,
    description: input.description,
    status: 'submitted',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    resolvedAt: null,
  };

  const reportData: ReportDocument = {
    encryptedData: encryptJson<EncryptedReportData>(fullPayload),
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

  const snapshot = await db.collection('reports').get();
  const allReports = snapshot.docs.map((doc) =>
    serializeReportDoc(doc.id, doc.data()),
  );

  const visibleReports =
    authorized.role === 'reporter'
      ? allReports.filter((item) => item.reporterId === authorized.uid)
      : allReports;

  visibleReports.sort((a, b) => {
    const timeDiff =
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return timeDiff !== 0 ? timeDiff : b.id.localeCompare(a.id);
  });

  const filteredReports = query.status
    ? visibleReports.filter((item) => item.status === query.status)
    : visibleReports;

  let afterCursor = filteredReports;
  if (query.cursor) {
    const cursorReport = visibleReports.find((item) => item.id === query.cursor);
    if (!cursorReport) {
      const msg = "Parameter 'cursor' tidak valid.";
      throw ApiError.validation(msg, { cursor: msg });
    }
    const cursorTime = new Date(cursorReport.createdAt).getTime();
    afterCursor = filteredReports.filter((item) => {
      const itemTime = new Date(item.createdAt).getTime();
      return (
        itemTime < cursorTime ||
        (itemTime === cursorTime && item.id.localeCompare(cursorReport.id) < 0)
      );
    });
  }

  const pageItems = afterCursor.slice(0, query.limit);
  const hasMore = afterCursor.length > query.limit;
  const nextCursor =
    hasMore && pageItems.length > 0
      ? pageItems[pageItems.length - 1].id
      : null;

  return {
    items: pageItems,
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
    ? decodeReportDocument(reportSnap.data() as DocumentData)
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
    ...toSerializedReport(reportSnap.id, reportData as EncryptedReportData),
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

    const currentData = decodeReportDocument(reportSnap.data() as DocumentData);
    const fromStatus = currentData.status;
    const toStatus = input.status;

    assertValidStatusTransition(fromStatus, toStatus, input.note);

    const now = new Date();
    const resolvedAt = toStatus === 'resolved' ? now.toISOString() : null;
    const updatedPayload: EncryptedReportData = {
      reporterId: currentData.reporterId,
      category: currentData.category,
      incidentAt: toIsoStringOrNull(currentData.incidentAt),
      location: currentData.location,
      description: currentData.description,
      status: toStatus,
      createdAt: toIsoDateString(currentData.createdAt),
      updatedAt: now.toISOString(),
      resolvedAt,
    };

    const updatedDoc: ReportDocument = {
      encryptedData: encryptJson<EncryptedReportData>(updatedPayload),
    };

    tx.set(reportRef, updatedDoc);

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

    return toSerializedReport(reportId, updatedPayload);
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

  const snap = await db.collection('reports').get();
  let total = 0;

  for (const doc of snap.docs) {
    const decoded = decodeReportDocument(doc.data());
    if (authorized.role === 'reporter' && decoded.reporterId !== authorized.uid) {
      continue;
    }
    const status = decoded.status;
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
