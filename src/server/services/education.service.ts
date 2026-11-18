// Layanan Materi Edukasi

import type { DocumentData, Query } from 'firebase-admin/firestore';
import {
  buildCloudinaryPublicImageUrl,
  deleteFromCloudinary,
  resolveActiveStorageProvider,
  uploadBytesToCloudinary,
} from '@/lib/cloudinary';
import {
  getAdminBucket,
  getAdminDb,
  isFirebaseEmulatorMode,
  resolveAdminConfig,
} from '@/lib/firebase/admin';
import { toIsoDateString } from '@/lib/firebase/firestore';
import { requireAdmin } from '@/server/authz/permissions';
import type { AuthenticatedCaller } from '@/server/authz/verify-token';
import { ApiError } from '@/server/errors/api-error';
import { recordAuditEvent } from '@/server/services/audit.service';
import type {
  CreateEducationInput,
  EducationCoverUploadInput,
  ListEducationQuery,
  UpdateEducationInput,
} from '@/server/validators/education.validator';
import { extensionForEvidenceType } from '@/server/validators/evidence.validator';
import type {
  PaginatedEducationResult,
  SerializedEducationItem,
} from '@/types/api';
import type { EducationDocument } from '@/types/domain';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Serialisasi Dokumen Edukasi
function serializeEducationDoc(
  id: string,
  data: DocumentData,
): SerializedEducationItem {
  const coverImageUrl =
    typeof data.coverImageUrl === 'string' && data.coverImageUrl.length > 0
      ? data.coverImageUrl
      : typeof data.coverStoragePath === 'string' &&
          data.coverStoragePath.length > 0 &&
          resolveActiveStorageProvider() === 'cloudinary'
        ? buildCloudinaryPublicImageUrl({
            storagePath: data.coverStoragePath,
            preset: 'education_cover',
          })
        : undefined;

  return {
    id,
    slug: typeof data.slug === 'string' ? data.slug : id,
    title: String(data.title ?? ''),
    tag: String(data.tag ?? ''),
    category: data.category === 'guide' ? 'guide' : 'general',
    icon: ['heart', 'alert', 'users', 'shield'].includes(data.icon)
      ? data.icon
      : 'shield',
    excerpt: String(data.excerpt ?? ''),
    content: String(data.content ?? ''),
    readingTimeMinutes:
      typeof data.readingTimeMinutes === 'number' ? data.readingTimeMinutes : 3,
    isPublished: data.isPublished !== false,
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : 'system',
    createdAt: toIsoDateString(data.createdAt),
    updatedAt: toIsoDateString(data.updatedAt),
    ...(coverImageUrl !== undefined ? { coverImageUrl } : {}),
  };
}

// Penyimpanan Gambar Sampul
async function storeEducationCoverImage(
  docId: string,
  coverImage: EducationCoverUploadInput,
): Promise<{ coverStoragePath: string; coverImageUrl: string }> {
  const ext = extensionForEvidenceType(coverImage.contentType);
  const coverStoragePath = `education/${docId}/cover_${Date.now()}.${ext}`;
  const provider = resolveActiveStorageProvider();

  if (provider === 'cloudinary') {
    await uploadBytesToCloudinary({
      storagePath: coverStoragePath,
      bytes: coverImage.bytes,
      contentType: coverImage.contentType,
      fileName: coverImage.fileName,
      deliveryType: 'upload',
    });
    return {
      coverStoragePath,
      coverImageUrl: buildCloudinaryPublicImageUrl({
        storagePath: coverStoragePath,
        preset: 'education_cover',
      }),
    };
  }

  const bucket = getAdminBucket();
  await bucket.file(coverStoragePath).save(Buffer.from(coverImage.bytes), {
    resumable: false,
    contentType: coverImage.contentType,
    metadata: {
      cacheControl: 'public, max-age=86400',
    },
  });

  const cfg = resolveAdminConfig();
  const host = cfg.storageHost || '127.0.0.1:9199';
  const coverImageUrl = isFirebaseEmulatorMode()
    ? `http://${host}/v0/b/${cfg.storageBucket}/o/${encodeURIComponent(coverStoragePath)}?alt=media`
    : `https://storage.googleapis.com/${cfg.storageBucket}/${coverStoragePath}`;

  return { coverStoragePath, coverImageUrl };
}

