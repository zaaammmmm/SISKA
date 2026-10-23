/**
 * SISKA — Firebase Client SDK Adapter
 * Re-export dari src/lib/firebase.ts agar sesuai struktur kanonis docs/05-BACKEND-ARCHITECTURE.md §3
 * sekaligus menjaga kompatibilitas impor komponen UI yang sudah ada.
 */

export {
  firebaseConfigured,
  firebaseApp,
  auth,
  db,
  storage,
} from '@/lib/firebase';

