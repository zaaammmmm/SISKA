// Layanan Domain Bukti

import { createHash } from 'node:crypto';
import {
  buildCloudinarySignedDownloadUrl,
  buildCloudinarySignedUploadGrant,
  deleteFromCloudinary,
  downloadBytesFromCloudinary,
  resolveActiveStorageProvider,
  uploadBytesToCloudinary,
} from '@/lib/cloudinary';
import {
  getAdminBucket,
  getAdminDb,
  isFirebaseEmulatorMode,
  resolveAdminConfig,
} from '@/lib/firebase/admin';
import {
  INDISTINGUISHABLE_NOT_FOUND_MESSAGE,
  assertCanDownloadEvidence,
  assertCanUploadEvidence,
} from '@/server/authz/permissions';
import type { AuthenticatedCaller } from '@/server/authz/verify-token';
import { ApiError } from '@/server/errors/api-error';
import {
  recordAuditEvent,
  recordAuditEventInBatch,
} from '@/server/services/audit.service';
import {
  assertValidFileSignature,
  extensionForEvidenceType,
  validateCreateEvidenceInput,
  type CreateEvidenceInput,
} from '@/server/validators/evidence.validator';
import type {
  CreateEvidenceResult,
  SerializedEvidenceItem,
  SignedDownloadUrlResult,
} from '@/types/api';
import {
  EVIDENCE_MAX_BYTES,
  EVIDENCE_SIGNED_URL_EXPIRES_SECONDS,
  type EvidenceContentType,
  type EvidenceDocument,
  type ReportDocument,
} from '@/types/domain';

export type {
  CreateEvidenceResult,
  SerializedEvidenceItem,
  SignedDownloadUrlResult,
};

// Pembuatan Signed URL
async function buildShortLivedStorageUrl(
  storagePath: string,
  action: 'read' | 'write',
  contentType?: EvidenceContentType,
): Promise<SignedDownloadUrlResult> {
  const provider = resolveActiveStorageProvider();

  if (provider === 'cloudinary') {
    if (action === 'write') {
      const grant = buildCloudinarySignedUploadGrant({
        storagePath,
        contentType: contentType ?? 'image/jpeg',
        deliveryType: 'private',
      });
      return {
        url: grant.uploadUrl,
        expiresInSeconds: grant.expiresInSeconds,
      };
    }

    const signed = buildCloudinarySignedDownloadUrl({
      storagePath,
      contentType,
      expiresInSeconds: EVIDENCE_SIGNED_URL_EXPIRES_SECONDS,
      deliveryType: 'private',
    });
    return {
      url: signed.url,
      expiresInSeconds: signed.expiresInSeconds,
      ...(signed.previewUrl ? { previewUrl: signed.previewUrl } : {}),
      ...(signed.blurredPreviewUrl
        ? { blurredPreviewUrl: signed.blurredPreviewUrl }
        : {}),
    };
  }

  const expiresInSeconds = EVIDENCE_SIGNED_URL_EXPIRES_SECONDS;
  const expiresAtMs = Date.now() + expiresInSeconds * 1000;

  if (isFirebaseEmulatorMode()) {
    const cfg = resolveAdminConfig();
    const host = cfg.storageHost || '127.0.0.1:9199';
    const encodedPath = encodeURIComponent(storagePath);
    const url = `http://${host}/v0/b/${cfg.storageBucket}/o/${encodedPath}?alt=media`;
    return { url, expiresInSeconds };
  }

  const bucket = getAdminBucket();
  const file = bucket.file(storagePath);

  const [url] = await file.getSignedUrl({
    version: 'v4',
    action,
    expires: expiresAtMs,
    ...(action === 'write' && contentType ? { contentType } : {}),
    ...(action === 'read' ? { responseDisposition: 'attachment' } : {}),
  });

  return { url, expiresInSeconds };
}

