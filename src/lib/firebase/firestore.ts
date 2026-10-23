/**
 * SISKA — Server-Side Firestore Schema, Collection Registry, & Timestamp Helpers
 * Sumber otoritas:
 * - docs/02-ERD.md (Struktur koleksi & subkoleksi Firestore)
 * - docs/05-BACKEND-ARCHITECTURE.md §3 (`src/lib/firebase/firestore.ts`)
 */

import { getAdminDb } from '@/lib/firebase/admin';

/**
 * Nama koleksi & subkoleksi kanonis sesuai `docs/02-ERD.md`.
 * Digunakan sebagai satu sumber kebenaran agar seluruh layanan backend konsisten.
 */
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
} as const;

/**
 * Helper terpusat untuk mengakses referensi koleksi dan subkoleksi Firestore.
 */
export const firestoreCollections = {
  users: () => getAdminDb().collection(FIRESTORE_COLLECTIONS.USERS),
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
} as const;

/**
 * Mengonversi nilai waktu Firestore (`Timestamp`, `Date`, atau string ISO) menjadi string ISO-8601 atau `null`.
 * Digunakan secara terpusat oleh seluruh domain service untuk mencegah duplikasi logika serialisasi waktu.
 */
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

/**
 * Mengonversi nilai waktu Firestore menjadi string ISO-8601 yang dijamin non-null.
 */
export function toIsoDateString(value: unknown): string {
  return toIsoStringOrNull(value) ?? new Date(0).toISOString();
}
