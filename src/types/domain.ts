/**
 * SISKA — Canonical Domain & Database Types
 * Sumber otoritas: docs/01-SRS.md, docs/02-ERD.md, docs/04-API-SPEC.yaml, seed-data.mjs
 */

export const USER_ROLES = ['reporter', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const REPORT_STATUSES = [
  'submitted',
  'under_review',
  'in_progress',
  'resolved',
  'rejected',
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * Aturan transisi status laporan sesuai docs/01-SRS.md §7 & seed-data.mjs
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<ReportStatus, readonly ReportStatus[]> = {
  submitted: ['under_review'],
  under_review: ['in_progress', 'resolved', 'rejected'],
  in_progress: ['resolved', 'under_review'],
  resolved: ['under_review'],
  rejected: ['under_review'],
};

/**
 * Menentukan apakah perubahan dari `from` ke `to` wajib menyertakan alasan/catatan (`note`).
 * Sesuai SRS §7: penolakan (`rejected`) atau pengembalian/pembukaan ulang ke `under_review` wajib menyertakan catatan.
 */
export function isStatusNoteRequired(from: ReportStatus, to: ReportStatus): boolean {
  return to === 'rejected' || (to === 'under_review' && from !== 'submitted');
}

export const ALLOWED_EVIDENCE_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;
export type EvidenceContentType = (typeof ALLOWED_EVIDENCE_CONTENT_TYPES)[number];

/** Batas ukuran unggahan bukti awal: 5 MiB (docs/04-API-SPEC.yaml & docs/05-BACKEND-ARCHITECTURE.md §5) */
export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;

/** Durasi kedaluwarsa Signed URL bukti: maksimal 300 detik / 5 menit (docs/04-API-SPEC.yaml) */
export const EVIDENCE_SIGNED_URL_EXPIRES_SECONDS = 300;

export const KB_DOCUMENT_STATUSES = ['processing', 'indexed', 'failed'] as const;
export type KBDocumentStatus = (typeof KB_DOCUMENT_STATUSES)[number];

export const CONVERSATION_STATUSES = ['open', 'closed'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

// ── Dokumen Firestore (docs/02-ERD.md §4) ──────────────────────────────────

export interface UserDocument {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ReportDocument {
  reporterId: string;
  category: string;
  incidentAt: Date | string | null;
  location: string | null;
  description: string;
  status: ReportStatus;
  createdAt: Date | string;
  updatedAt: Date | string;
  resolvedAt?: Date | string | null;
}

export interface EvidenceDocument {
  storagePath: string;
  originalName: string;
  contentType: EvidenceContentType;
  sizeBytes: number;
  sha256?: string;
  uploadedBy: string;
  createdAt: Date | string;
}

export interface StatusHistoryDocument {
  fromStatus: ReportStatus | null;
  toStatus: ReportStatus;
  actorUid: string;
  note?: string | null;
  createdAt: Date | string;
}

export interface ConversationDocument {
  type: 'report_admin';
  reporterId: string;
  assignedAdminId: string | null;
  reportId: string | null;
  status: ConversationStatus;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface MessageDocument {
  senderUid: string;
  body: string;
  createdAt: Date | string;
  attachmentPath?: string | null;
}

export interface KnowledgeDocument {
  title: string;
  sourceUrl?: string | null;
  storagePath: string;
  sha256: string;
  uploadedBy: string;
  status: KBDocumentStatus;
  chunkCount: number;
  version: number;
  errorCode?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface KnowledgeChunkDocument {
  documentId: string;
  documentVersion: number;
  chunkIndex: number;
  page: number;
  section?: string | null;
  text: string;
  createdAt: Date | string;
}

export interface AuditEventDocument {
  actorUid: string;
  action: string;
  targetType: 'user' | 'report' | 'evidence' | 'conversation' | 'knowledgeDocument';
  targetId: string;
  occurredAt: Date | string;
  requestId: string;
}

