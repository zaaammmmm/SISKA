import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import { listUserNotifications } from '@/server/services/notification.service';
import { validateListNotificationsQuery } from '@/server/validators/notification.validator';

// GET /api/v1/notifications
export const GET = withAuthenticatedRoute(
  async ({ request, caller, requestId }) => {
    const query = validateListNotificationsQuery(request.nextUrl.searchParams);
    const result = await listUserNotifications(caller, query);

    return jsonSuccess(result, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);
