import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import {
  RATE_LIMIT_POLICIES,
  enforceRateLimit,
} from '@/server/rate-limit/limiter';
import { answerGeneralQuestion } from '@/server/services/ai.service';
import {
  parseJsonObject,
  validateAiChatInput,
} from '@/server/validators';

// POST /api/v1/ai/chat
export const POST = withAuthenticatedRoute(
  async ({ request, requestId, caller }) => {
    enforceRateLimit(caller.uid, RATE_LIMIT_POLICIES.AI_CHAT);
    const rawBody = await parseJsonObject(request);
    const input = validateAiChatInput(rawBody);
    const response = await answerGeneralQuestion(caller, input, requestId);
    return jsonSuccess(response, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);
