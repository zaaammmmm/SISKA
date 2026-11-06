import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import {
  RATE_LIMIT_POLICIES,
  enforceRateLimit,
} from '@/server/rate-limit/limiter';
import { requestKnowledgeReindex } from '@/server/services/knowledge.service';

// POST /api/v1/admin/knowledge-documents/reindex
export const POST = withAuthenticatedRoute(
  async ({ requestId, caller }) => {
    enforceRateLimit(caller.uid, RATE_LIMIT_POLICIES.ADMIN_MUTATION);
    const result = await requestKnowledgeReindex(caller, requestId);
    return jsonSuccess(result, requestId, 202);
  },
  { adminOnly: true },
);
