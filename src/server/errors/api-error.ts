// Penanganan Error API

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

// Resolusi Request ID
export function resolveRequestId(request?: Request): string {
  const incoming = request?.headers.get('x-request-id')?.trim();
  if (incoming && /^[a-zA-Z0-9_-]{8,64}$/.test(incoming)) {
    return incoming;
  }
  return `req_${randomUUID()}`;
}

// Kelas Error API
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

  // Error Validasi 400
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

  // Error Autentikasi 401
  static unauthenticated(
    message = 'Sesi autentikasi tidak valid atau telah berakhir.',
  ): ApiError {
    return new ApiError({
      code: 'UNAUTHENTICATED',
      status: 401,
      message,
    });
  }

  // Error Otorisasi 403
  static forbidden(
    message = 'Anda tidak memiliki wewenang untuk melakukan tindakan ini.',
  ): ApiError {
    return new ApiError({
      code: 'FORBIDDEN',
      status: 403,
      message,
    });
  }

  // Error Tidak Ditemukan
  static notFound(
    message = 'Data yang diminta tidak ditemukan atau tidak tersedia untuk akun Anda.',
  ): ApiError {
    return new ApiError({
      code: 'NOT_FOUND',
      status: 404,
      message,
    });
  }

  // Error Konflik 409
  static conflict(
    message = 'Tindakan tidak dapat dilakukan karena status data saat ini tidak mengizinkannya.',
  ): ApiError {
    return new ApiError({
      code: 'CONFLICT',
      status: 409,
      message,
    });
  }

  // Error Unggahan Ditolak
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

  // Error Batas Laju
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

  // Error Internal 500
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

// Serialisasi Respons Error
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

  // Redaksi Log Error
  const errorObject = error instanceof Error ? error : null;
  const safeErrorName = errorObject?.name || 'UnknownError';
  const rawMessage = errorObject?.message || String(error ?? 'Unknown error');
  const safeErrorMessage = rawMessage
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
    .replace(/(private[_ -]?key|client[_ -]?secret|shared[_ -]?secret|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 500);
  const errorCode =
    errorObject && 'code' in errorObject &&
    (typeof errorObject.code === 'string' || typeof errorObject.code === 'number')
      ? errorObject.code
      : undefined;

  console.error(
    JSON.stringify({
      level: 'error',
      requestId,
      code: 'INTERNAL_ERROR',
      status: 500,
      errorName: safeErrorName,
      ...(errorCode !== undefined ? { errorCode } : {}),
      errorMessage: safeErrorMessage,
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

// Respons JSON Sukses
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
