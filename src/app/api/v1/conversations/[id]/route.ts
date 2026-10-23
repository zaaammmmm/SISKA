/**
 * SISKA — Single Conversation Route Handler (`/api/v1/conversations/[id]`)
 * Sumber otoritas: docs/01-SRS.md FR-010, docs/08-AUTHORIZATION-MATRIX.md
 */

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

/**
 * `GET /api/v1/conversations/{conversationId}`
 * Mengambil detail percakapan bagi partisipan yang sah.
 */
export const GET = withAuthenticatedRoute<ConversationRouteParams>(
  async ({ requestId, caller, params }) => {
    const conversationId = validateResourceId(params.id, 'conversationId');
    const conversation = await getConversationById(caller, conversationId);
    return jsonSuccess(conversation, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);

/**
 * `PATCH /api/v1/conversations/{conversationId}`
 * Memperbarui penugasan admin (`assignedAdminId`) atau status percakapan (`open` | `closed`) khusus Admin.
 */
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

