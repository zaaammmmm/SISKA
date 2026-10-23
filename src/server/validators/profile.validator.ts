/**
 * SISKA — User Profile Input Validators
 * Sumber otoritas:
 * - docs/04-API-SPEC.yaml (/profile)
 * - docs/01-SRS.md FR-014 ("pengguna mengelola field profil yang diperbolehkan, tanpa dapat mengubah role atau ID internal")
 * - docs/09-TEST-PLAN.md AUTH-04 ("Reporter attempts to set role=admin -> Server ignores/rejects; no privilege change")
 */

import {
  assertAllowlistedKeys,
  validateRequiredString,
} from '@/server/validators/common';

export interface UpdateProfileInput {
  displayName: string;
}

const UPDATE_PROFILE_ALLOWED_KEYS = ['displayName'] as const;

/**
 * Validasi body `PATCH /api/v1/profile`:
 * - Hanya mengizinkan `displayName` (maksimal 120 karakter).
 * - Menolak setiap usaha menyisipkan `role`, `uid`, `email`, atau field sistem lainnya (AUTH-04).
 */
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

