import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import {
  RATE_LIMIT_POLICIES,
  enforceRateLimit,
} from '@/server/rate-limit/limiter';
import { listMessages, sendMessage } from '@/server/services/conversation.service';
import {
  parseJsonObject,
  validateMultipartSendMessageInput,
  validatePaginationParams,
  validateResourceId,
  validateSendMessageInput,
} from '@/server/validators';

interface ConversationMessagesRouteParams {
  id: string;
}

// GET /api/v1/conversations/[id]/messages
export const GET = withAuthenticatedRoute<ConversationMessagesRouteParams>(
  async ({ request, requestId, caller, params }) => {
    const conversationId = validateResourceId(params.id, 'conversationId');
    const pagination = validatePaginationParams(request.nextUrl.searchParams, 50, 100);
    const result = await listMessages(caller, conversationId, pagination);
    return jsonSuccess(result, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);

// POST /api/v1/conversations/[id]/messages
export const POST = withAuthenticatedRoute<ConversationMessagesRouteParams>(
  async ({ request, requestId, caller, params }) => {
    enforceRateLimit(caller.uid, RATE_LIMIT_POLICIES.SEND_MESSAGE);
    const conversationId = validateResourceId(params.id, 'conversationId');
    const contentTypeHeader = request.headers.get('content-type') || '';

    if (contentTypeHeader.toLowerCase().includes('multipart/form-data')) {
      const formData = await request.formData();
      const input = await validateMultipartSendMessageInput(formData);
      const created = await sendMessage(caller, conversationId, input);
      return jsonSuccess(created, requestId, 201);
    }

    const rawBody = await parseJsonObject(request);
    const input = validateSendMessageInput(rawBody);
    const created = await sendMessage(caller, conversationId, input);
    return jsonSuccess(created, requestId, 201);
  },
  { roles: ['reporter', 'admin'] },
);
