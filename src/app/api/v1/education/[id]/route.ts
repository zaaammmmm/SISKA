import { NextRequest } from 'next/server';
import { tryVerifyBearerToken } from '@/server/authz/verify-token';
import {
  jsonSuccess,
  resolveRequestId,
  toErrorResponse,
} from '@/server/errors/api-error';
import { getEducationDetail } from '@/server/services/education.service';

// GET /api/v1/education/[id]
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = resolveRequestId(request);
  try {
    const { id } = await context.params;
    const caller = await tryVerifyBearerToken(request);
    const result = await getEducationDetail(id, caller);

    return jsonSuccess(result, requestId, 200);
  } catch (error) {
    return toErrorResponse(error, requestId);
  }
}
