/**
 * SISKA — Admin Audit Events Route Handler (`/api/v1/admin/audit-events`)
 * Sumber otoritas:
 * - docs/01-SRS.md FR-013, NFR-OBS-01
 * - docs/05-BACKEND-ARCHITECTURE.md §3
 * - docs/08-AUTHORIZATION-MATRIX.md ("Audit events: Reporter Deny; Admin Restricted read; no client writes")
 * - docs/09-TEST-PLAN.md PRIV-01
 */

import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import { listAuditEvents } from '@/server/services/audit.service';
import { validatePaginationParams } from '@/server/validators';

/**
 * `GET /api/v1/admin/audit-events`
 * Mengambil riwayat `auditEvents` berpaginasi khusus Admin.
 * Hanya mengembalikan metadata aman (`actorUid`, `action`, `targetType`, `targetId`, `occurredAt`, `requestId`).
 */
export const GET = withAuthenticatedRoute(
  async ({ request, requestId, caller }) => {
    const pagination = validatePaginationParams(request.nextUrl.searchParams, 20, 50);
    const result = await listAuditEvents(caller, pagination);
    return jsonSuccess(result, requestId, 200);
  },
  { adminOnly: true },
);

