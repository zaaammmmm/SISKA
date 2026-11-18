import { getAdminStorage, isFirebaseEmulatorMode, resolveAdminConfig } from '@/lib/firebase/admin';
import {
  buildCloudinarySignedDownloadUrl,
  downloadBytesFromCloudinary,
  resolveActiveStorageProvider,
} from '@/lib/cloudinary';
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
  if (resolveActiveStorageProvider() === 'cloudinary') {
    const bytes = await downloadBytesFromCloudinary({
      storagePath: objectPath,
      contentType: objectPath.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
    });
    return bytes !== null && bytes.byteLength > 0;
  }
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

  if (resolveActiveStorageProvider() === 'cloudinary') {
    const signed = buildCloudinarySignedDownloadUrl({
      storagePath: objectPath,
      expiresInSeconds: boundedTtl,
    });
    return {
      signedUrl: signed.url,
      expiresInSeconds: signed.expiresInSeconds,
    };
  }

  if (isFirebaseEmulatorMode()) {
    const cfg = resolveAdminConfig();
    const host = cfg.storageHost || '127.0.0.1:9199';
    const encodedPath = encodeURIComponent(objectPath);
    return {
      signedUrl: `http://${host}/v0/b/${cfg.storageBucket}/o/${encodedPath}?alt=media`,
      expiresInSeconds: boundedTtl,
    };
  }

  const bucket = getAdminStorage().bucket();
  const [signedUrl] = await bucket.file(objectPath).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + boundedTtl * 1000,
    responseDisposition: 'attachment',
  });

  return {
    signedUrl,
    expiresInSeconds: boundedTtl,
  };
}
