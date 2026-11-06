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

// DELETE /api/v1/admin/knowledge-documents/[documentId]
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
