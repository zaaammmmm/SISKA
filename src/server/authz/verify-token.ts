// Verifikasi Token Firebase

import type { DecodedIdToken } from 'firebase-admin/auth';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { ApiError } from '@/server/errors/api-error';
import { USER_ROLES, type UserRole } from '@/types/domain';

export interface AuthenticatedCaller {
  uid: string;
  email: string | null;
  role: UserRole | null;
  claimVerified: boolean;
}

function isValidRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

// Ekstraksi Bearer Token
export function extractBearerToken(request: Request): string {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authHeader) {
    throw ApiError.unauthenticated('Header otorisasi (Bearer token) wajib disertakan.');
  }

  const match = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
  if (!match || !match[1]) {
    throw ApiError.unauthenticated('Format header Authorization tidak valid. Gunakan: Bearer <token>.');
  }

  return match[1];
}

// Verifikasi Identitas Pemanggil
export async function verifyBearerToken(request: Request): Promise<AuthenticatedCaller> {
  const rawToken = extractBearerToken(request);

  let decoded: DecodedIdToken;
  try {
    decoded = await getAdminAuth().verifyIdToken(rawToken, true);
  } catch {
    throw ApiError.unauthenticated('Token autentikasi tidak valid, telah kedaluwarsa, atau telah dicabut.');
  }

  const claimRole = decoded.role;
  if (isValidRole(claimRole)) {
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      role: claimRole,
      claimVerified: true,
    };
  }

  // Fallback Profil Reporter
  try {
    const userSnap = await getAdminDb().collection('users').doc(decoded.uid).get();
    const profileRole = userSnap.exists ? userSnap.data()?.role : null;

    if (profileRole === 'reporter') {
      return {
        uid: decoded.uid,
        email: decoded.email ?? null,
        role: 'reporter',
        claimVerified: false,
      };
    }
  } catch {
    // Abaikan kegagalan baca
  }

  return {
    uid: decoded.uid,
    email: decoded.email ?? null,
    role: null,
    claimVerified: false,
  };
}

// Verifikasi Token Opsional
export async function tryVerifyBearerToken(
  request: Request,
): Promise<AuthenticatedCaller | null> {
  const authHeader =
    request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }
  try {
    return await verifyBearerToken(request);
  } catch {
    return null;
  }
}
