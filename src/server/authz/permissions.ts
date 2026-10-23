/**
 * SISKA — Authorization Service & RBAC Enforcement (`AuthzService`)
 * Sumber otoritas:
 * - docs/08-AUTHORIZATION-MATRIX.md
 * - docs/05-BACKEND-ARCHITECTURE.md §2.3, §4.4, §8 ("Jangan membedakan 'resource tidak ada' dengan 'resource milik orang lain' jika pembedaan membocorkan keberadaan data.")
 * - docs/09-TEST-PLAN.md (AUTH-04, REP-03, REP-04, FILE-03, CHAT-01, CHAT-02, KB-02)
 */

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

/**
 * Pesan 404 seragam untuk seluruh akses tingkat-entitas (reports, evidence, conversations)
 * guna mencegah kebocoran IDOR maupun enumerasi ID (REP-03, FILE-03, CHAT-02).
 */
export const INDISTINGUISHABLE_NOT_FOUND_MESSAGE =
  'Data yang diminta tidak ditemukan atau tidak tersedia untuk akun Anda.';

/**
 * Helper normalisasi UID pelapor pada dokumen percakapan.
 * Mendukung nama field kanonis `reporterId` sekaligus alias `reporterUid` (docs/02-ERD.md).
 */
export function resolveConversationReporterId(
  conversation: Partial<ConversationDocument> & { reporterUid?: string | null },
): string {
  return String(conversation.reporterId ?? conversation.reporterUid ?? '');
}

/**
 * Helper normalisasi UID admin yang ditugaskan pada dokumen percakapan.
 * Mendukung nama field kanonis `assignedAdminId` sekaligus alias `adminUid` (docs/02-ERD.md).
 */
export function resolveConversationAdminId(
  conversation: Partial<ConversationDocument> & { adminUid?: string | null },
): string | null {
  const raw = conversation.assignedAdminId ?? conversation.adminUid ?? null;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
}

/**
 * Memastikan pemanggil memiliki peran sah di SISKA (`'reporter'` atau `'admin'`).
 * Menolak akun tanpa peran (mis. akun yang belum diprovisioning) dengan 403 FORBIDDEN.
 */
export function requireAuthorizedUser(caller: AuthenticatedCaller): AuthorizedCaller {
  if (!caller.role) {
    throw ApiError.forbidden(
      'Akun Anda belum memiliki hak akses aktif pada layanan SISKA.',
    );
  }
  return caller as AuthorizedCaller;
}

/**
 * Memastikan pemanggil memiliki peran `'admin'` yang terverifikasi lewat Custom Claim.
 * Sesuai docs/08-AUTHORIZATION-MATRIX.md & KB-02 / REP-04.
 */
export function requireAdmin(caller: AuthenticatedCaller): AuthorizedCaller {
  const authorized = requireAuthorizedUser(caller);
  if (authorized.role !== 'admin' || !authorized.claimVerified) {
    throw ApiError.forbidden(
      'Tindakan ini hanya dapat dilakukan oleh petugas/admin berwenang.',
    );
  }
  return authorized;
}

/**
 * Memastikan pemanggil memiliki peran di dalam daftar `allowedRoles` pada level endpoint.
 */
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

/**
 * Memeriksa hak baca terhadap suatu laporan (`reports/{reportId}`).
 * - Reporter hanya boleh membaca laporan miliknya sendiri (`report.reporterId === caller.uid`).
 * - Baik ketika laporan tidak ada MAUPUN ketika laporan milik orang lain, selalu melempar
 *   `404 NOT_FOUND` dengan pesan yang 100% identik (REP-03 & docs/05-BACKEND-ARCHITECTURE.md §8).
 */
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

/**
 * Memeriksa hak unggah bukti (`reports/{reportId}/evidence`).
 * Sesuai docs/08-AUTHORIZATION-MATRIX.md & docs/05-BACKEND-ARCHITECTURE.md §8:
 * - Hanya pelapor pemilik laporan yang dapat menambahkan bukti pada laporannya.
 * - Baik ketika `report` tidak ada maupun milik pelapor lain, melempar `404 NOT_FOUND`
 *   dengan pesan yang 100% seragam agar tidak bisa dipakai untuk enumerasi ID laporan.
 */
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

/**
 * Memeriksa hak unduh bukti (`reports/{reportId}/evidence/{evidenceId}/download`).
 * Sesuai docs/08-AUTHORIZATION-MATRIX.md, FILE-03, & docs/05-BACKEND-ARCHITECTURE.md §8:
 * - Hanya pemilik laporan (`reporterId === caller.uid`) atau admin berwenang yang boleh meminta Signed URL.
 * - Baik ketika laporan tidak ditemukan maupun ketika laporan milik orang lain,
 *   selalu melempar `404 NOT_FOUND` dengan pesan yang 100% seragam (mencegah enumerasi ID / IDOR).
 */
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

/**
 * Memeriksa hak akses baca/kirim pesan pada percakapan (`conversations/{conversationId}`).
 * Sesuai docs/08-AUTHORIZATION-MATRIX.md, CHAT-01, CHAT-02, & docs/05-BACKEND-ARCHITECTURE.md §8:
 * - Reporter hanya boleh mengakses percakapan miliknya (`reporterId === caller.uid`).
 * - Admin hanya boleh mengakses percakapan yang ditugaskan kepadanya (`assignedAdminId === caller.uid`)
 *   atau percakapan yang belum memiliki petugas (`assignedAdminId === null`).
 * - Baik ketika percakapan tidak ada maupun milik peserta lain, selalu melempar `404 NOT_FOUND`
 *   dengan pesan yang 100% identik sehingga ID percakapan tidak dapat dienumerasi (Anti-IDOR).
 */
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
