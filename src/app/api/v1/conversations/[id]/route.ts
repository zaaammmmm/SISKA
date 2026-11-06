import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import {
  RATE_LIMIT_POLICIES,
  enforceRateLimit,
} from '@/server/rate-limit/limiter';
import {
  getConversationById,
  updateConversationByAdmin,
} from '@/server/services/conversation.service';
import {
  parseJsonObject,
  validateResourceId,
  validateUpdateConversationAdminInput,
} from '@/server/validators';

interface ConversationRouteParams {
  id: string;
}

// GET /api/v1/conversations/[id]
export const GET = withAuthenticatedRoute<ConversationRouteParams>(
  async ({ requestId, caller, params }) => {
    const conversationId = validateResourceId(params.id, 'conversationId');
    const conversation = await getConversationById(caller, conversationId);
    return jsonSuccess(conversation, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);

// PATCH /api/v1/conversations/[id]
export const PATCH = withAuthenticatedRoute<ConversationRouteParams>(
  async ({ request, requestId, caller, params }) => {
    enforceRateLimit(caller.uid, RATE_LIMIT_POLICIES.ADMIN_MUTATION);
    const conversationId = validateResourceId(params.id, 'conversationId');
    const rawBody = await parseJsonObject(request);
    const input = validateUpdateConversationAdminInput(rawBody);
    const updated = await updateConversationByAdmin(
      caller,
      conversationId,
      input,
      requestId,
    );
    return jsonSuccess(updated, requestId, 200);
  },
  { adminOnly: true },
);