// Daftar Materi Edukasi
export async function listEducationMaterials(
  query: ListEducationQuery,
  caller?: AuthenticatedCaller | null,
): Promise<PaginatedEducationResult> {
  const db = getAdminDb();
  const isAdmin = caller?.role === 'admin';

  let fsQuery: Query = db.collection('education');

  if (!isAdmin || !query.includeDrafts) {
    fsQuery = fsQuery.where('isPublished', '==', true);
  }

  if (query.category && query.category !== 'all') {
    fsQuery = fsQuery.where('category', '==', query.category);
  }

  if (query.tag) {
    fsQuery = fsQuery.where('tag', '==', query.tag);
  }

  fsQuery = fsQuery.orderBy('sortOrder', 'asc');

  if (query.cursor) {
    const cursorSnap = await db.collection('education').doc(query.cursor).get();
    if (!cursorSnap.exists) {
      const msg = "Parameter 'cursor' tidak valid.";
      throw ApiError.validation(msg, { cursor: msg });
    }
    fsQuery = fsQuery.startAfter(cursorSnap);
  }

  const snapshot = await fsQuery.limit(query.limit + 1).get();
  let docs = snapshot.docs;

  if (query.search) {
    const qLower = query.search.toLowerCase();
    docs = docs.filter((doc) => {
      const data = doc.data();
      const title = String(data.title ?? '').toLowerCase();
      const excerpt = String(data.excerpt ?? '').toLowerCase();
      const tag = String(data.tag ?? '').toLowerCase();
      return (
        title.includes(qLower) ||
        excerpt.includes(qLower) ||
        tag.includes(qLower)
      );
    });
  }

  const hasMore = docs.length > query.limit;
  const pageDocs = hasMore ? docs.slice(0, query.limit) : docs;

  const items = pageDocs.map((doc) => serializeEducationDoc(doc.id, doc.data()));
  const nextCursor =
    hasMore && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1].id : null;

  return {
    items,
    nextCursor,
  };
}

// Detail Materi Edukasi
export async function getEducationDetail(
  idOrSlug: string,
  caller?: AuthenticatedCaller | null,
): Promise<SerializedEducationItem> {
  const db = getAdminDb();
  const isAdmin = caller?.role === 'admin';

  let docSnap = await db.collection('education').doc(idOrSlug).get();

  if (!docSnap.exists) {
    const slugQuery = await db
      .collection('education')
      .where('slug', '==', idOrSlug)
      .limit(1)
      .get();
    if (!slugQuery.empty) {
      docSnap = slugQuery.docs[0];
    }
  }

  if (!docSnap.exists) {
    throw ApiError.notFound('Materi edukasi tidak ditemukan.');
  }

  const data = docSnap.data() as EducationDocument;

  if (!data.isPublished && !isAdmin) {
    throw ApiError.notFound('Materi edukasi tidak ditemukan.');
  }

  return serializeEducationDoc(docSnap.id, data);
}

// Pembuatan Materi Edukasi
export async function createEducationMaterial(
  caller: AuthenticatedCaller,
  input: CreateEducationInput,
  requestId: string,
): Promise<SerializedEducationItem> {
  const admin = requireAdmin(caller);
  const db = getAdminDb();
  const now = new Date();

  const generatedSlug = input.slug?.trim() || slugify(input.title);
  const docRef = db.collection('education').doc();

  let uploadedCover: { coverStoragePath: string; coverImageUrl: string } | null =
    null;
  if (input.coverImage) {
    uploadedCover = await storeEducationCoverImage(docRef.id, input.coverImage);
  }

  const docData: EducationDocument = {
    title: input.title,
    slug: generatedSlug,
    tag: input.tag,
    category: input.category,
    icon: input.icon,
    excerpt: input.excerpt,
    content: input.content,
    readingTimeMinutes: input.readingTimeMinutes ?? 3,
    isPublished: input.isPublished ?? true,
    sortOrder: input.sortOrder ?? 0,
    createdBy: admin.uid,
    createdAt: now,
    updatedAt: now,
    ...(uploadedCover
      ? {
          coverStoragePath: uploadedCover.coverStoragePath,
          coverImageUrl: uploadedCover.coverImageUrl,
        }
      : {}),
  };

  try {
    await docRef.set(docData);
  } catch (err) {
    if (uploadedCover && input.coverImage) {
      if (resolveActiveStorageProvider() === 'cloudinary') {
        await deleteFromCloudinary({
          storagePath: uploadedCover.coverStoragePath,
          contentType: input.coverImage.contentType,
          deliveryType: 'upload',
        }).catch(() => undefined);
      } else {
        await getAdminBucket()
          .file(uploadedCover.coverStoragePath)
          .delete({ ignoreNotFound: true })
          .catch(() => undefined);
      }
    }
    throw err;
  }

  await recordAuditEvent({
    actorUid: admin.uid,
    action: 'education.created',
    targetType: 'education',
    targetId: docRef.id,
    requestId,
    occurredAt: now,
  });

  return serializeEducationDoc(docRef.id, docData);
}

