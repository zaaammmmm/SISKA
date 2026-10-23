/**
 * SISKA — Server Authentication & Authorization Barrel (`src/server/authz`)
 * Sumber otoritas:
 * - docs/05-BACKEND-ARCHITECTURE.md §3 (`server/authz/`) & §4
 * - docs/08-AUTHORIZATION-MATRIX.md
 */

export {
  type AuthenticatedCaller,
  verifyBearerToken,
} from '@/server/authz/verify-token';

export {
  requireAuthorizedUser,
  requireAdmin,
  requireRole,
  resolveConversationReporterId,
  resolveConversationAdminId,
  assertCanReadReport,
  assertCanUploadEvidence,
  assertCanDownloadEvidence,
  assertCanAccessConversation,
} from '@/server/authz/permissions';

export {
  type RouteContext,
  type AuthenticatedRouteContext,
  type RawAuthRouteContext,
  type RouteAuthOptions,
  withAuthenticatedRoute,
  withVerifiedTokenRoute,
} from '@/server/authz/route-handler';

