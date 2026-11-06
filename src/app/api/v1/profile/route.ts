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

// GET /api/v1/profile
export const GET = withAuthenticatedRoute(
  async ({ requestId, caller }) => {
    const profile = await getMyProfile(caller);
    return jsonSuccess(profile, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);

// PATCH /api/v1/profile
export const PATCH = withAuthenticatedRoute(
  async ({ request, requestId, caller }) => {
    const rawBody = await parseJsonObject(request);
    const input = validateUpdateProfileInput(rawBody);
    const updated = await updateMyProfile(caller, input, requestId);
    return jsonSuccess(updated, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);

// POST /api/v1/profile
export const POST = withVerifiedTokenRoute(
  async ({ request, requestId, caller }) => {
    const rawBody = await parseJsonObject(request);
    const input = validateUpdateProfileInput(rawBody);
    const created = await provisionReporterProfile(caller, input, requestId);
    return jsonSuccess(created, requestId, 201);
  },
);
