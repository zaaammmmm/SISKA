import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import {
  RATE_LIMIT_POLICIES,
  enforceRateLimit,
} from '@/server/rate-limit/limiter';
import { createReport, listReports } from '@/server/services/report.service';
import {
  parseJsonObject,
  validateCreateReportInput,
  validateListReportsQuery,
} from '@/server/validators';

// GET /api/v1/reports
export const GET = withAuthenticatedRoute(
  async ({ request, requestId, caller }) => {
    const query = validateListReportsQuery(request.nextUrl.searchParams);
    const page = await listReports(caller, query);
    return jsonSuccess(page, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);

// POST /api/v1/reports
export const POST = withAuthenticatedRoute(
  async ({ request, requestId, caller }) => {
    enforceRateLimit(caller.uid, RATE_LIMIT_POLICIES.CREATE_REPORT);
    const rawBody = await parseJsonObject(request);
    const input = validateCreateReportInput(rawBody);
    const created = await createReport(caller, input, requestId);
    return jsonSuccess(created, requestId, 201);
  },
  { roles: ['reporter'] },
);
