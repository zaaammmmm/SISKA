import { NextRequest } from 'next/server';
import { tryVerifyBearerToken } from '@/server/authz/verify-token';
import {
  jsonSuccess,
  resolveRequestId,
  toErrorResponse,
} from '@/server/errors/api-error';
import { listEducationMaterials } from '@/server/services/education.service';
import { validateListEducationQuery } from '@/server/validators/education.validator';

// GET /api/v1/education
export async function GET(request: NextRequest) {
  const requestId = resolveRequestId(request);
  try {
    const caller = await tryVerifyBearerToken(request);
    const query = validateListEducationQuery(request.nextUrl.searchParams);
    const result = await listEducationMaterials(query, caller);

    return jsonSuccess(result, requestId, 200);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
