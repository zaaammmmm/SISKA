import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import { broadcastNotificationByAdmin } from '@/server/services/notification.service';
import { parseJsonObject } from '@/server/validators/common';
import { validateBroadcastNotificationInput } from '@/server/validators/notification.validator';

// POST /api/v1/admin/notifications/broadcast
export const POST = withAuthenticatedRoute(
  async ({ request, caller, requestId }) => {
    const rawBody = await parseJsonObject(request);
    const input = validateBroadcastNotificationInput(rawBody);
    const result = await broadcastNotificationByAdmin(
      caller,
      input,
      requestId,
    );

    return jsonSuccess(result, requestId, 201);
  },
  { adminOnly: true },
);
