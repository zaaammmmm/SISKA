import {
  initializeApp,
  getApps,
  getApp,
  cert,
  applicationDefault,
  type App,
  type AppOptions,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage, type Storage } from 'firebase-admin/storage';

if (typeof window !== 'undefined') {
  throw new Error(
    '[SISKA Security Violation] src/lib/firebase/admin.ts tidak boleh diimpor di sisi browser/client.',
  );
}

export interface EmulatorConfigStatus {
  isEmulator: boolean;
  projectId: string;
  storageBucket: string;
  firestoreHost?: string;
  authHost?: string;
  storageHost?: string;
}

// Firebase Admin Config
export function resolveAdminConfig(): EmulatorConfigStatus {
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST?.trim() || undefined;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST?.trim() || undefined;
  const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST?.trim() || undefined;

  const hasAnyEmulator = Boolean(firestoreHost || authHost || storageHost);
  const hasCoreEmulators = Boolean(firestoreHost && authHost);

  if (hasAnyEmulator && !hasCoreEmulators) {
    throw new Error(
      '[SISKA Config Error] Konfigurasi Firebase Emulator tidak lengkap: ' +
        'FIRESTORE_EMULATOR_HOST dan FIREBASE_AUTH_EMULATOR_HOST harus keduanya diatur (atau keduanya dikosongkan).',
    );
  }

  const isEmulator = hasCoreEmulators;

  const projectId =
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    (isEmulator ? 'demo-siska' : '');

  if (!projectId) {
    throw new Error(
      '[SISKA Config Error] FIREBASE_PROJECT_ID belum dikonfigurasi pada environment server.',
    );
  }

  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    process.env.SEED_STORAGE_BUCKET?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() ||
    `${projectId}.appspot.com`;

  return {
    isEmulator,
    projectId,
    storageBucket,
    firestoreHost,
    authHost,
    storageHost,
  };
}

// Firebase Admin App
export function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApp();
  }

  const cfg = resolveAdminConfig();
  const options: AppOptions = {
    projectId: cfg.projectId,
    storageBucket: cfg.storageBucket,
  };

  if (!cfg.isEmulator) {
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
    const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (clientEmail && rawPrivateKey) {
      options.credential = cert({
        projectId: cfg.projectId,
        clientEmail,
        privateKey: rawPrivateKey.replace(/\\n/g, '\n'),
      });
    } else {
      options.credential = applicationDefault();
    }
  }

  return initializeApp(options);
}

// Firebase Admin Auth
export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

// Firestore Admin
export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}

// Cloud Storage Admin
export function getAdminStorage(): Storage {
  return getStorage(getAdminApp());
}

// Default Storage Bucket
export function getAdminBucket() {
  const cfg = resolveAdminConfig();
  return getAdminStorage().bucket(cfg.storageBucket);
}

// Emulator Mode Check
export function isFirebaseEmulatorMode(): boolean {
  return resolveAdminConfig().isEmulator;
}
