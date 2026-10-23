/**
 * SISKA — Server-Side Firebase ID Token Verification
 * Sumber otoritas:
 * - docs/04-API-SPEC.yaml (securitySchemes/FirebaseBearer)
 * - docs/05-BACKEND-ARCHITECTURE.md §4.1–§4.3
 * - docs/08-AUTHORIZATION-MATRIX.md §Enforcement requirements (4)
 * - docs/09-TEST-PLAN.md §4 (Unauthorized account / seed_outsider handling)
 */

import type { DecodedIdToken } from 'firebase-admin/auth';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { ApiError } from '@/server/errors/api-error';
import { USER_ROLES, type UserRole } from '@/types/domain';

export interface AuthenticatedCaller {
  /** UID yang terverifikasi dari Firebase ID Token (sumber otoritas tunggal) */
  uid: string;
  /** Email dari token terverifikasi (jika tersedia) */
  email: string | null;
  /**
   * Role pengguna yang terverifikasi (`'reporter' | 'admin'`).
   * Bernilai `null` bila akun belum memiliki claim role maupun dokumen profil sah (mis. `seed_outsider`).
   */
  role: UserRole | null;
  /** Apakah role berasal langsung dari Custom Claims token Firebase Auth */
  claimVerified: boolean;
}

function isValidRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

/**
 * Mengekstrak token Bearer dari header `Authorization`.
 * Melempar `401 UNAUTHENTICATED` bila header tidak ada atau formatnya salah.
 */
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

/**
 * Memverifikasi Firebase ID Token melalui Firebase Admin SDK dan mengekstrak identitas pemanggil.
 *
 * Aturan Keamanan (docs/08-AUTHORIZATION-MATRIX.md):
 * 1. Jangan pernah mempercayai `uid`, `reporterId`, `senderUid`, atau `role` dari body/query request.
 * 2. Otoritas utama role adalah Custom User Claim (`decodedToken.role`).
 * 3. Hak akses `admin` HANYA diberikan jika Custom Claim `decodedToken.role === 'admin'`.
 * 4. Jika token tidak memiliki claim (mis. pengguna baru selesai registrasi client), server memeriksa
 *    dokumen `users/{uid}` hanya untuk peran `'reporter'`. Akun tanpa claim & tanpa profil (`seed_outsider`)
 *    akan memiliki `role: null` dan ditolak pada lapisan otorisasi.
 */
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

  // Fallback terkontrol: hanya untuk mengonfirmasi profil `reporter` bila custom claim belum disinkronkan.
  // Peran `admin` TIDAK PERNAH diberikan tanpa custom claim pada token.
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
    // Jika pembacaan profil gagal, biarkan role = null sehingga ditolak secara aman (fail-closed)
  }

  return {
    uid: decoded.uid,
    email: decoded.email ?? null,
    role: null,
    claimVerified: false,
  };
}

