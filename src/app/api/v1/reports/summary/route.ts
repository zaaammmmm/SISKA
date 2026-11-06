import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import { getReportsSummary } from '@/server/services/report.service';

// GET /api/v1/reports/summary
export const GET = withAuthenticatedRoute(
  async ({ requestId, caller }) => {
    const summary = await getReportsSummary(caller);
    return jsonSuccess(summary, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);
