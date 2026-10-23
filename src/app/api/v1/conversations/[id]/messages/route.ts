/**
 * SISKA — Conversation Messages Route Handler (`/api/v1/conversations/[id]/messages`)
 * Sumber otoritas: docs/04-API-SPEC.yaml (/conversations/{conversationId}/messages GET & POST)
 */

import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import {
  RATE_LIMIT_POLICIES,
  enforceRateLimit,
} from '@/server/rate-limit/limiter';
import { listMessages, sendMessage } from '@/server/services/conversation.service';
import {
  parseJsonObject,
  validatePaginationParams,
  validateResourceId,
  validateSendMessageInput,
} from '@/server/validators';

interface ConversationMessagesRouteParams {
  id: string;
}

/**
 * `GET /api/v1/conversations/{conversationId}/messages`
 * Mengambil daftar pesan untuk peserta percakapan yang berwenang (CHAT-01, CHAT-02).
 */
export const GET = withAuthenticatedRoute<ConversationMessagesRouteParams>(
  async ({ request, requestId, caller, params }) => {
    const conversationId = validateResourceId(params.id, 'conversationId');
    const pagination = validatePaginationParams(request.nextUrl.searchParams, 50, 100);
    const result = await listMessages(caller, conversationId, pagination);
    return jsonSuccess(result, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);

/**
 * `POST /api/v1/conversations/{conversationId}/messages`
 * Mengirim pesan baru pada percakapan. `senderUid` diturunkan dari token terverifikasi.
 */
export const POST = withAuthenticatedRoute<ConversationMessagesRouteParams>(
  async ({ request, requestId, caller, params }) => {
    enforceRateLimit(caller.uid, RATE_LIMIT_POLICIES.SEND_MESSAGE);
    const conversationId = validateResourceId(params.id, 'conversationId');
    const rawBody = await parseJsonObject(request);
    const input = validateSendMessageInput(rawBody);
    const created = await sendMessage(caller, conversationId, input);
    return jsonSuccess(created, requestId, 201);
  },
  { roles: ['reporter', 'admin'] },
);

