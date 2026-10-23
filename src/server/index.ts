/**
 * SISKA — Master Server Entry Point (`src/server`)
 *
 * Arsitektur & Alur Eksekusi API Backend (`docs/05-BACKEND-ARCHITECTURE.md` §4):
 * 1. `authz`: Verifikasi Firebase ID Token (`verifyBearerToken`) & RBAC/Ownership (`permissions.ts`).
 * 2. `rate-limit`: Pembatasan laju per UID/aksi (`enforceRateLimit`).
 * 3. `validators`: Validasi input skema allowlist ketat & inspeksi Magic Bytes berkas.
 * 4. `services`: Logika domain (`Report`, `Evidence`, `Conversation`, `KnowledgeBase`, `Ai`, `Profile`, `Audit`).
 * 5. `audit`: Pencatatan audit trail tanpa PII (`recordAuditEventInTransaction`).
 * 6. `errors`: Format respons seragam `{ data }` atau `{ code, message, requestId }`.
 * 7. `contracts`: Kontrak integrasi eksplisit untuk Tim Frontend (`BACKEND_API_MANIFEST`) & Tim AI (`ai-service.contract.ts`).
 */

export * from '@/server/authz';
export * from '@/server/services';
export * from '@/server/validators';
export * from '@/server/audit';
export {
  API_ERROR_CODES,
  type ApiErrorCode,
  type ApiErrorBody,
  type ApiErrorOptions,
  ApiError,
  toErrorResponse,
  jsonSuccess,
  resolveRequestId,
} from '@/server/errors/api-error';
export {
  type RateLimitRule,
  RATE_LIMIT_POLICIES,
  enforceRateLimit,
} from '@/server/rate-limit/limiter';
export * from '@/server/contracts/ai-service.contract';
export * from '@/server/contracts/backend-api.manifest';

