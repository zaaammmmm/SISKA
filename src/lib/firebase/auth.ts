/**
 * SISKA — Server-Side Firebase Authentication Adapter
 * Sumber otoritas:
 * - docs/05-BACKEND-ARCHITECTURE.md §3 (`src/lib/firebase/auth.ts`) & §5 (Custom claims / role provisioning hanya melalui Admin SDK)
 */

import { getAdminAuth } from '@/lib/firebase/admin';
import type { UserRole } from '@/types/domain';

/**
 * Memverifikasi Firebase ID Token di sisi server (`checkRevoked: true`).
 */
export async function verifyServerIdToken(idToken: string) {
  const adminAuth = getAdminAuth();
  return adminAuth.verifyIdToken(idToken, true);
}

/**
 * Menetapkan Custom Claim `role` pada akun Firebase Auth pengguna.
 * Hanya boleh dipanggil oleh layanan tepercaya di server (mencegah privilege escalation).
 */
export async function setServerUserRoleClaim(
  uid: string,
  role: UserRole,
): Promise<void> {
  const adminAuth = getAdminAuth();
  await adminAuth.setCustomUserClaims(uid, { role });
}
