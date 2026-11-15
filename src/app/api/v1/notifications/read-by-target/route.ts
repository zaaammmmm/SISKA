import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import { markNotificationsReadByTarget } from '@/server/services/notification.service';
import { parseJsonObject } from '@/server/validators/common';
import { validateMarkReadByTargetInput } from '@/server/validators/notification.validator';

// PATCH /api/v1/notifications/read-by-target
export const PATCH = withAuthenticatedRoute(
  async ({ request, caller, requestId }) => {
    const input = validateMarkReadByTargetInput(await parseJsonObject(request));
    const result = await markNotificationsReadByTarget(caller, input);
    return jsonSuccess(result, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);
