import { ApiError } from '@/server/errors/api-error';
import {
  assertAllowlistedKeys,
  validatePaginationParams,
  validateOptionalString,
  validateRequiredString,
  type PaginationParams,
} from '@/server/validators/common';
import {
  NOTIFICATION_TARGET_TYPES,
  type NotificationTargetType,
} from '@/types/domain';

export interface ListNotificationsQuery extends PaginationParams {
  unreadOnly?: boolean;
}

export interface BroadcastNotificationInput {
  title: string;
  body: string;
  targetType?: NotificationTargetType;
  targetId?: string | null;
  targetRole?: 'reporter' | 'all';
}

const BROADCAST_ALLOWED_KEYS = [
  'title',
  'body',
  'targetType',
  'targetId',
  'targetRole',
] as const;

// Validasi Query Daftar Notifikasi
export function validateListNotificationsQuery(
  urlOrParams: URLSearchParams,
): ListNotificationsQuery {
  const pagination = validatePaginationParams(urlOrParams, 20, 50);
  const unreadOnly = urlOrParams.get('unreadOnly') === 'true';

  return {
    ...pagination,
    unreadOnly,
  };
}

// Validasi Input Broadcast Notifikasi
export function validateBroadcastNotificationInput(
  payload: Record<string, unknown>,
): BroadcastNotificationInput {
  assertAllowlistedKeys(
    payload,
    BROADCAST_ALLOWED_KEYS,
    'siaran notifikasi serentak (broadcast)',
  );

  const title = validateRequiredString(payload.title, 'title', {
    minLength: 3,
    maxLength: 150,
  });

  const body = validateRequiredString(payload.body, 'body', {
    minLength: 5,
    maxLength: 1000,
  });

  let targetType: NotificationTargetType = 'none';
  if (payload.targetType !== undefined && payload.targetType !== null) {
    if (
      typeof payload.targetType !== 'string' ||
      !NOTIFICATION_TARGET_TYPES.includes(payload.targetType as NotificationTargetType)
    ) {
      const msg = `Field 'targetType' harus salah satu dari: ${NOTIFICATION_TARGET_TYPES.join(', ')}.`;
      throw ApiError.validation(msg, { targetType: msg });
    }
    targetType = payload.targetType as NotificationTargetType;
  }

  const targetId = validateOptionalString(payload.targetId, 'targetId', {
    maxLength: 120,
  });

  let targetRole: 'reporter' | 'all' = 'reporter';
  if (payload.targetRole !== undefined && payload.targetRole !== null) {
    if (payload.targetRole !== 'reporter' && payload.targetRole !== 'all') {
      const msg = "Field 'targetRole' harus bernilai 'reporter' atau 'all'.";
      throw ApiError.validation(msg, { targetRole: msg });
    }
    targetRole = payload.targetRole;
  }

  return {
    title,
    body,
    targetType,
    targetId,
    targetRole,
  };
}
