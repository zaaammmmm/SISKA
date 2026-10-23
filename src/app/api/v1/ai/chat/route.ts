/**
 * SISKA — AI General Informational Q&A Route Handler (`/api/v1/ai/chat`)
 * Sumber otoritas:
 * - docs/04-API-SPEC.yaml (/ai/chat POST)
 * - docs/06-AI-ARCHITECTURE.md
 * - docs/09-TEST-PLAN.md AI-01..AI-05, REL-01
 */

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

/**
 * `POST /api/v1/ai/chat`
 * Menjawab pertanyaan informasi umum menggunakan dokumen Knowledge Base terverifikasi.
 * Tidak pernah menerima atau mengakses data laporan pribadi (NFR-PRIV-02).
 */
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

