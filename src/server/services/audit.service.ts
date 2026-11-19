// Layanan Domain Audit

import type {
  DocumentData,
  Query,
  Transaction,
  WriteBatch,
} from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { toIsoDateString } from '@/lib/firebase/firestore';
import { requireAdmin } from '@/server/authz/permissions';
import type { AuthenticatedCaller } from '@/server/authz/verify-token';
import { ApiError } from '@/server/errors/api-error';
import type { PaginationParams } from '@/server/validators/common';
import type {
  PaginatedAuditEventsResult,
  SerializedAuditEvent,
} from '@/types/api';
import type { AuditEventDocument } from '@/types/domain';

export type { PaginatedAuditEventsResult, SerializedAuditEvent };

export type AuditAction =
  | 'user.role_provisioned'
  | 'user.profile_updated'
  | 'report.created'
  | 'report.status_changed'
  | 'evidence.uploaded'
  | 'evidence.downloaded'
  | 'conversation.updated'
  | 'kb.document_uploaded'
  | 'kb.document_deleted'
  | 'kb.documents_reset'
  | 'kb.reindex_requested'
  | 'education.created'
  | 'education.updated'
  | 'education.deleted'
  | 'notification.broadcast';

export interface CreateAuditEventInput {
  actorUid: string;
  action: AuditAction;
  targetType: AuditEventDocument['targetType'];
  targetId: string;
  requestId: string;
  occurredAt?: Date;
}

// Serialisasi Dokumen Audit
function serializeAuditDoc(
  id: string,
  data: DocumentData,
): SerializedAuditEvent {
  return {
    id,
    actorUid: String(data.actorUid ?? ''),
    action: String(data.action ?? ''),
    targetType: data.targetType as AuditEventDocument['targetType'],
    targetId: String(data.targetId ?? ''),
    occurredAt: toIsoDateString(data.occurredAt),
    requestId: String(data.requestId ?? ''),
  };
}

// Pembentukan Objek Audit
export function buildAuditEventData(
  input: CreateAuditEventInput,
): AuditEventDocument {
  return {
    actorUid: input.actorUid,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    occurredAt: input.occurredAt ?? new Date(),
    requestId: input.requestId,
  };
}

// Audit dalam Transaksi
export function recordAuditEventInTransaction(
  tx: Transaction,
  input: CreateAuditEventInput,
): string {
  const db = getAdminDb();
  const auditRef = db.collection('auditEvents').doc();
  tx.create(auditRef, buildAuditEventData(input));
  return auditRef.id;
}

// Audit dalam Batch
export function recordAuditEventInBatch(
  batch: WriteBatch,
  input: CreateAuditEventInput,
): string {
  const db = getAdminDb();
  const auditRef = db.collection('auditEvents').doc();
  batch.create(auditRef, buildAuditEventData(input));
  return auditRef.id;
}

// Pencatatan Audit Mandiri
export async function recordAuditEvent(
  input: CreateAuditEventInput,
): Promise<string> {
  const db = getAdminDb();
  const auditRef = db.collection('auditEvents').doc();
  await auditRef.create(buildAuditEventData(input));
  return auditRef.id;
}

// Daftar Riwayat Audit
export async function listAuditEvents(
  caller: AuthenticatedCaller,
  pagination: PaginationParams,
): Promise<PaginatedAuditEventsResult> {
  requireAdmin(caller);
  const db = getAdminDb();

  let fsQuery: Query = db
    .collection('auditEvents')
    .orderBy('occurredAt', 'desc');

  if (pagination.cursor) {
    const cursorSnap = await db
      .collection('auditEvents')
      .doc(pagination.cursor)
      .get();
    if (!cursorSnap.exists) {
      const msg = "Parameter 'cursor' audit tidak valid.";
      throw ApiError.validation(msg, { cursor: msg });
    }
    fsQuery = fsQuery.startAfter(cursorSnap);
  }

  const snap = await fsQuery.limit(pagination.limit + 1).get();
  const hasMore = snap.docs.length > pagination.limit;
  const pageDocs = hasMore
    ? snap.docs.slice(0, pagination.limit)
    : snap.docs;

  const items = pageDocs.map((doc) => serializeAuditDoc(doc.id, doc.data()));
  const nextCursor =
    hasMore && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1].id : null;

  return {
    items,
    nextCursor,
  };
}