// Penyimpanan Biner Bukti
async function persistVerifiedEvidenceBytes(params: {
  reportId: string;
  evidenceId: string;
  originalName: string;
  contentType: CreateEvidenceInput['contentType'];
  bytes: Uint8Array;
  expectedSha256?: string;
  uploadedBy: string;
  requestId: string;
}): Promise<CreateEvidenceResult> {
  const {
    reportId,
    evidenceId,
    originalName,
    contentType,
    bytes,
    expectedSha256,
    uploadedBy,
    requestId,
  } = params;

  if (bytes.byteLength < 1) {
    throw ApiError.uploadRejected('Berkas bukti tidak boleh kosong.', 400, {
      file: 'Berkas bukti tidak boleh kosong.',
    });
  }

  if (bytes.byteLength > EVIDENCE_MAX_BYTES) {
    const msg = `Ukuran berkas melebihi batas maksimum 5 MiB (${EVIDENCE_MAX_BYTES} byte).`;
    throw ApiError.uploadRejected(msg, 413, { sizeBytes: msg });
  }

  assertValidFileSignature(bytes, contentType);

  const computedSha256 = createHash('sha256').update(bytes).digest('hex');
  if (expectedSha256 && expectedSha256.toLowerCase() !== computedSha256) {
    const msg =
      'Checksum SHA-256 berkas tidak cocok dengan isi berkas yang diunggah.';
    throw ApiError.uploadRejected(msg, 400, { sha256: msg });
  }

  const db = getAdminDb();
  const evidenceRef = db
    .collection('reports')
    .doc(reportId)
    .collection('evidence')
    .doc(evidenceId);

  const existingSnap = await evidenceRef.get();
  if (existingSnap.exists) {
    throw ApiError.conflict(
      'Metadata untuk ID bukti ini sudah tercatat sebelumnya.',
    );
  }

  const ext = extensionForEvidenceType(contentType);
  const storagePath = `reports/${reportId}/evidence/${evidenceId}.${ext}`;
  const now = new Date();
  const provider = resolveActiveStorageProvider();

  if (provider === 'cloudinary') {
    await uploadBytesToCloudinary({
      storagePath,
      bytes,
      contentType,
      fileName: originalName,
      deliveryType: 'private',
    });
  } else {
    const bucket = getAdminBucket();
    const storageFile = bucket.file(storagePath);
    await storageFile.save(Buffer.from(bytes), {
      resumable: false,
      contentType,
      metadata: {
        cacheControl: 'private, no-store',
      },
    });
  }

  const evidenceDoc: EvidenceDocument = {
    storagePath,
    originalName,
    contentType,
    sizeBytes: bytes.byteLength,
    sha256: computedSha256,
    uploadedBy,
    createdAt: now,
  };

  try {
    const batch = db.batch();
    batch.create(evidenceRef, evidenceDoc);
    recordAuditEventInBatch(batch, {
      actorUid: uploadedBy,
      action: 'evidence.uploaded',
      targetType: 'evidence',
      targetId: evidenceId,
      requestId,
      occurredAt: now,
    });
    await batch.commit();
  } catch (dbError) {
    if (provider === 'cloudinary') {
      await deleteFromCloudinary({
        storagePath,
        contentType,
        deliveryType: 'private',
      }).catch(() => undefined);
    } else {
      const bucket = getAdminBucket();
      await bucket
        .file(storagePath)
        .delete({ ignoreNotFound: true })
        .catch(() => undefined);
    }
    throw ApiError.internal(
      dbError instanceof Error
        ? dbError.message
        : 'Evidence metadata commit failed',
      'Gagal mencatat metadata bukti; unggahan telah dibatalkan secara aman.',
    );
  }

  return {
    status: 'committed',
    evidenceId,
    storagePath,
    evidence: {
      id: evidenceId,
      originalName: evidenceDoc.originalName,
      contentType: evidenceDoc.contentType,
      sizeBytes: evidenceDoc.sizeBytes,
      sha256: computedSha256,
      uploadedBy: evidenceDoc.uploadedBy,
      createdAt: now.toISOString(),
    },
  };
}

