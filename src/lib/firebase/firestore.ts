import { getAdminDb } from '@/lib/firebase/admin';

// Koleksi Firestore
export const FIRESTORE_COLLECTIONS = {
  USERS: 'users',
  REPORTS: 'reports',
  REPORT_STATUS_HISTORY: 'statusHistory',
  REPORT_EVIDENCE: 'evidence',
  CONVERSATIONS: 'conversations',
  CONVERSATION_MESSAGES: 'messages',
  KNOWLEDGE_DOCUMENTS: 'knowledgeDocuments',
  KNOWLEDGE_CHUNKS: 'knowledgeChunks',
  AUDIT_EVENTS: 'auditEvents',
  EDUCATION: 'education',
  NOTIFICATIONS: 'notifications',
} as const;

// Referensi Koleksi
export const firestoreCollections = {
  users: () => getAdminDb().collection(FIRESTORE_COLLECTIONS.USERS),
  userNotifications: (uid: string) =>
    getAdminDb()
      .collection(FIRESTORE_COLLECTIONS.USERS)
      .doc(uid)
      .collection(FIRESTORE_COLLECTIONS.NOTIFICATIONS),
  reports: () => getAdminDb().collection(FIRESTORE_COLLECTIONS.REPORTS),
  reportStatusHistory: (reportId: string) =>
    getAdminDb()
      .collection(FIRESTORE_COLLECTIONS.REPORTS)
      .doc(reportId)
      .collection(FIRESTORE_COLLECTIONS.REPORT_STATUS_HISTORY),
  reportEvidence: (reportId: string) =>
    getAdminDb()
      .collection(FIRESTORE_COLLECTIONS.REPORTS)
      .doc(reportId)
      .collection(FIRESTORE_COLLECTIONS.REPORT_EVIDENCE),
  conversations: () =>
    getAdminDb().collection(FIRESTORE_COLLECTIONS.CONVERSATIONS),
  conversationMessages: (conversationId: string) =>
    getAdminDb()
      .collection(FIRESTORE_COLLECTIONS.CONVERSATIONS)
      .doc(conversationId)
      .collection(FIRESTORE_COLLECTIONS.CONVERSATION_MESSAGES),
  knowledgeDocuments: () =>
    getAdminDb().collection(FIRESTORE_COLLECTIONS.KNOWLEDGE_DOCUMENTS),
  knowledgeChunks: () =>
    getAdminDb().collection(FIRESTORE_COLLECTIONS.KNOWLEDGE_CHUNKS),
  auditEvents: () =>
    getAdminDb().collection(FIRESTORE_COLLECTIONS.AUDIT_EVENTS),
  education: () =>
    getAdminDb().collection(FIRESTORE_COLLECTIONS.EDUCATION),
} as const;

// Helper Konversi Waktu
export function toIsoStringOrNull(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return null;
}

export function toIsoDateString(value: unknown): string {
  return toIsoStringOrNull(value) ?? new Date(0).toISOString();
}
