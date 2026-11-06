import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import {
  deleteEducationMaterial,
  updateEducationMaterial,
} from '@/server/services/education.service';
import { parseJsonObject } from '@/server/validators/common';
import { validateUpdateEducationInput } from '@/server/validators/education.validator';

// PATCH /api/v1/admin/education/[id]
export const PATCH = withAuthenticatedRoute<{ id: string }>(
  async ({ request, caller, params, requestId }) => {
    const rawBody = await parseJsonObject(request);
    const input = validateUpdateEducationInput(rawBody);
    const result = await updateEducationMaterial(
      caller,
      params.id,
      input,
      requestId,
    );

    return jsonSuccess(result, requestId, 200);
  },
  { adminOnly: true },
);

// DELETE /api/v1/admin/education/[id]
export const DELETE = withAuthenticatedRoute<{ id: string }>(
  async ({ caller, params, requestId }) => {
    const result = await deleteEducationMaterial(caller, params.id, requestId);
    return jsonSuccess(result, requestId, 200);
  },
  { adminOnly: true },
);
