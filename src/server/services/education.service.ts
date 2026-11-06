/**
 * SISKA — Education Material Domain Service (`EducationService`)
 * Sumber otoritas:
 * - docs/01-SRS.md FR-001 (Public Pages & Edukasi Non-Grafis)
 * - docs/05-BACKEND-ARCHITECTURE.md §2.3 (Domain Services) & §4 (Request Flow)
 * - docs/08-AUTHORIZATION-MATRIX.md (Public Read, Admin Write)
 */

import type { DocumentData, Query } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { toIsoDateString } from '@/lib/firebase/firestore';
import { requireAdmin } from '@/server/authz/permissions';
import type { AuthenticatedCaller } from '@/server/authz/verify-token';
import { ApiError } from '@/server/errors/api-error';
import { recordAuditEvent } from '@/server/services/audit.service';
import type {
  CreateEducationInput,
  ListEducationQuery,
  UpdateEducationInput,
} from '@/server/validators/education.validator';
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

function serializeEducationDoc(
  id: string,
  data: DocumentData,
): SerializedEducationItem {
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
  };
}

/**
 * Mengambil daftar materi edukasi.
 * - Bersifat publik (tanpa login).
 * - Pengguna non-admin hanya dapat melihat materi dengan `isPublished: true`.
 * - Admin dapat melihat seluruh materi (termasuk draf) bila `includeDrafts` aktif.
 */
export async function listEducationMaterials(
  query: ListEducationQuery,
  caller?: AuthenticatedCaller | null,
): Promise<PaginatedEducationResult> {
  const db = getAdminDb();
  const isAdmin = caller?.role === 'admin';

  let fsQuery: Query = db.collection('education');

  // Filter publikasi: jika bukan admin atau tidak meminta draft, tampilkan hanya yang published
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

  // Ambil limit + 1 untuk paginasi cursor
  const snapshot = await fsQuery.limit(query.limit + 1).get();
  let docs = snapshot.docs;

  // Filter pencarian client-side di server (jika ada parameter search)
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

/**
 * Mengambil detail materi edukasi berdasarkan ID atau Slug.
 * Bersifat publik; materi yang belum dipublikasikan mengembalikan 404 bagi non-admin.
 */
export async function getEducationDetail(
  idOrSlug: string,
  caller?: AuthenticatedCaller | null,
): Promise<SerializedEducationItem> {
  const db = getAdminDb();
  const isAdmin = caller?.role === 'admin';

  // 1. Coba cari berdasarkan Document ID
  let docSnap = await db.collection('education').doc(idOrSlug).get();

  // 2. Jika tidak ditemukan, coba cari berdasarkan field slug
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

  // Proteksi materi draf / belum dipublikasikan
  if (!data.isPublished && !isAdmin) {
    throw ApiError.notFound('Materi edukasi tidak ditemukan.');
  }

  return serializeEducationDoc(docSnap.id, data);
}

/**
 * Membuat materi edukasi baru (Hanya Admin).
 */
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
  };

  await docRef.set(docData);

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

/**
 * Memperbarui materi edukasi yang sudah ada (Hanya Admin).
 */
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

/**
 * Menghapus materi edukasi (Hanya Admin).
 */
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

  await docRef.delete();

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
