// Kontrak DTO API

import type {
  AuditEventDocument,
  ConversationStatus,
  EducationCategory,
  EducationIcon,
  EvidenceContentType,
  KBDocumentStatus,
  NotificationTargetType,
  NotificationType,
  ReportStatus,
  UserRole,
} from '@/types/domain';

// Kontrak Error & Paginasi
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
export type ApiErrorFieldMap = Record<string, string>;

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  requestId: string;
  fields?: ApiErrorFieldMap;
}

export interface PaginatedResponse<TItem> {
  items: TItem[];
  nextCursor: string | null;
}

// DTO Profil Pengguna
export interface SerializedUserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  photoUrl?: string | null;
}

// DTO Laporan & Riwayat
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

// DTO Bukti Laporan
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
  previewUrl?: string | null;
  blurredPreviewUrl?: string | null;
}

// DTO Percakapan & Pesan
export interface SerializedConversation {
  id: string;
  type: 'report_admin';
  reporterId: string;
  reporterUid: string;
  assignedAdminId: string | null;
  adminUid: string | null;
  reportId: string | null;
  status: ConversationStatus;
  createdAt: string;
  updatedAt: string;
  lastMessage?: string | null;
  lastMessageSenderUid?: string | null;
  lastMessageAt?: string | null;
  unreadCount: number;
}

export type PaginatedConversationsResult =
  PaginatedResponse<SerializedConversation>;

export interface SerializedMessage {
  id: string;
  senderUid: string;
  body: string;
  createdAt: string;
  attachmentPath: string | null;
  readByRecipient: boolean;
}

export type PaginatedMessagesResult = PaginatedResponse<SerializedMessage>;

// DTO Asisten AI
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

export interface SerializedAiRagDocument {
  file: string;
  cite: string;
  chunkCount: number;
  source: 'notebook' | 'web';
}

// DTO Knowledge Base & Audit
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

// DTO Materi Edukasi
export interface SerializedEducationItem {
  id: string;
  slug: string;
  title: string;
  tag: string;
  category: EducationCategory;
  icon: EducationIcon;
  excerpt: string;
  content: string;
  readingTimeMinutes: number;
  isPublished: boolean;
  sortOrder: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  coverImageUrl?: string | null;
}

export type PaginatedEducationResult = PaginatedResponse<SerializedEducationItem>;

// DTO Notifikasi In-App
export interface SerializedNotificationItem {
  id: string;
  recipientUid: string;
  type: NotificationType;
  title: string;
  body: string;
  targetType: NotificationTargetType;
  targetId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export type PaginatedNotificationsResult =
  PaginatedResponse<SerializedNotificationItem>;

/**
 * Semua hitungan sudah dideduplikasi per sumber:
 * - `unreadReportCount`       = jumlah LAPORAN berbeda yang punya pembaruan belum dibaca.
 * - `unreadConversationCount` = jumlah PENGGUNA berbeda yang pesannya belum dibaca
 *                               (bukan jumlah pesan).
 * - `unreadCount`             = total badge lonceng (laporan + pengguna + notifikasi lain).
 */
export interface UnreadNotificationCountResult {
  unreadCount: number;
  unreadReportCount: number;
  unreadConversationCount: number;
}

export interface MarkNotificationsByTargetResult {
  markedCount: number;
}

export interface BroadcastNotificationResult {
  sentCount: number;
  targetRole: string;
  requestId: string;
}
