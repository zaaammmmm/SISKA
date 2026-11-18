import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import { authorizeMessageAttachmentDownload } from '@/server/services/conversation.service';
import { validateResourceId } from '@/server/validators';

interface MessageAttachmentRouteParams {
  id: string;
  messageId: string;
}

// GET /api/v1/conversations/[id]/messages/[messageId]/attachment
export const GET = withAuthenticatedRoute<MessageAttachmentRouteParams>(
  async ({ requestId, caller, params }) => {
    const conversationId = validateResourceId(params.id, 'conversationId');
    const messageId = validateResourceId(params.messageId, 'messageId');
    const signed = await authorizeMessageAttachmentDownload(
      caller,
      conversationId,
      messageId,
      requestId,
    );
    return jsonSuccess(signed, requestId, 200);
  },
  { roles: ['reporter', 'admin'] },
);
