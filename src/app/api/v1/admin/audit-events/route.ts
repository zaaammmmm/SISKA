import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import { listAuditEvents } from '@/server/services/audit.service';
import { validatePaginationParams } from '@/server/validators';

// GET /api/v1/admin/audit-events
export const GET = withAuthenticatedRoute(
  async ({ request, requestId, caller }) => {
    const pagination = validatePaginationParams(request.nextUrl.searchParams, 20, 50);
    const result = await listAuditEvents(caller, pagination);
    return jsonSuccess(result, requestId, 200);
  },
  { adminOnly: true },
);
