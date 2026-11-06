import { ApiError } from '@/server/errors/api-error';
import {
  assertAllowlistedKeys,
  validateOptionalString,
  validateRequiredString,
  validateResourceId,
} from '@/server/validators/common';

export interface CreateConversationInput {
  reportId: string | null;
}

export interface SendMessageInput {
  body: string;
}

const CREATE_CONVERSATION_ALLOWED_KEYS = ['reportId'] as const;

// Validasi Input Pembuatan Percakapan
export function validateCreateConversationInput(
  payload: Record<string, unknown>,
): CreateConversationInput {
  assertAllowlistedKeys(
    payload,
    CREATE_CONVERSATION_ALLOWED_KEYS,
    'pembuatan percakapan',
  );

  if (
    payload.reportId === undefined ||
    payload.reportId === null ||
    payload.reportId === ''
  ) {
    return { reportId: null };
  }

  return {
    reportId: validateResourceId(payload.reportId, 'reportId'),
  };
}

const SEND_MESSAGE_ALLOWED_KEYS = ['body'] as const;

// Validasi Input Pengiriman Pesan
export function validateSendMessageInput(
  payload: Record<string, unknown>,
): SendMessageInput {
  assertAllowlistedKeys(payload, SEND_MESSAGE_ALLOWED_KEYS, 'pengiriman pesan');

  const body = validateRequiredString(payload.body, 'body', {
    minLength: 1,
    maxLength: 10000,
  });

  return { body };
}

const ASSIGN_CONVERSATION_ALLOWED_KEYS = ['assignedAdminId', 'status'] as const;

export interface UpdateConversationAdminInput {
  assignedAdminId?: string | null;
  status?: 'open' | 'closed';
}

// Validasi Pembaruan Percakapan Admin
export function validateUpdateConversationAdminInput(
  payload: Record<string, unknown>,
): UpdateConversationAdminInput {
  assertAllowlistedKeys(
    payload,
    ASSIGN_CONVERSATION_ALLOWED_KEYS,
    'pembaruan percakapan admin',
  );

  const result: UpdateConversationAdminInput = {};

  if ('assignedAdminId' in payload) {
    result.assignedAdminId =
      payload.assignedAdminId === null
        ? null
        : validateOptionalString(payload.assignedAdminId, 'assignedAdminId', {
            maxLength: 128,
          });
  }

  if ('status' in payload && payload.status !== undefined) {
    if (payload.status !== 'open' && payload.status !== 'closed') {
      const msg = "Field 'status' harus bernilai 'open' atau 'closed'.";
      throw ApiError.validation(msg, { status: msg });
    }
    result.status = payload.status;
  }

  return result;
}
