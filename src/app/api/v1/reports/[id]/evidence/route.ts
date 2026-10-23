/**
 * SISKA — Report Evidence Upload Route Handler (`/api/v1/reports/[id]/evidence`)
 * Sumber otoritas: docs/04-API-SPEC.yaml (/reports/{reportId}/evidence POST)
 */

import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import {
  RATE_LIMIT_POLICIES,
  enforceRateLimit,
} from '@/server/rate-limit/limiter';
import {
  registerEvidenceUpload,
  uploadEvidenceBinary,
} from '@/server/services/evidence.service';
import {
  parseJsonObject,
  validateCreateEvidenceInput,
  validateResourceId,
} from '@/server/validators';

interface ReportEvidenceRouteParams {
  id: string;
}

/**
 * `POST /api/v1/reports/{reportId}/evidence`
 * Mendukung dua mode sesuai docs/04-API-SPEC.yaml & docs/05-BACKEND-ARCHITECTURE.md §4.6:
 * 1. `multipart/form-data`: mengunggah biner langsung dengan inspeksi Magic Bytes, SHA-256, dan kompensasi rollback.
 * 2. `application/json`: memvalidasi metadata (`fileName`, `contentType`, `sizeBytes`) dan mengeluarkan Signed Upload URL.
 */
export const POST = withAuthenticatedRoute<ReportEvidenceRouteParams>(
  async ({ request, requestId, caller, params }) => {
    enforceRateLimit(caller.uid, RATE_LIMIT_POLICIES.UPLOAD_EVIDENCE);
    const reportId = validateResourceId(params.id, 'reportId');
    const contentTypeHeader = request.headers.get('content-type') || '';

    if (contentTypeHeader.toLowerCase().includes('multipart/form-data')) {
      const formData = await request.formData();
      const result = await uploadEvidenceBinary(
        caller,
        reportId,
        formData,
        requestId,
      );
      return jsonSuccess(result, requestId, 201);
    }

    const rawBody = await parseJsonObject(request);
    const input = validateCreateEvidenceInput(rawBody);
    const result = await registerEvidenceUpload(
      caller,
      reportId,
      input,
      requestId,
    );
    return jsonSuccess(result, requestId, 201);
  },
  { roles: ['reporter'] },
);

