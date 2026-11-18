// Layanan Otorisasi & RBAC

import { ApiError } from '@/server/errors/api-error';
import type { AuthenticatedCaller } from '@/server/authz/verify-token';
import type {
  ConversationDocument,
  ReportDocument,
  UserRole,
} from '@/types/domain';

export interface AuthorizedCaller extends AuthenticatedCaller {
  role: UserRole;
}

// Pesan 404 Seragam
export const INDISTINGUISHABLE_NOT_FOUND_MESSAGE =
  'Data yang diminta tidak ditemukan atau tidak tersedia untuk akun Anda.';

// Resolusi ID Pelapor
export function resolveConversationReporterId(
  conversation: Partial<ConversationDocument> & { reporterUid?: string | null },
): string {
  const hasCanonicalField = Object.prototype.hasOwnProperty.call(
    conversation,
    'reporterId',
  );
  const raw = hasCanonicalField
    ? conversation.reporterId
    : conversation.reporterUid;
  return typeof raw === 'string' ? raw : '';
}

// Resolusi ID Admin
export function resolveConversationAdminId(
  conversation: Partial<ConversationDocument> & { adminUid?: string | null },
): string | null {
  const hasCanonicalField = Object.prototype.hasOwnProperty.call(
    conversation,
    'assignedAdminId',
  );
  const raw = hasCanonicalField
    ? conversation.assignedAdminId
    : conversation.adminUid ?? null;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
}

// Validasi Pengguna Aktif
export function requireAuthorizedUser(caller: AuthenticatedCaller): AuthorizedCaller {
  if (!caller.role) {
    throw ApiError.forbidden(
      'Akun Anda belum memiliki hak akses aktif pada layanan SISKA.',
    );
  }
  return caller as AuthorizedCaller;
}

// Validasi Peran Admin
export function requireAdmin(caller: AuthenticatedCaller): AuthorizedCaller {
  const authorized = requireAuthorizedUser(caller);
  if (authorized.role !== 'admin' || !authorized.claimVerified) {
    throw ApiError.forbidden(
      'Tindakan ini hanya dapat dilakukan oleh petugas/admin berwenang.',
    );
  }
  return authorized;
}

// Validasi Daftar Peran
export function requireRole(
  caller: AuthenticatedCaller,
  allowedRoles: readonly UserRole[],
): AuthorizedCaller {
  const authorized = requireAuthorizedUser(caller);
  if (!allowedRoles.includes(authorized.role)) {
    throw ApiError.forbidden('Peran akun Anda tidak diizinkan mengakses endpoint ini.');
  }
  if (authorized.role === 'admin' && !authorized.claimVerified) {
    throw ApiError.forbidden('Klaim otoritas admin tidak terverifikasi.');
  }
  return authorized;
}

// Otorisasi Baca Laporan
export function assertCanReadReport(
  caller: AuthenticatedCaller,
  report: ReportDocument | null | undefined,
): AuthorizedCaller {
  const authorized = requireAuthorizedUser(caller);

  if (!report) {
    throw ApiError.notFound(INDISTINGUISHABLE_NOT_FOUND_MESSAGE);
  }

  if (authorized.role === 'admin' && authorized.claimVerified) {
    return authorized;
  }

  if (authorized.role === 'reporter' && report.reporterId === authorized.uid) {
    return authorized;
  }

  throw ApiError.notFound(INDISTINGUISHABLE_NOT_FOUND_MESSAGE);
}

// Otorisasi Unggah Bukti
export function assertCanUploadEvidence(
  caller: AuthenticatedCaller,
  report: ReportDocument | null | undefined,
): AuthorizedCaller {
  const authorized = requireAuthorizedUser(caller);

  if (
    authorized.role === 'reporter' &&
    report &&
    report.reporterId === authorized.uid
  ) {
    return authorized;
  }

  throw ApiError.notFound(INDISTINGUISHABLE_NOT_FOUND_MESSAGE);
}

// Otorisasi Unduh Bukti
export function assertCanDownloadEvidence(
  caller: AuthenticatedCaller,
  report: ReportDocument | null | undefined,
): AuthorizedCaller {
  const authorized = requireAuthorizedUser(caller);

  if (!report) {
    throw ApiError.notFound(INDISTINGUISHABLE_NOT_FOUND_MESSAGE);
  }

  if (authorized.role === 'admin' && authorized.claimVerified) {
    return authorized;
  }

  if (authorized.role === 'reporter' && report.reporterId === authorized.uid) {
    return authorized;
  }

  throw ApiError.notFound(INDISTINGUISHABLE_NOT_FOUND_MESSAGE);
}

// Otorisasi Akses Percakapan
export function assertCanAccessConversation(
  caller: AuthenticatedCaller,
  conversation:
    | (Partial<ConversationDocument> & {
        reporterUid?: string | null;
        adminUid?: string | null;
      })
    | null
    | undefined,
  mode: 'read' | 'send' = 'read',
): AuthorizedCaller {
  const authorized = requireAuthorizedUser(caller);

  if (!conversation) {
    throw ApiError.notFound(INDISTINGUISHABLE_NOT_FOUND_MESSAGE);
  }

  const ownerReporterId = resolveConversationReporterId(conversation);
  const assignedAdminId = resolveConversationAdminId(conversation);

  if (authorized.role === 'reporter') {
    if (ownerReporterId === authorized.uid) {
      return authorized;
    }
    throw ApiError.notFound(INDISTINGUISHABLE_NOT_FOUND_MESSAGE);
  }

  if (authorized.role === 'admin' && authorized.claimVerified) {
    const isAssignedToCaller = assignedAdminId === authorized.uid;
    const isUnassigned = !assignedAdminId;

    if (mode === 'read' && (isAssignedToCaller || isUnassigned)) {
      return authorized;
    }
    if (mode === 'send' && isAssignedToCaller) {
      return authorized;
    }

    throw ApiError.notFound(INDISTINGUISHABLE_NOT_FOUND_MESSAGE);
  }

  throw ApiError.notFound(INDISTINGUISHABLE_NOT_FOUND_MESSAGE);
}
