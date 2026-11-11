import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import { markConversationAsRead } from '@/server/services/conversation.service';
import { validateResourceId } from '@/server/validators';

// POST /api/v1/conversations/{id}/read
export const POST = withAuthenticatedRoute<{ id: string }>(
  async ({ requestId, caller, params }) => {
    const conversationId = validateResourceId(params.id, 'conversationId');
    const result = await markConversationAsRead(caller, conversationId);
    return jsonSuccess(result, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);
