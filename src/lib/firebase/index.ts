/**
 * SISKA — Firebase Adapter Barrel (`src/lib/firebase`)
 *
 * Catatan Arsitektur (docs/05-BACKEND-ARCHITECTURE.md §3 & NFR-SEC-02):
 * - Untuk komponen Client/UI (`"use client"`), impor dari `@/lib/firebase/client` atau `@/lib/firebase`.
 * - Untuk Route Handlers & Domain Services di Server, impor dari:
 *   - `@/lib/firebase/admin`
 *   - `@/lib/firebase/auth`
 *   - `@/lib/firebase/firestore`
 *   - `@/lib/firebase/storage`
 */

export {
  firebaseConfigured,
  firebaseApp,
  auth,
  db,
  storage,
} from '@/lib/firebase/client';