// Registrasi Unggahan Bukti
export async function registerEvidenceUpload(
  caller: AuthenticatedCaller,
  reportId: string,
  input: CreateEvidenceInput,
  requestId: string,
): Promise<CreateEvidenceResult> {
  const db = getAdminDb();
  const reportRef = db.collection('reports').doc(reportId);
  const reportSnap = await reportRef.get();

  const reportData = reportSnap.exists
    ? (reportSnap.data() as ReportDocument)
    : null;

  const authorized = assertCanUploadEvidence(caller, reportData);

  // Mode Base64 JSON
  if (input.contentBase64) {
    const maxBase64Chars = Math.ceil((EVIDENCE_MAX_BYTES * 4) / 3) + 1024;
    if (input.contentBase64.length > maxBase64Chars) {
      const msg = `Ukuran berkas melebihi batas maksimum 5 MiB (${EVIDENCE_MAX_BYTES} byte).`;
      throw ApiError.uploadRejected(msg, 413, { sizeBytes: msg });
    }

    const rawBuffer = Buffer.from(input.contentBase64, 'base64');
    if (rawBuffer.byteLength !== input.sizeBytes) {
      const msg =
        "Ukuran hasil dekode 'contentBase64' tidak sesuai dengan nilai 'sizeBytes'.";
      throw ApiError.validation(msg, { sizeBytes: msg });
    }
    const evidenceId =
      input.evidenceId ?? reportRef.collection('evidence').doc().id;
    return persistVerifiedEvidenceBytes({
      reportId,
      evidenceId,
      originalName: input.fileName,
      contentType: input.contentType,
      bytes: new Uint8Array(rawBuffer),
      expectedSha256: input.sha256,
      uploadedBy: authorized.uid,
      requestId,
    });
  }

  // Mode Finalisasi Upload
  if (input.evidenceId) {
    const evidenceRef = reportRef.collection('evidence').doc(input.evidenceId);
    const existingEvidenceSnap = await evidenceRef.get();
    if (existingEvidenceSnap.exists) {
      throw ApiError.conflict(
        'Metadata untuk ID bukti ini sudah tercatat sebelumnya.',
      );
    }

    const ext = extensionForEvidenceType(input.contentType);
    const storagePath = `reports/${reportId}/evidence/${input.evidenceId}.${ext}`;
    const provider = resolveActiveStorageProvider();

    let bytes: Uint8Array;

    if (provider === 'cloudinary') {
      let downloaded: Uint8Array | null;
      try {
        downloaded = await downloadBytesFromCloudinary({
          storagePath,
          contentType: input.contentType,
          deliveryType: 'private',
        });
      } catch {
        throw ApiError.uploadRejected(
          'Gagal memverifikasi isi berkas di layanan penyimpanan media.',
          400,
        );
      }

      if (!downloaded) {
        const msg =
          'Berkas bukti belum ditemukan di penyimpanan media. Unggah berkas ke uploadUrl terlebih dahulu sebelum finalisasi.';
        throw ApiError.validation(msg, { evidenceId: msg });
      }
      bytes = downloaded;
    } else {
      const bucket = getAdminBucket();
      const storageFile = bucket.file(storagePath);

      const [exists] = await storageFile.exists();
      if (!exists) {
        const msg =
          'Berkas bukti belum ditemukan di Cloud Storage. Unggah berkas ke uploadUrl terlebih dahulu sebelum finalisasi.';
        throw ApiError.validation(msg, { evidenceId: msg });
      }

      let downloadedBuffer: Buffer;
      try {
        [downloadedBuffer] = await storageFile.download();
      } catch {
        throw ApiError.uploadRejected(
          'Gagal memverifikasi isi berkas di Cloud Storage.',
          400,
        );
      }
      bytes = new Uint8Array(downloadedBuffer);
    }

    try {
      if (bytes.byteLength < 1 || bytes.byteLength > EVIDENCE_MAX_BYTES) {
        throw ApiError.uploadRejected(
          `Ukuran berkas di Storage (${bytes.byteLength} byte) melanggar batas ketentuan.`,
          bytes.byteLength > EVIDENCE_MAX_BYTES ? 413 : 400,
        );
      }
      if (bytes.byteLength !== input.sizeBytes) {
        const msg =
          "Ukuran berkas yang diunggah tidak sesuai dengan 'sizeBytes' yang dideklarasikan.";
        throw ApiError.validation(msg, { sizeBytes: msg });
      }
      assertValidFileSignature(bytes, input.contentType);

      const computedSha256 = createHash('sha256').update(bytes).digest('hex');
      if (input.sha256 && input.sha256.toLowerCase() !== computedSha256) {
        const msg =
          'Checksum SHA-256 berkas di Storage tidak sesuai dengan nilai yang dideklarasikan.';
        throw ApiError.uploadRejected(msg, 400, { sha256: msg });
      }

      const now = new Date();
      const evidenceDoc: EvidenceDocument = {
        storagePath,
        originalName: input.fileName,
        contentType: input.contentType,
        sizeBytes: bytes.byteLength,
        sha256: computedSha256,
        uploadedBy: authorized.uid,
        createdAt: now,
      };

      const batch = db.batch();
      batch.create(evidenceRef, evidenceDoc);
      recordAuditEventInBatch(batch, {
        actorUid: authorized.uid,
        action: 'evidence.uploaded',
        targetType: 'evidence',
        targetId: evidenceRef.id,
        requestId,
        occurredAt: now,
      });
      await batch.commit();

      return {
        status: 'committed',
        evidenceId: evidenceRef.id,
        storagePath,
        evidence: {
          id: evidenceRef.id,
          originalName: evidenceDoc.originalName,
          contentType: evidenceDoc.contentType,
          sizeBytes: evidenceDoc.sizeBytes,
          sha256: computedSha256,
          uploadedBy: evidenceDoc.uploadedBy,
          createdAt: now.toISOString(),
        },
      };
    } catch (verifyOrDbError) {
      if (provider === 'cloudinary') {
        await deleteFromCloudinary({
          storagePath,
          contentType: input.contentType,
          deliveryType: 'private',
        }).catch(() => undefined);
      } else {
        await getAdminBucket()
          .file(storagePath)
          .delete({ ignoreNotFound: true })
          .catch(() => undefined);
      }
      if (verifyOrDbError instanceof ApiError) {
        throw verifyOrDbError;
      }
      throw ApiError.internal(
        verifyOrDbError instanceof Error
          ? verifyOrDbError.message
          : 'Finalize evidence failed',
        'Gagal mencatat metadata bukti; objek telah dibersihkan secara aman.',
      );
    }
  }

  // Mode Inisiasi Upload
  const evidenceId = reportRef.collection('evidence').doc().id;
  const ext = extensionForEvidenceType(input.contentType);
  const storagePath = `reports/${reportId}/evidence/${evidenceId}.${ext}`;

  const signed = await buildShortLivedStorageUrl(
    storagePath,
    'write',
    input.contentType,
  );

  return {
    status: 'upload_pending',
    evidenceId,
    storagePath,
    uploadUrl: signed.url,
    expiresInSeconds: signed.expiresInSeconds,
  };
}

