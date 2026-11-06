import { getAdminAuth } from '@/lib/firebase/admin';
import type { UserRole } from '@/types/domain';

// Verifikasi ID Token
export async function verifyServerIdToken(idToken: string) {
  const adminAuth = getAdminAuth();
  return adminAuth.verifyIdToken(idToken, true);
}

// Custom Claims Role
export async function setServerUserRoleClaim(
  uid: string,
  role: UserRole,
): Promise<void> {
  const adminAuth = getAdminAuth();
  await adminAuth.setCustomUserClaims(uid, { role });
}
