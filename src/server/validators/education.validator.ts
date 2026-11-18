import { ApiError } from '@/server/errors/api-error';
import {
  assertAllowlistedKeys,
  validatePaginationParams,
  validateOptionalString,
  validateRequiredString,
  type PaginationParams,
} from '@/server/validators/common';
import {
  assertValidFileSignature,
  validateCreateEvidenceInput,
} from '@/server/validators/evidence.validator';
import {
  EDUCATION_CATEGORIES,
  EDUCATION_ICONS,
  EVIDENCE_MAX_BYTES,
  type EducationCategory,
  type EducationIcon,
} from '@/types/domain';

export interface EducationCoverUploadInput {
  fileName: string;
  contentType: 'image/jpeg' | 'image/png';
  sizeBytes: number;
  bytes: Uint8Array;
}

export interface CreateEducationInput {
  title: string;
  slug?: string | null;
  tag: string;
  category: EducationCategory;
  icon: EducationIcon;
  excerpt: string;
  content: string;
  readingTimeMinutes?: number;
  isPublished?: boolean;
  sortOrder?: number;
  coverImage?: EducationCoverUploadInput | null;
}

export interface UpdateEducationInput {
  title?: string;
  slug?: string | null;
  tag?: string;
  category?: EducationCategory;
  icon?: EducationIcon;
  excerpt?: string;
  content?: string;
  readingTimeMinutes?: number;
  isPublished?: boolean;
  sortOrder?: number;
  coverImage?: EducationCoverUploadInput | null;
}

export interface ListEducationQuery extends PaginationParams {
  category?: EducationCategory | 'all';
  tag?: string | null;
  search?: string | null;
  includeDrafts?: boolean;
}

const CREATE_EDUCATION_ALLOWED_KEYS = [
  'title',
  'slug',
  'tag',
  'category',
  'icon',
  'excerpt',
  'content',
  'readingTimeMinutes',
  'isPublished',
  'sortOrder',
  'coverImage',
] as const;

const UPDATE_EDUCATION_ALLOWED_KEYS = CREATE_EDUCATION_ALLOWED_KEYS;

function parseCoverImageObject(
  rawCover: unknown,
): EducationCoverUploadInput | null {
  if (rawCover === undefined || rawCover === null) {
    return null;
  }
  if (typeof rawCover !== 'object' || Array.isArray(rawCover)) {
    const msg = "Field 'coverImage' harus berupa objek berkas gambar sampul.";
    throw ApiError.validation(msg, { coverImage: msg });
  }

  const meta = validateCreateEvidenceInput(rawCover as Record<string, unknown>);
  if (meta.contentType !== 'image/jpeg' && meta.contentType !== 'image/png') {
    const msg = 'Gambar sampul edukasi hanya mendukung format JPEG atau PNG.';
    throw ApiError.uploadRejected(msg, 400, { contentType: msg });
  }

  if (!meta.contentBase64) {
    const msg = "Field 'coverImage.contentBase64' wajib disertakan.";
    throw ApiError.validation(msg, { coverImage: msg });
  }

  const maxBase64Chars = Math.ceil((EVIDENCE_MAX_BYTES * 4) / 3) + 1024;
  if (meta.contentBase64.length > maxBase64Chars) {
    const msg = `Ukuran gambar sampul melebihi batas maksimum 5 MiB (${EVIDENCE_MAX_BYTES} byte).`;
    throw ApiError.uploadRejected(msg, 413, { sizeBytes: msg });
  }

  const decoded = Buffer.from(meta.contentBase64, 'base64');
  if (decoded.byteLength !== meta.sizeBytes) {
    const msg =
      "Ukuran hasil dekode 'contentBase64' tidak sesuai dengan 'sizeBytes'.";
    throw ApiError.validation(msg, { sizeBytes: msg });
  }

  const bytes = new Uint8Array(decoded);
  assertValidFileSignature(bytes, meta.contentType);

  return {
    fileName: meta.fileName,
    contentType: meta.contentType,
    sizeBytes: bytes.byteLength,
    bytes,
  };
}

// Helper Validasi Kategori
function validateCategory(value: unknown): EducationCategory {
  if (
    typeof value !== 'string' ||
    !EDUCATION_CATEGORIES.includes(value as EducationCategory)
  ) {
    const msg = `Field 'category' harus salah satu dari: ${EDUCATION_CATEGORIES.join(', ')}.`;
    throw ApiError.validation(msg, { category: msg });
  }
  return value as EducationCategory;
}

// Helper Validasi Icon
function validateIcon(value: unknown): EducationIcon {
  if (
    typeof value !== 'string' ||
    !EDUCATION_ICONS.includes(value as EducationIcon)
  ) {
    const msg = `Field 'icon' harus salah satu dari: ${EDUCATION_ICONS.join(', ')}.`;
    throw ApiError.validation(msg, { icon: msg });
  }
  return value as EducationIcon;
}

// Helper Validasi Slug
function validateSlug(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    const msg = "Field 'slug' harus berupa teks atau null.";
    throw ApiError.validation(msg, { slug: msg });
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) return null;

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) {
    const msg = "Field 'slug' hanya boleh berisi huruf kecil, angka, dan tanda hubung (-).";
    throw ApiError.validation(msg, { slug: msg });
  }
  if (trimmed.length > 200) {
    const msg = "Field 'slug' maksimal 200 karakter.";
    throw ApiError.validation(msg, { slug: msg });
  }
  return trimmed;
}

