/**
 * SISKA — Evidence Domain Service (`EvidenceService`)
 * Sumber otoritas:
 * - docs/01-SRS.md FR-007, NFR-REL-01
 * - docs/02-ERD.md §2, §4, §6 ("Metadata evidence ditulis setelah upload sukses; jika insert gagal, hapus file sebagai kompensasi")
 * - docs/04-API-SPEC.yaml (/reports/{reportId}/evidence, /reports/{reportId}/evidence/{evidenceId}/download)
 * - docs/05-BACKEND-ARCHITECTURE.md §4.6 & §5
 * - docs/09-TEST-PLAN.md FILE-01..FILE-04
 */

import { createHash } from 'node:crypto';
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
  type EvidenceDocument,
  type ReportDocument,
} from '@/types/domain';

export type {
  CreateEvidenceResult,
  SerializedEvidenceItem,
  SignedDownloadUrlResult,
};

/**
 * Menghasilkan URL bertanda tangan (Signed URL) berdurasi singkat (maksimal 5 menit / 300 detik).
 * Pada mode Firebase Storage Emulator (tanpa IAM service account key), menggunakan endpoint emulator lokal.
 */
async function buildShortLivedStorageUrl(
  storagePath: string,
  action: 'read' | 'write',
  contentType?: string,
): Promise<SignedDownloadUrlResult> {
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
  });

  return { url, expiresInSeconds };
}

/**
 * Menyimpan biner bukti yang telah tervalidasi ke Cloud Storage privat,
 * lalu menulis metadata ke `reports/{reportId}/evidence/{evidenceId}` + `auditEvents`
 * dengan kompensasi penghapusan file otomatis bila penulisan Firestore gagal (docs/02-ERD.md §6 & FILE-04).
 */
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

  // Inspeksi signature biner (Magic Bytes) untuk menolak spoofed MIME / executable (FILE-02)
  assertValidFileSignature(bytes, contentType);

  const computedSha256 = createHash('sha256').update(bytes).digest('hex');
  if (expectedSha256 && expectedSha256.toLowerCase() !== computedSha256) {
    const msg =
      'Checksum SHA-256 berkas tidak cocok dengan isi berkas yang diunggah.';
    throw ApiError.uploadRejected(msg, 400, { sha256: msg });
  }

  const ext = extensionForEvidenceType(contentType);
  const storagePath = `reports/${reportId}/evidence/${evidenceId}.${ext}`;
  const now = new Date();

  const bucket = getAdminBucket();
  const storageFile = bucket.file(storagePath);

  await storageFile.save(Buffer.from(bytes), {
    resumable: false,
    contentType,
    metadata: {
      cacheControl: 'private, no-store',
    },
  });

  const db = getAdminDb();
  const evidenceRef = db
    .collection('reports')
    .doc(reportId)
    .collection('evidence')
    .doc(evidenceId);

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
    // Kompensasi penghapusan file yatim jika penyimpanan metadata ke Firestore gagal (FILE-04 / NFR-REL-01)
    await storageFile.delete({ ignoreNotFound: true }).catch(() => undefined);
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

/**
 * Menangani alur JSON pada `POST /api/v1/reports/{reportId}/evidence`.
 *
 * Mematuhi secara ketat `docs/02-ERD.md §6` ("Metadata evidence ditulis setelah upload sukses"):
 * 1. Jika `input.contentBase64` disertakan: langsung mendekode biner, memeriksa Magic Bytes,
 *    menyimpan ke Cloud Storage, lalu menulis metadata ke Firestore.
 * 2. Jika `input.evidenceId` disertakan (Tahap Finalisasi setelah client upload ke Signed URL):
 *    memverifikasi bahwa objek benar-benar sudah ada di Cloud Storage, memeriksa ukuran riil (`<= 5 MiB`),
 *    memeriksa Magic Bytes (`assertValidFileSignature`), menghitung SHA-256 (menghapus objek jika tidak valid),
 *    dan HANYA menulis dokumen `reports/{reportId}/evidence/{evidenceId}` setelah seluruh verifikasi lulus.
 * 3. Jika hanya `{ fileName, contentType, sizeBytes }` (Tahap Inisiasi Signed Upload):
 *    menerbitkan `uploadUrl` berdurasi 5 menit + `evidenceId` TANPA menulis dokumen ke Firestore terlebih dahulu,
 *    sehingga mustahil menimbulkan metadata yatim bila unggahan client batal/gagal!
 */
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

  // Mode 1: Payload biner dikirim sebagai base64 di dalam JSON
  if (input.contentBase64) {
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

  // Mode 2: Finalisasi Signed Upload — verifikasi objek di Storage sebelum tulis metadata ke Firestore
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

    const bytes = new Uint8Array(downloadedBuffer);

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
      // Hapus objek dari Storage bila gagal validasi signature/ukuran atau gagal commit ke Firestore (FILE-02 & FILE-04)
      await storageFile.delete({ ignoreNotFound: true }).catch(() => undefined);
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

  // Mode 3: Inisiasi Signed Upload URL (Belum menulis dokumen ke Firestore agar bebas metadata yatim)
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

/**
 * Mengunggah berkas biner bukti langsung melalui server (`multipart/form-data`)
 * lengkap dengan pemeriksaan Magic Bytes (`FILE-02`), perhitungan SHA-256,
 * dan rollback/kompensasi otomatis bila penulisan metadata Firestore gagal (`FILE-04` & `NFR-REL-01`).
 */
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

/**
 * Mengotorisasi pengunduhan bukti dan menerbitkan Signed URL berdurasi singkat (maks. 5 menit)
 * (`GET /api/v1/reports/{reportId}/evidence/{evidenceId}/download`).
 * Sesuai docs/08-AUTHORIZATION-MATRIX.md & FILE-03:
 * Menolak akses lintas pengguna maupun bukti tidak ditemukan dengan `404 NOT_FOUND` seragam (Anti-IDOR).
 */
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
  };
}
