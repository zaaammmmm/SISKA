/**
 * SISKA — Admin Knowledge Base Documents Route Handler (`/api/v1/admin/knowledge-documents`)
 * Sumber otoritas: docs/04-API-SPEC.yaml (/admin/knowledge-documents GET & POST), docs/09-TEST-PLAN.md KB-01, KB-02
 */

import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import {
  RATE_LIMIT_POLICIES,
  enforceRateLimit,
} from '@/server/rate-limit/limiter';
import {
  listKnowledgeDocuments,
  uploadKnowledgeDocument,
} from '@/server/services/knowledge.service';
import { validateKnowledgePdfFormData } from '@/server/validators';

/**
 * `GET /api/v1/admin/knowledge-documents`
 * Mengambil daftar dokumen Knowledge Base beserta status pengindeksan (khusus Admin — KB-02).
 */
export const GET = withAuthenticatedRoute(
  async ({ requestId, caller }) => {
    const result = await listKnowledgeDocuments(caller);
    return jsonSuccess(result, requestId, 200);
  },
  { adminOnly: true },
);

/**
 * `POST /api/v1/admin/knowledge-documents`
 * Mengunggah berkas PDF resmi untuk diindeks ke Knowledge Base (khusus Admin — KB-01).
 * Mengembalikan `202 Accepted` sesuai docs/04-API-SPEC.yaml.
 */
export const POST = withAuthenticatedRoute(
  async ({ request, requestId, caller }) => {
    enforceRateLimit(caller.uid, RATE_LIMIT_POLICIES.ADMIN_MUTATION);
    const formData = await request.formData();
    const upload = await validateKnowledgePdfFormData(formData);
    const created = await uploadKnowledgeDocument(caller, upload, requestId);
    return jsonSuccess(created, requestId, 202);
  },
  { adminOnly: true },
);

