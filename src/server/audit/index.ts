/**
 * SISKA — Server Audit Module (`src/server/audit`)
 * Sumber otoritas:
 * - docs/01-SRS.md FR-013, NFR-OBS-01
 * - docs/02-ERD.md §4 (`auditEvents`)
 * - docs/05-BACKEND-ARCHITECTURE.md §3 (`server/audit/`)
 */

export {
  type AuditAction,
  type CreateAuditEventInput,
  type SerializedAuditEvent,
  type PaginatedAuditEventsResult,
  buildAuditEventData,
  recordAuditEventInTransaction,
  recordAuditEventInBatch,
  recordAuditEvent,
  listAuditEvents,
} from '@/server/services/audit.service';

