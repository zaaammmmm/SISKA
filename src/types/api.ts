/**
 * SISKA — Standalone HTTP API Request & Response DTO Contracts (`src/types/api.ts`)
 * Sumber otoritas:
 * - docs/04-API-SPEC.yaml (OpenAPI 3.1.0 `/api/v1`)
 * - docs/05-BACKEND-ARCHITECTURE.md §3 (`types/{api,domain}/`) & §8 (Error Contract)
 *
 * Prinsip Arsitektur Bersih:
 * Modul ini berdiri 100% mandiri (hanya bergantung pada primitif `@/types/domain`)
 * dan TIDAK mengimpor dari `@/server/**`. Baik Frontend (`src/lib/api-client.ts`)
 * maupun Backend (`src/server/services/**`) mengacu pada kontrak DTO tunggal ini.
 */

import type {
  AuditEventDocument,
  ConversationStatus,
  EvidenceContentType,
  KBDocumentStatus,
  ReportStatus,
  UserRole,
} from '@/types/domain';

/* ========================================================================== */
/* 1. Standard Error & Envelope Contracts (docs/04-API-SPEC.yaml & §8)        */
/* ========================================================================== */

export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'UPLOAD_REJECTED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Rincian kesalahan validasi per-field yang aman (tanpa memantulkan nilai sensitif input) */
export type ApiErrorFieldMap = Record<string, string>;

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  requestId: string;
  /** Opsional: peta nama field -> pesan kesalahan validasi pada HTTP 400 VALIDATION_ERROR */
  fields?: ApiErrorFieldMap;
}

/**
 * Amplop respons standar untuk seluruh endpoint daftar/koleksi (`GET /reports`, `/conversations`, dll.).
 * Selaras dengan `ReportPage` pada `docs/04-API-SPEC.yaml`.
 */
export interface PaginatedResponse<TItem> {
  items: TItem[];
  nextCursor: string | null;
}

/* ========================================================================== */
/* 2. User Profile DTOs (`/api/v1/profile`)                                   */
/* ========================================================================== */

export interface SerializedUserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

/* ========================================================================== */
/* 3. Reports & Status History DTOs (`/api/v1/reports`)                       */
/* ========================================================================== */

export interface SerializedReport {
  id: string;
  reporterId: string;
  category: string;
  incidentAt: string | null;
  location: string | null;
  description: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface SerializedEvidenceItem {
  id: string;
  originalName: string;
  contentType: EvidenceContentType;
  sizeBytes: number;
  sha256: string | null;
  uploadedBy: string;
  createdAt: string;
}

export interface SerializedStatusHistoryItem {
  id: string;
  fromStatus: ReportStatus | null;
  toStatus: ReportStatus;
  actorUid: string;
  note: string | null;
  createdAt: string;
}

export interface SerializedReportDetail extends SerializedReport {
  evidence: SerializedEvidenceItem[];
  statusHistory: SerializedStatusHistoryItem[];
}

export type PaginatedReportsResult = PaginatedResponse<SerializedReport>;

export interface ReportsSummaryResult {
  scope: 'reporter_own' | 'admin_global';
  total: number;
  byStatus: Record<ReportStatus, number>;
}

/* ========================================================================== */
/* 4. Evidence Upload & Signed Download DTOs (`/api/v1/reports/{id}/evidence`)*/
/* ========================================================================== */

export interface CreateEvidenceResult {
  status: 'committed' | 'upload_pending';
  evidenceId: string;
  storagePath: string;
  evidence?: SerializedEvidenceItem;
  uploadUrl?: string;
  expiresInSeconds?: number;
}

export interface SignedDownloadUrlResult {
  url: string;
  expiresInSeconds: number;
}

/* ========================================================================== */
/* 5. Conversations & Messages DTOs (`/api/v1/conversations`)                 */
/* ========================================================================== */

export interface SerializedConversation {
  id: string;
  type: 'report_admin';
  /** Nama field kanonis Firestore & seeder (`reporterId`) */
  reporterId: string;
  /** Alias kompatibilitas dengan tabel docs/02-ERD.md (`reporterUid`) */
  reporterUid: string;
  /** Nama field kanonis Firestore & seeder (`assignedAdminId`) */
  assignedAdminId: string | null;
  /** Alias kompatibilitas dengan tabel docs/02-ERD.md (`adminUid`) */
  adminUid: string | null;
  reportId: string | null;
  status: ConversationStatus;
  createdAt: string;
  updatedAt: string;
}

export type PaginatedConversationsResult =
  PaginatedResponse<SerializedConversation>;

export interface SerializedMessage {
  id: string;
  senderUid: string;
  body: string;
  createdAt: string;
  attachmentPath: string | null;
}

export type PaginatedMessagesResult = PaginatedResponse<SerializedMessage>;

/* ========================================================================== */
/* 6. SISKA AI Assistant DTOs (`/api/v1/ai/chat`)                             */
/* ========================================================================== */

export interface AiCitationSource {
  documentId: string;
  title: string;
  page: number;
}

export interface AiChatResponse {
  answer: string;
  grounded: boolean;
  sources: AiCitationSource[];
  escalationMessage: string | null;
}

/* ========================================================================== */
/* 7. Admin Knowledge Base & Audit DTOs (`/api/v1/admin/*`)                   */
/* ========================================================================== */

export interface SerializedKnowledgeDocument {
  id: string;
  title: string;
  sourceUrl: string | null;
  sha256: string;
  uploadedBy: string;
  status: KBDocumentStatus;
  chunkCount: number;
  version: number;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PaginatedKnowledgeDocumentsResult =
  PaginatedResponse<SerializedKnowledgeDocument>;

export interface KnowledgeReindexResult {
  status: 'completed' | 'queued';
  processedCount: number;
  indexedCount: number;
  failedCount: number;
  requestId: string;
}

export interface SerializedAuditEvent {
  id: string;
  actorUid: string;
  action: string;
  targetType: AuditEventDocument['targetType'];
  targetId: string;
  occurredAt: string;
  requestId: string;
}

export type PaginatedAuditEventsResult = PaginatedResponse<SerializedAuditEvent>;
