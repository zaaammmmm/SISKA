import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import { markNotificationAsRead } from '@/server/services/notification.service';

// PATCH /api/v1/notifications/[id]/read
export const PATCH = withAuthenticatedRoute<{ id: string }>(
  async ({ caller, params, requestId }) => {
    const result = await markNotificationAsRead(caller, params.id);
    return jsonSuccess(result, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);
