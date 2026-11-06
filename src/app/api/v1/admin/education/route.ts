import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import { createEducationMaterial } from '@/server/services/education.service';
import { parseJsonObject } from '@/server/validators/common';
import { validateCreateEducationInput } from '@/server/validators/education.validator';

// POST /api/v1/admin/education
export const POST = withAuthenticatedRoute(
  async ({ request, caller, requestId }) => {
    const rawBody = await parseJsonObject(request);
    const input = validateCreateEducationInput(rawBody);
    const result = await createEducationMaterial(caller, input, requestId);

    return jsonSuccess(result, requestId, 201);
  },
  { adminOnly: true },
);
