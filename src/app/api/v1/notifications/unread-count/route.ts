import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import { getUnreadNotificationCount } from '@/server/services/notification.service';

// GET /api/v1/notifications/unread-count
export const GET = withAuthenticatedRoute(
  async ({ caller, requestId }) => {
    const result = await getUnreadNotificationCount(caller);
    return jsonSuccess(result, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);
