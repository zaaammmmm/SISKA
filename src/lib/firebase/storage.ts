/**
 * SISKA — Server-Side Cloud Storage Path Builders & Object Helpers
 * Sumber otoritas:
 * - docs/05-BACKEND-ARCHITECTURE.md §3 (`src/lib/firebase/storage.ts`), §4, §5
 * - docs/08-AUTHORIZATION-MATRIX.md (`reports/{reportId}/evidence/{evidenceId}`, `knowledge/{documentId}/original.pdf`)
 * - storage.rules
 */

import { getAdminStorage } from '@/lib/firebase/admin';
import { EVIDENCE_SIGNED_URL_EXPIRES_SECONDS } from '@/types/domain';

/**
 * Membangun path objek bukti laporan yang terikat pada `reportId` dan `evidenceId`.
 * Path dihasilkan murni di sisi server (`docs/05-BACKEND-ARCHITECTURE.md` §4).
 */
export function buildEvidenceObjectPath(
  reportId: string,
  evidenceId: string,
  extension: string,
): string {
  const cleanExt = extension.startsWith('.') ? extension : `.${extension}`;
  return `reports/${reportId}/evidence/${evidenceId}${cleanExt}`;
}

/**
 * Membangun path objek dokumen PDF Knowledge Base di Cloud Storage.
 */
export function buildKnowledgeObjectPath(documentId: string): string {
  return `knowledge/${documentId}/original.pdf`;
}

/**
 * Memeriksa apakah objek benar-benar sudah ada di Cloud Storage (mencegah orphan metadata).
 */
export async function storageObjectExists(objectPath: string): Promise<boolean> {
  const bucket = getAdminStorage().bucket();
  const [exists] = await bucket.file(objectPath).exists();
  return Boolean(exists);
}

/**
 * Membuat Signed URL berbatas waktu (maksimal 5 menit / 300 detik sesuai NFR-SEC-04)
 * untuk pengunduhan berkas bukti privat setelah otorisasi terverifikasi.
 */
export async function createSignedEvidenceDownloadUrl(
  objectPath: string,
  expiresInSeconds: number = EVIDENCE_SIGNED_URL_EXPIRES_SECONDS,
): Promise<{ signedUrl: string; expiresInSeconds: number }> {
  const boundedTtl = Math.min(
    EVIDENCE_SIGNED_URL_EXPIRES_SECONDS,
    Math.max(60, expiresInSeconds),
  );
  const bucket = getAdminStorage().bucket();
  const [signedUrl] = await bucket.file(objectPath).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + boundedTtl * 1000,
  });

  return {
    signedUrl,
    expiresInSeconds: boundedTtl,
  };
}
