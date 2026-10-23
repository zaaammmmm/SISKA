/**
 * SISKA — Standard API Error Contract & Response Serializer
 * Sumber otoritas:
 * - docs/04-API-SPEC.yaml (components/schemas/Error)
 * - docs/05-BACKEND-ARCHITECTURE.md §8 (Error contract)
 * - docs/01-SRS.md NFR-OBS-01 (PII-safe structured logging)
 * - docs/09-TEST-PLAN.md REP-03 (Indistinguishable Not-Found response on cross-user access)
 */

import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  API_ERROR_CODES,
  type ApiErrorBody,
  type ApiErrorCode,
  type ApiErrorFieldMap,
} from '@/types/api';

export { API_ERROR_CODES, type ApiErrorBody, type ApiErrorCode, type ApiErrorFieldMap };

export interface ApiErrorOptions {
  code: ApiErrorCode;
  status: number;
  message: string;
  fields?: ApiErrorFieldMap;
  headers?: Record<string, string>;
  internalReason?: string;
}

/**
 * Menghasilkan Request ID unik (`req_<uuid>`) atau membaca dari header `x-request-id` jika sudah valid.
 */
export function resolveRequestId(request?: Request): string {
  const incoming = request?.headers.get('x-request-id')?.trim();
  if (incoming && /^[a-zA-Z0-9_-]{8,64}$/.test(incoming)) {
    return incoming;
  }
  return `req_${randomUUID()}`;
}

/**
 * Representasi Error standar domain/API SISKA.
 * Selalu diserialisasi menjadi `{ code, message, requestId, fields? }` tanpa membocorkan stack trace atau PII.
 */
export class ApiError extends Error {
  public readonly code: ApiErrorCode;
  public readonly status: number;
  public readonly fields?: ApiErrorFieldMap;
  public readonly headers?: Record<string, string>;
  public readonly internalReason?: string;

  constructor(options: ApiErrorOptions) {
    super(options.message);
    this.name = 'ApiError';
    this.code = options.code;
    this.status = options.status;
    this.fields = options.fields;
    this.headers = options.headers;
    this.internalReason = options.internalReason;
  }

  /** 400 — Input tidak valid atau melanggar aturan validasi schema (dilengkapi rincian per-field opsional) */
  static validation(
    message = 'Data permintaan tidak valid.',
    fields?: ApiErrorFieldMap,
  ): ApiError {
    return new ApiError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message,
      ...(fields && Object.keys(fields).length > 0 ? { fields } : {}),
    });
  }

  /** 401 — Token tidak ada, kedaluwarsa, atau tidak valid */
  static unauthenticated(
    message = 'Sesi autentikasi tidak valid atau telah berakhir.',
  ): ApiError {
    return new ApiError({
      code: 'UNAUTHENTICATED',
      status: 401,
      message,
    });
  }

  /** 403 — Peran pemanggil tidak berwenang pada level endpoint/peran (mis. reporter memanggil endpoint admin) */
  static forbidden(
    message = 'Anda tidak memiliki wewenang untuk melakukan tindakan ini.',
  ): ApiError {
    return new ApiError({
      code: 'FORBIDDEN',
      status: 403,
      message,
    });
  }

  /**
   * 404 — Resource tidak ditemukan ATAU milik pengguna lain.
   * Sesuai docs/05-BACKEND-ARCHITECTURE.md §8 & REP-03 / FILE-03 / CHAT-02:
   * Pesan sengaja dibuat seragam agar tidak membocorkan eksistensi ID resource pihak lain (Anti-IDOR).
   */
  static notFound(
    message = 'Data yang diminta tidak ditemukan atau tidak tersedia untuk akun Anda.',
  ): ApiError {
    return new ApiError({
      code: 'NOT_FOUND',
      status: 404,
      message,
    });
  }

  /** 409 — Transisi status ilegal atau konflik state (REP-06) */
  static conflict(
    message = 'Tindakan tidak dapat dilakukan karena status data saat ini tidak mengizinkannya.',
  ): ApiError {
    return new ApiError({
      code: 'CONFLICT',
      status: 409,
      message,
    });
  }

  /** 413 / 400 — Berkas bukti melanggar batas ukuran, MIME allowlist, atau pemeriksaan konten (FILE-02) */
  static uploadRejected(
    message = 'Berkas ditolak. Pastikan format (PDF/JPEG/PNG) dan ukuran berkas sesuai ketentuan.',
    status: 400 | 413 = 400,
    fields?: ApiErrorFieldMap,
  ): ApiError {
    return new ApiError({
      code: 'UPLOAD_REJECTED',
      status,
      message,
      ...(fields && Object.keys(fields).length > 0 ? { fields } : {}),
    });
  }

  /** 429 — Melebihi batas laju permintaan (dilengkapi header Retry-After sesuai 04-API-SPEC.yaml) */
  static rateLimited(
    retryAfterSeconds = 60,
    message = 'Terlalu banyak permintaan. Silakan coba kembali beberapa saat lagi.',
  ): ApiError {
    return new ApiError({
      code: 'RATE_LIMITED',
      status: 429,
      message,
      headers: {
        'Retry-After': String(Math.max(1, Math.floor(retryAfterSeconds))),
      },
    });
  }

  /** 500 — Kesalahan internal server dengan pesan aman untuk pengguna */
  static internal(
    internalReason?: string,
    message = 'Terjadi kendala pada layanan. Silakan coba kembali nanti.',
  ): ApiError {
    return new ApiError({
      code: 'INTERNAL_ERROR',
      status: 500,
      message,
      internalReason,
    });
  }
}