// Unggahan Multipart Bukti
export async function uploadEvidenceBinary(
  caller: AuthenticatedCaller,
  reportId: string,
  formData: FormData,
  requestId: string,
): Promise<CreateEvidenceResult> {
  const db = getAdminDb();
  const reportRef = db.collection('reports').doc(reportId);
  const reportSnap = await reportRef.get();
  const reportData = reportSnap.exists
    ? (reportSnap.data() as ReportDocument)
    : null;

  const authorized = assertCanUploadEvidence(caller, reportData);

  const fileEntry = formData.get('file');
  if (
    !fileEntry ||
    typeof fileEntry === 'string' ||
    !(fileEntry instanceof Blob)
  ) {
    const msg =
      "Field berkas 'file' wajib disertakan pada multipart/form-data.";
    throw ApiError.validation(msg, { file: msg });
  }

  const file = fileEntry as File;

  if (file.size < 1) {
    throw ApiError.uploadRejected('Berkas bukti tidak boleh kosong.', 400, {
      file: 'Berkas bukti tidak boleh kosong.',
    });
  }
  if (file.size > EVIDENCE_MAX_BYTES) {
    const msg = `Ukuran berkas melebihi batas maksimum 5 MiB (${EVIDENCE_MAX_BYTES} byte).`;
    throw ApiError.uploadRejected(msg, 413, { sizeBytes: msg });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const computedSha256 = createHash('sha256').update(bytes).digest('hex');

  const input = validateCreateEvidenceInput({
    fileName: file.name || 'evidence',
    contentType: file.type,
    sizeBytes: bytes.byteLength,
    sha256: computedSha256,
  });

  const evidenceId = reportRef.collection('evidence').doc().id;

  return persistVerifiedEvidenceBytes({
    reportId,
    evidenceId,
    originalName: input.fileName,
    contentType: input.contentType,
    bytes,
    expectedSha256: computedSha256,
    uploadedBy: authorized.uid,
    requestId,
  });
}

// Otorisasi Unduhan Bukti
export async function authorizeEvidenceDownload(
  caller: AuthenticatedCaller,
  reportId: string,
  evidenceId: string,
  requestId: string,
): Promise<SignedDownloadUrlResult> {
  const db = getAdminDb();
  const reportRef = db.collection('reports').doc(reportId);
  const reportSnap = await reportRef.get();

  const reportData = reportSnap.exists
    ? (reportSnap.data() as ReportDocument)
    : null;

  const authorized = assertCanDownloadEvidence(caller, reportData);

  const evidenceSnap = await reportRef
    .collection('evidence')
    .doc(evidenceId)
    .get();
  if (!evidenceSnap.exists) {
    throw ApiError.notFound(INDISTINGUISHABLE_NOT_FOUND_MESSAGE);
  }

  const evidenceData = evidenceSnap.data() as EvidenceDocument;
  if (!evidenceData.storagePath) {
    throw ApiError.internal('Missing storagePath on evidence document');
  }

  const signed = await buildShortLivedStorageUrl(
    evidenceData.storagePath,
    'read',
    evidenceData.contentType,
  );

  await recordAuditEvent({
    actorUid: authorized.uid,
    action: 'evidence.downloaded',
    targetType: 'evidence',
    targetId: evidenceId,
    requestId,
  });

  return {
    url: signed.url,
    expiresInSeconds: signed.expiresInSeconds,
    ...(signed.previewUrl ? { previewUrl: signed.previewUrl } : {}),
    ...(signed.blurredPreviewUrl
      ? { blurredPreviewUrl: signed.blurredPreviewUrl }
      : {}),
  };
}
