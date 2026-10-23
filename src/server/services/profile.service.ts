/**
 * SISKA — User Profile Domain Service (`ProfileService`)
 * Sumber otoritas:
 * - docs/01-SRS.md FR-002, FR-004, FR-014
 * - docs/02-ERD.md §4 (`users`: uid, displayName, email, role, createdAt, updatedAt)
 * - docs/04-API-SPEC.yaml (/profile GET & PATCH)
 * - docs/08-AUTHORIZATION-MATRIX.md ("User profile: Reporter (own) R/U allowlisted fields")
 * - docs/09-TEST-PLAN.md AUTH-01, AUTH-04
 */

import type { DocumentData } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { toIsoDateString } from '@/lib/firebase/firestore';
import {
  INDISTINGUISHABLE_NOT_FOUND_MESSAGE,
  requireAuthorizedUser,
} from '@/server/authz/permissions';
import type { AuthenticatedCaller } from '@/server/authz/verify-token';
import { ApiError } from '@/server/errors/api-error';
import {
  recordAuditEventInBatch,
  recordAuditEventInTransaction,
} from '@/server/services/audit.service';
import type { UpdateProfileInput } from '@/server/validators/profile.validator';
import type { SerializedUserProfile } from '@/types/api';
import type { UserDocument, UserRole } from '@/types/domain';

export type { SerializedUserProfile };

function serializeUserDoc(
  uid: string,
  data: DocumentData,
): SerializedUserProfile {
  return {
    uid: String(data.uid ?? uid),
    displayName: String(data.displayName ?? ''),
    email: String(data.email ?? ''),
    role: (data.role as UserRole) ?? 'reporter',
    createdAt: toIsoDateString(data.createdAt),
    updatedAt: toIsoDateString(data.updatedAt),
  };
}

/**
 * Mengambil profil pengguna aktif (`GET /api/v1/profile`).
 * Menolak setiap akun tanpa hak akses sah (`requireAuthorizedUser`) secara murni berdasarkan RBAC.
 */
export async function getMyProfile(
  caller: AuthenticatedCaller,
): Promise<SerializedUserProfile> {
  const authorized = requireAuthorizedUser(caller);
  const db = getAdminDb();
  const userRef = db.collection('users').doc(authorized.uid);
  const snap = await userRef.get();

  if (!snap.exists) {
    throw ApiError.notFound(INDISTINGUISHABLE_NOT_FOUND_MESSAGE);
  }

  return serializeUserDoc(authorized.uid, snap.data() as DocumentData);
}

/**
 * Memperbarui field profil yang diizinkan (`PATCH /api/v1/profile`).
 *
 * Aturan Keamanan (FR-004, FR-014, AUTH-04, 08-AUTHORIZATION-MATRIX.md):
 * - Wajib lolos `requireAuthorizedUser(caller)` (tanpa hardcoded UID akun uji apa pun).
 * - Akun yang tidak memiliki Custom Claim role maupun dokumen profil `users/{uid}`
 *   otomatis ditolak dengan `403 FORBIDDEN`.
 * - Hanya `displayName` dan `updatedAt` yang dapat diperbarui; `role`, `uid`, `email`, dan `createdAt` dikunci.
 */
export async function updateMyProfile(
  caller: AuthenticatedCaller,
  input: UpdateProfileInput,
  requestId: string,
): Promise<SerializedUserProfile> {
  const authorized = requireAuthorizedUser(caller);
  const db = getAdminDb();
  const userRef = db.collection('users').doc(authorized.uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) {
      throw ApiError.notFound(INDISTINGUISHABLE_NOT_FOUND_MESSAGE);
    }

    const existingData = snap.data() as UserDocument;
    const now = new Date();

    tx.update(userRef, {
      displayName: input.displayName,
      updatedAt: now,
    });

    recordAuditEventInTransaction(tx, {
      actorUid: authorized.uid,
      action: 'user.profile_updated',
      targetType: 'user',
      targetId: authorized.uid,
      requestId,
      occurredAt: now,
    });

    return serializeUserDoc(authorized.uid, {
      ...existingData,
      displayName: input.displayName,
      updatedAt: now,
    });
  });
}

/**
 * Menginisialisasi profil `reporter` baru saat registrasi awal (`POST /api/v1/profile`).
 * Hanya dapat dijalankan satu kali bila dokumen `users/{uid}` belum ada, menetapkan
 * `role: 'reporter'` secara eksklusif dari sisi server (FR-002, FR-004, AUTH-01).
 */
export async function provisionReporterProfile(
  caller: AuthenticatedCaller,
  input: UpdateProfileInput,
  requestId: string,
): Promise<SerializedUserProfile> {
  const db = getAdminDb();
  const userRef = db.collection('users').doc(caller.uid);
  const existingSnap = await userRef.get();

  if (existingSnap.exists) {
    throw ApiError.conflict('Profil untuk akun ini sudah terdaftar.');
  }

  const now = new Date();
  const newProfile: UserDocument = {
    uid: caller.uid,
    displayName: input.displayName,
    email: caller.email ?? '',
    role: 'reporter',
    createdAt: now,
    updatedAt: now,
  };

  const batch = db.batch();
  batch.create(userRef, newProfile);
  recordAuditEventInBatch(batch, {
    actorUid: caller.uid,
    action: 'user.role_provisioned',
    targetType: 'user',
    targetId: caller.uid,
    requestId,
    occurredAt: now,
  });
  await batch.commit();

  await getAdminAuth()
    .setCustomUserClaims(caller.uid, { role: 'reporter' })
    .catch(() => undefined);

  return serializeUserDoc(caller.uid, newProfile);
}
