/**
 * SISKA — Current User Profile Route Handler (`/api/v1/profile`)
 * Sumber otoritas: docs/04-API-SPEC.yaml (/profile GET & PATCH), docs/09-TEST-PLAN.md AUTH-01, AUTH-04
 */

import {
  withAuthenticatedRoute,
  withVerifiedTokenRoute,
} from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import {
  getMyProfile,
  provisionReporterProfile,
  updateMyProfile,
} from '@/server/services/profile.service';
import {
  parseJsonObject,
  validateUpdateProfileInput,
} from '@/server/validators';

/**
 * `GET /api/v1/profile`
 * Mengambil profil pengguna aktif yang sedang login (wajib memiliki role sah).
 */
export const GET = withAuthenticatedRoute(
  async ({ requestId, caller }) => {
    const profile = await getMyProfile(caller);
    return jsonSuccess(profile, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);

/**
 * `PATCH /api/v1/profile`
 * Memperbarui field profil yang diizinkan (`displayName`) untuk pengguna berwenang (`reporter` / `admin`).
 * Menolak akun tanpa peran (mis. `seed_outsider`) secara murni melalui RBAC (`withAuthenticatedRoute`),
 * serta menolak setiap usaha menyisipkan `role` pada body (AUTH-04).
 */
export const PATCH = withAuthenticatedRoute(
  async ({ request, requestId, caller }) => {
    const rawBody = await parseJsonObject(request);
    const input = validateUpdateProfileInput(rawBody);
    const updated = await updateMyProfile(caller, input, requestId);
    return jsonSuccess(updated, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);

/**
 * `POST /api/v1/profile`
 * Inisialisasi satu kali dokumen profil `users/{uid}` dengan `role: 'reporter'`
 * setelah pengguna menyelesaikan registrasi di Firebase Auth (FR-002 / AUTH-01).
 */
export const POST = withVerifiedTokenRoute(
  async ({ request, requestId, caller }) => {
    const rawBody = await parseJsonObject(request);
    const input = validateUpdateProfileInput(rawBody);
    const created = await provisionReporterProfile(caller, input, requestId);
    return jsonSuccess(created, requestId, 201);
  },
);
