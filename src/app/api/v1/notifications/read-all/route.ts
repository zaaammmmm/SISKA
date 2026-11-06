import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import { markAllNotificationsAsRead } from '@/server/services/notification.service';

// PATCH /api/v1/notifications/read-all
export const PATCH = withAuthenticatedRoute(
  async ({ caller, requestId }) => {
    const result = await markAllNotificationsAsRead(caller);
    return jsonSuccess(result, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);