/**
 * Mengubah sembarang error menjadi `NextResponse<ApiErrorBody>` dengan header `X-Request-Id`.
 * Log internal hanya mencatat metadata aman (tanpa payload laporan/token/bukti — NFR-OBS-01).
 */
export function toErrorResponse(
  error: unknown,
  requestId: string,
): NextResponse<ApiErrorBody> {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      console.error(
        JSON.stringify({
          level: 'error',
          requestId,
          code: error.code,
          status: error.status,
          reason: error.internalReason || 'Unhandled internal ApiError',
          timestamp: new Date().toISOString(),
        }),
      );
    }

    return NextResponse.json<ApiErrorBody>(
      {
        code: error.code,
        message: error.message,
        requestId,
        ...(error.fields && Object.keys(error.fields).length > 0
          ? { fields: error.fields }
          : {}),
      },
      {
        status: error.status,
        headers: {
          'X-Request-Id': requestId,
          'Cache-Control': 'no-store',
          ...error.headers,
        },
      },
    );
  }

  // Error tak terduga: catat hanya nama & kode error sistem tanpa menyalin objek request/payload
  const safeErrorName = error instanceof Error ? error.name : 'UnknownError';
  console.error(
    JSON.stringify({
      level: 'error',
      requestId,
      code: 'INTERNAL_ERROR',
      status: 500,
      errorName: safeErrorName,
      timestamp: new Date().toISOString(),
    }),
  );

  return NextResponse.json<ApiErrorBody>(
    {
      code: 'INTERNAL_ERROR',
      message: 'Terjadi kendala pada layanan. Silakan coba kembali nanti.',
      requestId,
    },
    {
      status: 500,
      headers: {
        'X-Request-Id': requestId,
        'Cache-Control': 'no-store',
      },
    },
  );
}

/**
 * Membungkus respons JSON sukses dengan header standar keamanan (`X-Request-Id`, `Cache-Control: no-store`).
 */
export function jsonSuccess<T>(
  data: T,
  requestId: string,
  status = 200,
  extraHeaders?: Record<string, string>,
): NextResponse<T> {
  return NextResponse.json<T>(data, {
    status,
    headers: {
      'X-Request-Id': requestId,
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}