function validateReadingTime(value: unknown): number {
  if (value === undefined || value === null) {
    return 3;
  }
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 120
  ) {
    const msg = "Field 'readingTimeMinutes' harus berupa bilangan bulat antara 1 hingga 120 menit.";
    throw ApiError.validation(msg, { readingTimeMinutes: msg });
  }
  return value;
}

function validateSortOrder(value: unknown): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    const msg = "Field 'sortOrder' harus berupa bilangan bulat non-negatif.";
    throw ApiError.validation(msg, { sortOrder: msg });
  }
  return value;
}

function validatePublished(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value !== 'boolean') {
    const msg = "Field 'isPublished' harus berupa nilai boolean (true/false).";
    throw ApiError.validation(msg, { isPublished: msg });
  }
  return value;
}

// Validasi Input Pembuatan Edukasi
export function validateCreateEducationInput(
  payload: Record<string, unknown>,
): CreateEducationInput {
  assertAllowlistedKeys(payload, CREATE_EDUCATION_ALLOWED_KEYS, 'pembuatan materi edukasi');

  const title = validateRequiredString(payload.title, 'title', {
    minLength: 3,
    maxLength: 200,
  });
  const slug = validateSlug(payload.slug);
  const tag = validateRequiredString(payload.tag, 'tag', {
    minLength: 2,
    maxLength: 50,
  });
  const category = validateCategory(payload.category);
  const icon = validateIcon(payload.icon);
  const excerpt = validateRequiredString(payload.excerpt, 'excerpt', {
    minLength: 5,
    maxLength: 500,
  });
  const content = validateRequiredString(payload.content, 'content', {
    minLength: 10,
    maxLength: 50000,
  });
  const readingTimeMinutes = validateReadingTime(payload.readingTimeMinutes);
  const isPublished = validatePublished(payload.isPublished);
  const sortOrder = validateSortOrder(payload.sortOrder);
  const coverImage = parseCoverImageObject(payload.coverImage);

  return {
    title,
    slug,
    tag,
    category,
    icon,
    excerpt,
    content,
    readingTimeMinutes,
    isPublished,
    sortOrder,
    ...(coverImage ? { coverImage } : {}),
  };
}

// Validasi Input Pembaruan Edukasi
export function validateUpdateEducationInput(
  payload: Record<string, unknown>,
): UpdateEducationInput {
  assertAllowlistedKeys(payload, UPDATE_EDUCATION_ALLOWED_KEYS, 'pembaruan materi edukasi');

  if (Object.keys(payload).length === 0) {
    throw ApiError.validation('Permintaan pembaruan harus memuat minimal satu field.');
  }

  const result: UpdateEducationInput = {};

  if ('title' in payload) {
    result.title = validateRequiredString(payload.title, 'title', {
      minLength: 3,
      maxLength: 200,
    });
  }
  if ('slug' in payload) {
    result.slug = validateSlug(payload.slug);
  }
  if ('tag' in payload) {
    result.tag = validateRequiredString(payload.tag, 'tag', {
      minLength: 2,
      maxLength: 50,
    });
  }
  if ('category' in payload) {
    result.category = validateCategory(payload.category);
  }
  if ('icon' in payload) {
    result.icon = validateIcon(payload.icon);
  }
  if ('excerpt' in payload) {
    result.excerpt = validateRequiredString(payload.excerpt, 'excerpt', {
      minLength: 5,
      maxLength: 500,
    });
  }
  if ('content' in payload) {
    result.content = validateRequiredString(payload.content, 'content', {
      minLength: 10,
      maxLength: 50000,
    });
  }
  if ('readingTimeMinutes' in payload) {
    result.readingTimeMinutes = validateReadingTime(payload.readingTimeMinutes);
  }
  if ('isPublished' in payload) {
    result.isPublished = validatePublished(payload.isPublished);
  }
  if ('sortOrder' in payload) {
    result.sortOrder = validateSortOrder(payload.sortOrder);
  }
  if ('coverImage' in payload) {
    result.coverImage = parseCoverImageObject(payload.coverImage);
  }

  return result;
}

// Validasi Query Daftar Edukasi
export function validateListEducationQuery(
  urlOrParams: URLSearchParams,
): ListEducationQuery {
  const pagination = validatePaginationParams(urlOrParams, 20, 50);

  const catParam = urlOrParams.get('category')?.trim();
  let category: EducationCategory | 'all' | undefined = undefined;
  if (catParam) {
    if (catParam === 'all' || EDUCATION_CATEGORIES.includes(catParam as EducationCategory)) {
      category = catParam as EducationCategory | 'all';
    } else {
      const msg = `Parameter 'category' harus salah satu dari: all, ${EDUCATION_CATEGORIES.join(', ')}.`;
      throw ApiError.validation(msg, { category: msg });
    }
  }

  const tag = validateOptionalString(urlOrParams.get('tag'), 'tag', { maxLength: 50 });
  const search = validateOptionalString(urlOrParams.get('search'), 'search', { maxLength: 100 });
  const includeDrafts = urlOrParams.get('includeDrafts') === 'true';

  return {
    ...pagination,
    category,
    tag,
    search,
    includeDrafts,
  };
}
