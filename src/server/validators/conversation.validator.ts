/**
 * SISKA — Conversation & Message Input Validators
 * Sumber otoritas:
 * - docs/04-API-SPEC.yaml (/conversations, /conversations/{conversationId}/messages)
 * - docs/05-BACKEND-ARCHITECTURE.md §4.3 ("jangan menerima reporterId, role, atau senderId sebagai otoritas dari client")
 * - docs/09-TEST-PLAN.md CHAT-01, CHAT-03
 */

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

/**
 * Validasi body `POST /api/v1/conversations`:
 * - `reportId`: string opsional (jika dikaitkan dengan laporan tertentu milik pelapor)
 * Menolak `reporterId` atau `assignedAdminId` dari client.
 */
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

/**
 * Validasi body `POST /api/v1/conversations/{conversationId}/messages` sesuai docs/04-API-SPEC.yaml:
 * - `body`: string [1..10000] (wajib)
 * Menolak `senderUid` dari client (pengirim wajib diturunkan dari token terverifikasi).
 */
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

/**
 * Validasi opsional untuk admin saat mengambil alih atau menutup percakapan.
 */
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
