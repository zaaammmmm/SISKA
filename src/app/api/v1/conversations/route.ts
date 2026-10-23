/**
 * SISKA — Conversations Collection Route Handler (`/api/v1/conversations`)
 * Sumber otoritas: docs/04-API-SPEC.yaml (/conversations GET & POST)
 */

import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import {
  RATE_LIMIT_POLICIES,
  enforceRateLimit,
} from '@/server/rate-limit/limiter';
import {
  createOrOpenConversation,
  listConversations,
} from '@/server/services/conversation.service';
import {
  parseJsonObject,
  validateCreateConversationInput,
} from '@/server/validators';

/**
 * `GET /api/v1/conversations`
 * Mengambil daftar percakapan milik pemanggil (reporter) atau yang ditugaskan kepada petugas (admin)
 * dengan amplop standar `{ items, nextCursor }`.
 */
export const GET = withAuthenticatedRoute(
  async ({ requestId, caller }) => {
    const result = await listConversations(caller);
    return jsonSuccess(result, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);

/**
 * `POST /api/v1/conversations`
 * Membuat (`201 Created`) atau membuka kembali (`200 OK`) percakapan yang sah untuk pelapor (`reporter`).
 */
export const POST = withAuthenticatedRoute(
  async ({ request, requestId, caller }) => {
    enforceRateLimit(caller.uid, RATE_LIMIT_POLICIES.SEND_MESSAGE);
    const rawBody = await parseJsonObject(request);
    const input = validateCreateConversationInput(rawBody);
    const result = await createOrOpenConversation(caller, input);
    return jsonSuccess(
      result.conversation,
      requestId,
      result.created ? 201 : 200,
    );
  },
  { roles: ['reporter'] },
);
