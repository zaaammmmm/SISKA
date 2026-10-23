/**
 * SISKA — Common Input Validation Primitives (Schema Allowlist & Sanitization)
 * Sumber otoritas:
 * - docs/05-BACKEND-ARCHITECTURE.md §4.3 ("Validasi request dengan schema allowlist; jangan menerima reporterId, role, atau senderId sebagai otoritas dari client.")
 * - docs/01-SRS.md NFR-SEC-03
 * - docs/09-TEST-PLAN.md AUTH-04, REP-02
 */

import { ApiError } from '@/server/errors/api-error';

/**
 * Daftar field otoritas server yang DILARANG KERAS dikirim oleh client pada body request.
 */
const FORBIDDEN_AUTHORITY_KEYS = new Set([
  'uid',
  'role',
  'claims',
  'reporterId',
  'senderUid',
  'actorUid',
  'uploadedBy',
  'createdAt',
  'updatedAt',
  'resolvedAt',
]);

/**
 * Membaca dan mem-parsing JSON body dari Request secara aman.
 * Memastikan hasil parsing berupa plain object (`Record<string, unknown>`).
 */
export async function parseJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw ApiError.validation('Format JSON pada body permintaan tidak valid.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw ApiError.validation('Body permintaan harus berupa objek JSON.');
  }

  return parsed as Record<string, unknown>;
}

/**
 * Memvalidasi bahwa objek hanya memuat key yang ada di dalam `allowedKeys` (Schema Allowlist).
 * Menolak secara eksplisit jika ada usaha menyuntikkan field otoritas (`role`, `reporterId`, `senderUid`, dll.)
 * disertai rincian `fields` per-field.
 */
export function assertAllowlistedKeys(
  payload: Record<string, unknown>,
  allowedKeys: readonly string[],
  contextLabel = 'permintaan',
): void {
  const allowedSet = new Set(allowedKeys);

  for (const key of Object.keys(payload)) {
    if (!allowedSet.has(key)) {
      if (FORBIDDEN_AUTHORITY_KEYS.has(key)) {
        const msg = `Field otoritas '${key}' tidak boleh dikirim oleh client pada ${contextLabel}.`;
        throw ApiError.validation(msg, { [key]: msg });
      }
      const msg = `Field '${key}' tidak dikenali atau tidak diizinkan pada ${contextLabel}.`;
      throw ApiError.validation(msg, { [key]: msg });
    }
  }
}

/**
 * Memastikan string wajib ada, bertipe string, tidak berisi karakter null-byte,
 * serta memenuhi panjang minimum & maksimum setelah di-trim.
 */
export function validateRequiredString(
  value: unknown,
  fieldName: string,
  options: { minLength?: number; maxLength: number },
): string {
  if (typeof value !== 'string') {
    const msg = `Field '${fieldName}' wajib berupa teks.`;
    throw ApiError.validation(msg, { [fieldName]: msg });
  }
  if (value.includes('\u0000')) {
    const msg = `Field '${fieldName}' memuat karakter tidak valid.`;
    throw ApiError.validation(msg, { [fieldName]: msg });
  }

  const trimmed = value.trim();
  const minLength = options.minLength ?? 1;

  if (trimmed.length < minLength) {
    const msg = `Field '${fieldName}' tidak boleh kosong (minimal ${minLength} karakter).`;
    throw ApiError.validation(msg, { [fieldName]: msg });
  }
  if (trimmed.length > options.maxLength) {
    const msg = `Field '${fieldName}' melebihi batas maksimum ${options.maxLength} karakter.`;
    throw ApiError.validation(msg, { [fieldName]: msg });
  }

  return trimmed;
}

/**
 * Memvalidasi string opsional (boleh `undefined` atau `null`).
 * Jika berupa string kosong setelah di-trim, dikembalikan sebagai `null`.
 */
export function validateOptionalString(
  value: unknown,
  fieldName: string,
  options: { maxLength: number },
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    const msg = `Field '${fieldName}' harus berupa teks atau null.`;
    throw ApiError.validation(msg, { [fieldName]: msg });
  }
  if (value.includes('\u0000')) {
    const msg = `Field '${fieldName}' memuat karakter tidak valid.`;
    throw ApiError.validation(msg, { [fieldName]: msg });
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > options.maxLength) {
    const msg = `Field '${fieldName}' melebihi batas maksimum ${options.maxLength} karakter.`;
    throw ApiError.validation(msg, { [fieldName]: msg });
  }

  return trimmed;
}

/**
 * Memvalidasi tanggal ISO-8601 opsional (`date-time`) dan mengembalikannya sebagai objek `Date` atau `null`.
 */
export function validateOptionalIsoDate(
  value: unknown,
  fieldName: string,
): Date | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    const msg = `Field '${fieldName}' harus berupa string tanggal format ISO-8601 atau null.`;
    throw ApiError.validation(msg, { [fieldName]: msg });
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const msg = `Field '${fieldName}' bukan tanggal ISO-8601 yang valid.`;
    throw ApiError.validation(msg, { [fieldName]: msg });
  }

  return parsed;
}

/**
 * Memvalidasi ID dokumen Firestore pada parameter path/query agar bebas dari karakter traversal.
 */
export function validateResourceId(
  value: unknown,
  fieldName = 'id',
): string {
  if (typeof value !== 'string') {
    const msg = `Parameter '${fieldName}' wajib berupa string.`;
    throw ApiError.validation(msg, { [fieldName]: msg });
  }
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(trimmed)) {
    const msg = `Format parameter '${fieldName}' tidak valid.`;
    throw ApiError.validation(msg, { [fieldName]: msg });
  }
  return trimmed;
}

export interface PaginationParams {
  cursor: string | null;
  limit: number;
}

/**
 * Memvalidasi parameter paginasi query (`cursor`, `limit`) sesuai docs/04-API-SPEC.yaml:
 * `limit`: integer minimum 1, maximum 50, default 20.
 */
export function validatePaginationParams(
  searchParams: URLSearchParams,
  defaultLimit = 20,
  maxLimit = 50,
): PaginationParams {
  const rawCursor = searchParams.get('cursor');
  const cursor = rawCursor ? validateResourceId(rawCursor, 'cursor') : null;

  const rawLimit = searchParams.get('limit');
  if (rawLimit === null || rawLimit.trim() === '') {
    return { cursor, limit: defaultLimit };
  }

  const parsedLimit = Number(rawLimit);
  if (
    !Number.isInteger(parsedLimit) ||
    parsedLimit < 1 ||
    parsedLimit > maxLimit
  ) {
    const msg = `Parameter 'limit' harus berupa bilangan bulat antara 1 hingga ${maxLimit}.`;
    throw ApiError.validation(msg, { limit: msg });
  }

  return { cursor, limit: parsedLimit };
}