// Pembaruan Materi Edukasi
export async function updateEducationMaterial(
  caller: AuthenticatedCaller,
  id: string,
  input: UpdateEducationInput,
  requestId: string,
): Promise<SerializedEducationItem> {
  const admin = requireAdmin(caller);
  const db = getAdminDb();
  const docRef = db.collection('education').doc(id);

  const snap = await docRef.get();
  if (!snap.exists) {
    throw ApiError.notFound('Materi edukasi tidak ditemukan.');
  }

  const existing = snap.data() as EducationDocument;
  const now = new Date();

  const updateData: Partial<EducationDocument> = {
    updatedAt: now,
  };

  if (input.title !== undefined) updateData.title = input.title;
  if (input.slug !== undefined) {
    updateData.slug = input.slug?.trim() || slugify(input.title ?? existing.title);
  }
  if (input.tag !== undefined) updateData.tag = input.tag;
  if (input.category !== undefined) updateData.category = input.category;
  if (input.icon !== undefined) updateData.icon = input.icon;
  if (input.excerpt !== undefined) updateData.excerpt = input.excerpt;
  if (input.content !== undefined) updateData.content = input.content;
  if (input.readingTimeMinutes !== undefined) {
    updateData.readingTimeMinutes = input.readingTimeMinutes;
  }
  if (input.isPublished !== undefined) updateData.isPublished = input.isPublished;
  if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;
  if (input.coverImage !== undefined) {
    if (input.coverImage === null) {
      updateData.coverImageUrl = null;
      updateData.coverStoragePath = null;
    } else {
      const uploadedCover = await storeEducationCoverImage(id, input.coverImage);
      updateData.coverStoragePath = uploadedCover.coverStoragePath;
      updateData.coverImageUrl = uploadedCover.coverImageUrl;
    }
  }

  await docRef.update(updateData);

  await recordAuditEvent({
    actorUid: admin.uid,
    action: 'education.updated',
    targetType: 'education',
    targetId: id,
    requestId,
    occurredAt: now,
  });

  const merged = { ...existing, ...updateData };
  return serializeEducationDoc(id, merged);
}

// Penghapusan Materi Edukasi
export async function deleteEducationMaterial(
  caller: AuthenticatedCaller,
  id: string,
  requestId: string,
): Promise<{ id: string; deleted: boolean }> {
  const admin = requireAdmin(caller);
  const db = getAdminDb();
  const docRef = db.collection('education').doc(id);

  const snap = await docRef.get();
  if (!snap.exists) {
    throw ApiError.notFound('Materi edukasi tidak ditemukan.');
  }

  const existingData = snap.data() as EducationDocument;
  await docRef.delete();

  if (existingData.coverStoragePath) {
    if (resolveActiveStorageProvider() === 'cloudinary') {
      await deleteFromCloudinary({
        storagePath: existingData.coverStoragePath,
        contentType: existingData.coverStoragePath.endsWith('.png')
          ? 'image/png'
          : 'image/jpeg',
        deliveryType: 'upload',
      }).catch(() => undefined);
    } else {
      await getAdminBucket()
        .file(existingData.coverStoragePath)
        .delete({ ignoreNotFound: true })
        .catch(() => undefined);
    }
  }

  await recordAuditEvent({
    actorUid: admin.uid,
    action: 'education.deleted',
    targetType: 'education',
    targetId: id,
    requestId,
    occurredAt: new Date(),
  });

  return { id, deleted: true };
}
