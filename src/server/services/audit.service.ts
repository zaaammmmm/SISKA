/**
 * SISKA — Audit Event Domain Service (`AuditService`)
 * Sumber otoritas:
 * - docs/01-SRS.md FR-013, NFR-OBS-01
 * - docs/02-ERD.md §4 (`auditEvents`: actorUid, action, targetType, targetId, occurredAt, requestId)
 * - docs/05-BACKEND-ARCHITECTURE.md §4.7 & §6
 * - docs/08-AUTHORIZATION-MATRIX.md ("Audit events: Reporter Deny, Admin Restricted read; no client writes")
 * - docs/09-TEST-PLAN.md PRIV-01 ("No secrets, evidence, report narrative or raw sensitive transcript")
 */

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
  | 'kb.reindex_requested';

export interface CreateAuditEventInput {
  actorUid: string;
  action: AuditAction;
  targetType: AuditEventDocument['targetType'];
  targetId: string;
  requestId: string;
  occurredAt?: Date;
}

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

/**
 * Membangun objek dokumen `auditEvents` yang hanya memuat 6 kunci kanonis
 * sesuai `ALLOWED_KEYS.auditEvents` pada `seed-data.mjs` dan `docs/02-ERD.md §4`.
 */
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

/**
 * Menambahkan dokumen `auditEvents` di dalam suatu Firestore `Transaction` yang sedang berlangsung.
 */
export function recordAuditEventInTransaction(
  tx: Transaction,
  input: CreateAuditEventInput,
): string {
  const db = getAdminDb();
  const auditRef = db.collection('auditEvents').doc();
  tx.create(auditRef, buildAuditEventData(input));
  return auditRef.id;
}

/**
 * Menambahkan dokumen `auditEvents` di dalam suatu Firestore `WriteBatch`.
 */
export function recordAuditEventInBatch(
  batch: WriteBatch,
  input: CreateAuditEventInput,
): string {
  const db = getAdminDb();
  const auditRef = db.collection('auditEvents').doc();
  batch.create(auditRef, buildAuditEventData(input));
  return auditRef.id;
}

/**
 * Mencatat dokumen `auditEvents` secara mandiri di Firestore.
 */
export async function recordAuditEvent(
  input: CreateAuditEventInput,
): Promise<string> {
  const db = getAdminDb();
  const auditRef = db.collection('auditEvents').doc();
  await auditRef.create(buildAuditEventData(input));
  return auditRef.id;
}

/**
 * Mengambil daftar riwayat `auditEvents` berpaginasi (`GET /api/v1/admin/audit-events`).
 * Hanya dapat diakses oleh Admin dengan Custom Claim terverifikasi (FR-013 & 08-AUTHORIZATION-MATRIX.md).
 */
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
