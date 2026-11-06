import { getAdminStorage } from '@/lib/firebase/admin';
import { EVIDENCE_SIGNED_URL_EXPIRES_SECONDS } from '@/types/domain';

// Path Objek Bukti
export function buildEvidenceObjectPath(
  reportId: string,
  evidenceId: string,
  extension: string,
): string {
  const cleanExt = extension.startsWith('.') ? extension : `.${extension}`;
  return `reports/${reportId}/evidence/${evidenceId}${cleanExt}`;
}

// Path Objek Knowledge Base
export function buildKnowledgeObjectPath(documentId: string): string {
  return `knowledge/${documentId}/original.pdf`;
}

// Verifikasi Keberadaan Objek Storage
export async function storageObjectExists(objectPath: string): Promise<boolean> {
  const bucket = getAdminStorage().bucket();
  const [exists] = await bucket.file(objectPath).exists();
  return Boolean(exists);
}

// Signed URL Unduhan Bukti
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
