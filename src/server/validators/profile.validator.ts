import {
  assertAllowlistedKeys,
  validateRequiredString,
} from '@/server/validators/common';

export interface UpdateProfileInput {
  displayName: string;
}

const UPDATE_PROFILE_ALLOWED_KEYS = ['displayName'] as const;

// Validasi Input Pembaruan Profil
export function validateUpdateProfileInput(
  payload: Record<string, unknown>,
): UpdateProfileInput {
  assertAllowlistedKeys(
    payload,
    UPDATE_PROFILE_ALLOWED_KEYS,
    'pembaruan profil pengguna',
  );

  const displayName = validateRequiredString(
    payload.displayName,
    'displayName',
    {
      minLength: 1,
      maxLength: 120,
    },
  );

  return { displayName };
}
