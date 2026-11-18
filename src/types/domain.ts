// Tipe Domain & Database

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

// Aturan Transisi Status
export const ALLOWED_STATUS_TRANSITIONS: Record<ReportStatus, readonly ReportStatus[]> = {
  submitted: ['under_review'],
  under_review: ['in_progress', 'resolved', 'rejected'],
  in_progress: ['resolved', 'under_review'],
  resolved: ['under_review'],
  rejected: ['under_review'],
};

// Cek Kewajiban Catatan
export function isStatusNoteRequired(from: ReportStatus, to: ReportStatus): boolean {
  return to === 'rejected' || (to === 'under_review' && from !== 'submitted');
}

export const ALLOWED_EVIDENCE_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;
export type EvidenceContentType = (typeof ALLOWED_EVIDENCE_CONTENT_TYPES)[number];

// Konstanta Bukti
export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export const EVIDENCE_SIGNED_URL_EXPIRES_SECONDS = 300;

export const KB_DOCUMENT_STATUSES = ['processing', 'indexed', 'failed'] as const;
export type KBDocumentStatus = (typeof KB_DOCUMENT_STATUSES)[number];

export const CONVERSATION_STATUSES = ['open', 'closed'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

// Dokumen Firestore
export interface UserDocument {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  createdAt: Date | string;
  updatedAt: Date | string;
  avatarPath?: string | null;
  photoUrl?: string | null;
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
  lastMessage?: string;
  lastMessageSenderUid?: string;
  lastMessageAt?: Date | string;
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

export const EDUCATION_CATEGORIES = ['general', 'guide'] as const;
export type EducationCategory = (typeof EDUCATION_CATEGORIES)[number];

export const EDUCATION_ICONS = ['heart', 'alert', 'users', 'shield'] as const;
export type EducationIcon = (typeof EDUCATION_ICONS)[number];

export interface EducationDocument {
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
  createdAt: Date | string;
  updatedAt: Date | string;
  coverImageUrl?: string | null;
  coverStoragePath?: string | null;
}

export const NOTIFICATION_TYPES = [
  'report_status_changed',
  'new_report_submitted',
  'new_chat_message',
  'system_announcement',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TARGET_TYPES = [
  'report',
  'conversation',
  'education',
  'none',
] as const;
export type NotificationTargetType = (typeof NOTIFICATION_TARGET_TYPES)[number];

export interface NotificationDocument {
  recipientUid: string;
  type: NotificationType;
  title: string;
  body: string;
  targetType: NotificationTargetType;
  targetId: string | null;
  /**
   * UID pengirim peristiwa (mis. pelapor yang mengirim chat). Dipakai agar badge
   * menghitung jumlah PENGGUNA yang punya pesan belum dibaca, bukan jumlah pesan.
   */
  senderUid?: string | null;
  isRead: boolean;
  readAt: Date | string | null;
  createdAt: Date | string;
}

export interface AuditEventDocument {
  actorUid: string;
  action: string;
  targetType:
    | 'user'
    | 'report'
    | 'evidence'
    | 'conversation'
    | 'knowledgeDocument'
    | 'education'
    | 'notification';
  targetId: string;
  occurredAt: Date | string;
  requestId: string;
}
