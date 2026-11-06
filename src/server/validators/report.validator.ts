import { ApiError } from '@/server/errors/api-error';
import {
  ALLOWED_STATUS_TRANSITIONS,
  REPORT_STATUSES,
  isStatusNoteRequired,
  type ReportStatus,
} from '@/types/domain';
import {
  assertAllowlistedKeys,
  validateOptionalIsoDate,
  validateOptionalString,
  validatePaginationParams,
  validateRequiredString,
  type PaginationParams,
} from '@/server/validators/common';

export interface ListReportsQuery extends PaginationParams {
  status: ReportStatus | null;
}

export interface CreateReportInput {
  category: string;
  incidentAt: Date | null;
  location: string | null;
  description: string;
}

export interface UpdateReportStatusInput {
  status: ReportStatus;
  note: string | null;
}

// Type Guard Status Laporan
export function isReportStatus(value: unknown): value is ReportStatus {
  return (
    typeof value === 'string' &&
    (REPORT_STATUSES as readonly string[]).includes(value)
  );
}

// Validasi Query Daftar Laporan
export function validateListReportsQuery(
  searchParams: URLSearchParams,
): ListReportsQuery {
  const pagination = validatePaginationParams(searchParams, 20, 50);
  const rawStatus = searchParams.get('status');

  if (rawStatus === null || rawStatus.trim() === '') {
    return { ...pagination, status: null };
  }

  const trimmedStatus = rawStatus.trim();
  if (!isReportStatus(trimmedStatus)) {
    const msg = `Parameter 'status' tidak valid. Nilai yang diizinkan: ${REPORT_STATUSES.join(', ')}.`;
    throw ApiError.validation(msg, { status: msg });
  }

  return {
    ...pagination,
    status: trimmedStatus,
  };
}

const CREATE_REPORT_ALLOWED_KEYS = [
  'category',
  'incidentAt',
  'location',
  'description',
] as const;

// Validasi Input Pembuatan Laporan
export function validateCreateReportInput(
  payload: Record<string, unknown>,
): CreateReportInput {
  assertAllowlistedKeys(payload, CREATE_REPORT_ALLOWED_KEYS, 'pembuatan laporan');

  const category = validateRequiredString(payload.category, 'category', {
    minLength: 1,
    maxLength: 100,
  });

  const incidentAt = validateOptionalIsoDate(payload.incidentAt, 'incidentAt');

  const location = validateOptionalString(payload.location, 'location', {
    maxLength: 500,
  });

  const description = validateRequiredString(payload.description, 'description', {
    minLength: 1,
    maxLength: 20000,
  });

  return {
    category,
    incidentAt,
    location,
    description,
  };
}

const UPDATE_REPORT_STATUS_ALLOWED_KEYS = ['status', 'note'] as const;

// Validasi Input Pembaruan Status
export function validateUpdateReportStatusInput(
  payload: Record<string, unknown>,
): UpdateReportStatusInput {
  assertAllowlistedKeys(
    payload,
    UPDATE_REPORT_STATUS_ALLOWED_KEYS,
    'pembaruan status laporan',
  );

  if (!isReportStatus(payload.status)) {
    const msg = `Field 'status' wajib diisi dengan salah satu nilai: ${REPORT_STATUSES.join(', ')}.`;
    throw ApiError.validation(msg, { status: msg });
  }

  const note = validateOptionalString(payload.note, 'note', {
    maxLength: 2000,
  });

  return {
    status: payload.status,
    note,
  };
}

// Validasi Aturan Transisi Status
export function assertValidStatusTransition(
  fromStatus: ReportStatus,
  toStatus: ReportStatus,
  note: string | null,
): void {
  const allowedTargets = ALLOWED_STATUS_TRANSITIONS[fromStatus] ?? [];
  if (!allowedTargets.includes(toStatus)) {
    throw ApiError.conflict(
      `Transisi status laporan dari '${fromStatus}' ke '${toStatus}' tidak diizinkan oleh aturan alur kerja SISKA.`,
    );
  }

  if (isStatusNoteRequired(fromStatus, toStatus) && (!note || note.trim().length === 0)) {
    const msg = `Perubahan status dari '${fromStatus}' ke '${toStatus}' wajib menyertakan alasan atau catatan pada field 'note'.`;
    throw ApiError.validation(msg, { note: msg });
  }
}
