/**
 * SISKA — Reports Summary Route Handler (`/api/v1/reports/summary`)
 * Sumber otoritas: docs/01-SRS.md FR-005 (User dashboard) & FR-015 (Admin dashboard aggregate statistics)
 */

import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import { getReportsSummary } from '@/server/services/report.service';

/**
 * `GET /api/v1/reports/summary`
 * Mengembalikan agregat jumlah laporan berdasarkan status:
 * - Untuk `reporter`: hanya menghitung laporan milik pelapor itu sendiri (FR-005).
 * - Untuk `admin`: menghitung statistik agregat tanpa menyertakan identitas pelapor atau narasi laporan (FR-015).
 */
export const GET = withAuthenticatedRoute(
  async ({ requestId, caller }) => {
    const summary = await getReportsSummary(caller);
    return jsonSuccess(summary, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);

