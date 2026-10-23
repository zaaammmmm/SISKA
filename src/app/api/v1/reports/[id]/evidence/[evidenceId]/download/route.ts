/**
 * SISKA — Evidence Download Authorization Route Handler
 * (`/api/v1/reports/[id]/evidence/[evidenceId]/download`)
 * Sumber otoritas: docs/04-API-SPEC.yaml (/reports/{reportId}/evidence/{evidenceId}/download GET)
 */

import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import { authorizeEvidenceDownload } from '@/server/services/evidence.service';
import { validateResourceId } from '@/server/validators';

interface EvidenceDownloadRouteParams {
  id: string;
  evidenceId: string;
}

/**
 * `GET /api/v1/reports/{reportId}/evidence/{evidenceId}/download`
 * Memeriksa hak akses pemanggil terhadap laporan terkait (FILE-03) dan menerbitkan
 * Signed URL yang berlaku maksimal 300 detik (5 menit).
 */
export const GET = withAuthenticatedRoute<EvidenceDownloadRouteParams>(
  async ({ requestId, caller, params }) => {
    const reportId = validateResourceId(params.id, 'reportId');
    const evidenceId = validateResourceId(params.evidenceId, 'evidenceId');
    const signed = await authorizeEvidenceDownload(
      caller,
      reportId,
      evidenceId,
      requestId,
    );
    return jsonSuccess(signed, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);

