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
import {
  buildCloudinaryPublicImageUrl,
  deleteFromCloudinary,
  resolveActiveStorageProvider,
  uploadBytesToCloudinary,
} from '@/lib/cloudinary';
import {
  getAdminAuth,
  getAdminBucket,
  getAdminDb,
  isFirebaseEmulatorMode,
  resolveAdminConfig,
} from '@/lib/firebase/admin';
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
import { extensionForEvidenceType } from '@/server/validators/evidence.validator';
import type { UpdateProfileInput } from '@/server/validators/profile.validator';
import type { SerializedUserProfile } from '@/types/api';
import type { UserDocument, UserRole } from '@/types/domain';

export type { SerializedUserProfile };

function resolveAvatarUrl(data: DocumentData): string | null | undefined {
  if (typeof data.photoUrl === 'string' && data.photoUrl.trim().length > 0) {
    return data.photoUrl;
  }
  if (typeof data.avatarPath === 'string' && data.avatarPath.trim().length > 0) {
    if (resolveActiveStorageProvider() === 'cloudinary') {
      return buildCloudinaryPublicImageUrl({
        storagePath: data.avatarPath,
        preset: 'avatar',
      });
    }
    if (isFirebaseEmulatorMode()) {
      const cfg = resolveAdminConfig();
      const host = cfg.storageHost || '127.0.0.1:9199';
      return `http://${host}/v0/b/${cfg.storageBucket}/o/${encodeURIComponent(data.avatarPath)}?alt=media`;
    }
  }
  return undefined;
}

function serializeUserDoc(
  uid: string,
  data: DocumentData,
): SerializedUserProfile {
  const resolvedPhotoUrl = resolveAvatarUrl(data);
  return {
    uid: String(data.uid ?? uid),
    displayName: String(data.displayName ?? ''),
    email: String(data.email ?? ''),
    role: (data.role as UserRole) ?? 'reporter',
    createdAt: toIsoDateString(data.createdAt),
    updatedAt: toIsoDateString(data.updatedAt),
    ...(resolvedPhotoUrl !== undefined ? { photoUrl: resolvedPhotoUrl } : {}),
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
 * Memperbarui field profil yang diizinkan (`PATCH /api/v1/profile`), termasuk unggahan foto profil (`avatar`).
 *
 * Aturan Keamanan (FR-004, FR-014, AUTH-04, 08-AUTHORIZATION-MATRIX.md):
 * - Wajib lolos `requireAuthorizedUser(caller)` (tanpa hardcoded UID akun uji apa pun).
 * - Akun yang tidak memiliki Custom Claim role maupun dokumen profil `users/{uid}`
 *   otomatis ditolak dengan `403 FORBIDDEN`.
 * - Hanya `displayName`, `avatarPath`/`photoUrl`, dan `updatedAt` yang dapat diperbarui; `role`, `uid`, `email`, dan `createdAt` dikunci.
 */
export async function updateMyProfile(
  caller: AuthenticatedCaller,
  input: UpdateProfileInput,
  requestId: string,
): Promise<SerializedUserProfile> {
  const authorized = requireAuthorizedUser(caller);
  const db = getAdminDb();
  const userRef = db.collection('users').doc(authorized.uid);
  const provider = resolveActiveStorageProvider();

  let uploadedAvatarPath: string | null = null;
  let uploadedPhotoUrl: string | null = null;

  if (input.avatar) {
    const ext = extensionForEvidenceType(input.avatar.contentType);
    uploadedAvatarPath = `users/${authorized.uid}/avatar_${Date.now()}.${ext}`;

    if (provider === 'cloudinary') {
      await uploadBytesToCloudinary({
        storagePath: uploadedAvatarPath,
        bytes: input.avatar.bytes,
        contentType: input.avatar.contentType,
        fileName: input.avatar.fileName,
        deliveryType: 'upload',
      });
      uploadedPhotoUrl = buildCloudinaryPublicImageUrl({
        storagePath: uploadedAvatarPath,
        preset: 'avatar',
      });
    } else {
      const bucket = getAdminBucket();
      await bucket.file(uploadedAvatarPath).save(Buffer.from(input.avatar.bytes), {
        resumable: false,
        contentType: input.avatar.contentType,
        metadata: {
          cacheControl: 'private, max-age=3600',
        },
      });
      if (isFirebaseEmulatorMode()) {
        const cfg = resolveAdminConfig();
        const host = cfg.storageHost || '127.0.0.1:9199';
        uploadedPhotoUrl = `http://${host}/v0/b/${cfg.storageBucket}/o/${encodeURIComponent(uploadedAvatarPath)}?alt=media`;
      }
    }
  }

  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) {
        throw ApiError.notFound(INDISTINGUISHABLE_NOT_FOUND_MESSAGE);
      }

      const existingData = snap.data() as UserDocument;
      const now = new Date();

      const updateFields: Record<string, unknown> = {
        displayName: input.displayName,
        updatedAt: now,
        ...(uploadedAvatarPath
          ? {
              avatarPath: uploadedAvatarPath,
              ...(uploadedPhotoUrl ? { photoUrl: uploadedPhotoUrl } : {}),
            }
          : {}),
      };

      tx.update(userRef, updateFields);

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
        ...updateFields,
      });
    });
  } catch (txError) {
    if (uploadedAvatarPath && input.avatar) {
      if (provider === 'cloudinary') {
        await deleteFromCloudinary({
          storagePath: uploadedAvatarPath,
          contentType: input.avatar.contentType,
          deliveryType: 'upload',
        }).catch(() => undefined);
      } else {
        await getAdminBucket()
          .file(uploadedAvatarPath)
          .delete({ ignoreNotFound: true })
          .catch(() => undefined);
      }
    }
    throw txError;
  }
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
