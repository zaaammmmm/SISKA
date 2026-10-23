/**
 * SISKA — Single Report Route Handler (`/api/v1/reports/[id]`)
 * Sumber otoritas: docs/04-API-SPEC.yaml (/reports/{reportId} GET & PATCH)
 */

import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import {
  getReportDetail,
  updateReportStatus,
} from '@/server/services/report.service';
import {
  parseJsonObject,
  validateResourceId,
  validateUpdateReportStatusInput,
} from '@/server/validators';

interface ReportRouteParams {
  id: string;
}

/**
 * `GET /api/v1/reports/{reportId}`
 * Mengambil detail laporan beserta sub-koleksi `evidence` dan `statusHistory`.
 * Mengembalikan 404 yang seragam apabila laporan tidak ditemukan atau milik pelapor lain (REP-03).
 */
export const GET = withAuthenticatedRoute<ReportRouteParams>(
  async ({ requestId, caller, params }) => {
    const reportId = validateResourceId(params.id, 'reportId');
    const detail = await getReportDetail(caller, reportId);
    return jsonSuccess(detail, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);

/**
 * `PATCH /api/v1/reports/{reportId}`
 * Memperbarui status laporan oleh Admin (`x-required-role: admin` pada 04-API-SPEC.yaml).
 * Menjalankan transaksi atomik: update status + catat statusHistory + catat auditEvents (REP-04..REP-06).
 */
export const PATCH = withAuthenticatedRoute<ReportRouteParams>(
  async ({ request, requestId, caller, params }) => {
    const reportId = validateResourceId(params.id, 'reportId');
    const rawBody = await parseJsonObject(request);
    const input = validateUpdateReportStatusInput(rawBody);
    const updated = await updateReportStatus(caller, reportId, input, requestId);
    return jsonSuccess(updated, requestId, 200);
  },
  { adminOnly: true },
);

