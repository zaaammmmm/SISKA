import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import {
  getReportDetail,
  updateReportStatus,
} from '@/server/services/report.service';
import {
  parseJsonObject,
  validateResourceId,
  validateUpdateReportStatusInput,
} from '@/server/validators';

interface ReportRouteParams {
  id: string;
}

// GET /api/v1/reports/[id]
export const GET = withAuthenticatedRoute<ReportRouteParams>(
  async ({ requestId, caller, params }) => {
    const reportId = validateResourceId(params.id, 'reportId');
    const detail = await getReportDetail(caller, reportId);
    return jsonSuccess(detail, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);

// PATCH /api/v1/reports/[id]
export const PATCH = withAuthenticatedRoute<ReportRouteParams>(
  async ({ request, requestId, caller, params }) => {
    const reportId = validateResourceId(params.id, 'reportId');
    const rawBody = await parseJsonObject(request);
    const input = validateUpdateReportStatusInput(rawBody);
    const updated = await updateReportStatus(caller, reportId, input, requestId);
    return jsonSuccess(updated, requestId, 200);
  },
  { adminOnly: true },
);
