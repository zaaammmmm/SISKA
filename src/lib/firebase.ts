import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';

const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';

const config = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    (useEmulator ? 'demo-siska-emulator-key' : undefined),
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    (useEmulator ? 'demo-siska.firebaseapp.com' : undefined),
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    (useEmulator ? 'demo-siska' : undefined),
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    (useEmulator ? 'demo-siska.appspot.com' : undefined),
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
    (useEmulator ? '000000000000' : undefined),
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    (useEmulator ? '1:000000000000:web:demosiska' : undefined),
};

const configured = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId,
);

export const firebaseConfigured = configured;
export const firebaseApp: FirebaseApp | null = configured
  ? getApps().length
    ? getApp()
    : initializeApp(config)
  : null;

export const auth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;
export const db: Firestore | null = firebaseApp ? getFirestore(firebaseApp) : null;
export const storage: FirebaseStorage | null = firebaseApp
  ? getStorage(firebaseApp)
  : null;

// Bridge idempoten ke Firebase Emulator Suite lokal (Auth 9099, Firestore 8080, Storage 9199)
const globalForEmulator = globalThis as unknown as {
  __siskaClientEmulatorsConnected?: boolean;
};

if (useEmulator && firebaseApp && !globalForEmulator.__siskaClientEmulatorsConnected) {
  globalForEmulator.__siskaClientEmulatorsConnected = true;
  try {
    if (auth) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    }
    if (db) {
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
    }
    if (storage) {
      connectStorageEmulator(storage, '127.0.0.1', 9199);
    }
  } catch {
    // Abaikan jika emulator sudah terhubung pada saat Hot Module Replacement (HMR)
  }
}
