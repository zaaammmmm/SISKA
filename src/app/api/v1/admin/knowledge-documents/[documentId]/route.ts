/**
 * SISKA — Single Knowledge Base Document Route Handler
 * (`/api/v1/admin/knowledge-documents/[documentId]`)
 * Sumber otoritas: docs/04-API-SPEC.yaml (/admin/knowledge-documents/{documentId} DELETE), docs/09-TEST-PLAN.md KB-03
 */

import { NextResponse } from 'next/server';
import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import {
  RATE_LIMIT_POLICIES,
  enforceRateLimit,
} from '@/server/rate-limit/limiter';
import { deleteKnowledgeDocument } from '@/server/services/knowledge.service';
import { validateResourceId } from '@/server/validators';

interface KnowledgeDocRouteParams {
  documentId: string;
}

/**
 * `DELETE /api/v1/admin/knowledge-documents/{documentId}`
 * Menghapus dokumen Knowledge Base, seluruh `knowledgeChunks` terkait, dan berkas PDF di Cloud Storage (KB-03).
 * Mengembalikan `204 No Content` sesuai docs/04-API-SPEC.yaml.
 */
export const DELETE = withAuthenticatedRoute<KnowledgeDocRouteParams>(
  async ({ requestId, caller, params }) => {
    enforceRateLimit(caller.uid, RATE_LIMIT_POLICIES.ADMIN_MUTATION);
    const documentId = validateResourceId(params.documentId, 'documentId');
    await deleteKnowledgeDocument(caller, documentId, requestId);

    return new NextResponse(null, {
      status: 204,
      headers: {
        'X-Request-Id': requestId,
        'Cache-Control': 'no-store',
      },
    });
  },
  { adminOnly: true },
);

