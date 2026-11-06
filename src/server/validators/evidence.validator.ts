import { ApiError } from '@/server/errors/api-error';
import {
  ALLOWED_EVIDENCE_CONTENT_TYPES,
  EVIDENCE_MAX_BYTES,
  type EvidenceContentType,
} from '@/types/domain';
import {
  assertAllowlistedKeys,
  validateRequiredString,
  validateResourceId,
} from '@/server/validators/common';

export interface CreateEvidenceInput {
  fileName: string;
  contentType: EvidenceContentType;
  sizeBytes: number;
  sha256?: string;
  contentBase64?: string;
  evidenceId?: string;
}

const CREATE_EVIDENCE_ALLOWED_KEYS = [
  'fileName',
  'contentType',
  'sizeBytes',
  'sha256',
  'contentBase64',
  'evidenceId',
] as const;

// Type Guard Content Type Bukti
export function isEvidenceContentType(
  value: unknown,
): value is EvidenceContentType {
  return (
    typeof value === 'string' &&
    (ALLOWED_EVIDENCE_CONTENT_TYPES as readonly string[]).includes(value)
  );
}

// Ekstensi File Bukti
export function extensionForEvidenceType(
  contentType: EvidenceContentType,
): 'pdf' | 'jpg' | 'png' {
  switch (contentType) {
    case 'application/pdf':
      return 'pdf';
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
  }
}

// Validasi Input Bukti
export function validateCreateEvidenceInput(
  payload: Record<string, unknown>,
): CreateEvidenceInput {
  assertAllowlistedKeys(
    payload,
    CREATE_EVIDENCE_ALLOWED_KEYS,
    'unggahan bukti laporan',
  );

  const rawFileName = validateRequiredString(payload.fileName, 'fileName', {
    minLength: 1,
    maxLength: 255,
  });

  if (
    rawFileName.includes('..') ||
    rawFileName.includes('/') ||
    rawFileName.includes('\\')
  ) {
    const msg =
      'Nama berkas tidak valid (tidak boleh memuat karakter path atau direktori).';
    throw ApiError.uploadRejected(msg, 400, { fileName: msg });
  }

  if (/\.(exe|bat|cmd|sh|ps1|php|js|mjs|html|htm|svg)$/i.test(rawFileName)) {
    const msg = 'Format berkas eksekusi atau skrip aktif dilarang diunggah.';
    throw ApiError.uploadRejected(msg, 400, { fileName: msg });
  }

  if (!isEvidenceContentType(payload.contentType)) {
    const msg = `Tipe konten tidak didukung. Hanya menerima: ${ALLOWED_EVIDENCE_CONTENT_TYPES.join(', ')}.`;
    throw ApiError.uploadRejected(msg, 400, { contentType: msg });
  }

  const sizeBytes = payload.sizeBytes;
  if (
    typeof sizeBytes !== 'number' ||
    !Number.isInteger(sizeBytes) ||
    sizeBytes < 1
  ) {
    const msg = "Field 'sizeBytes' harus berupa bilangan bulat positif.";
    throw ApiError.validation(msg, { sizeBytes: msg });
  }

  if (sizeBytes > EVIDENCE_MAX_BYTES) {
    const msg = `Ukuran berkas melebihi batas maksimum 5 MiB (${EVIDENCE_MAX_BYTES} byte).`;
    throw ApiError.uploadRejected(msg, 413, { sizeBytes: msg });
  }

  let sha256: string | undefined;
  if (payload.sha256 !== undefined && payload.sha256 !== null) {
    if (
      typeof payload.sha256 !== 'string' ||
      !/^[a-fA-F0-9]{64}$/.test(payload.sha256.trim())
    ) {
      const msg = "Field 'sha256' harus berupa string heksadesimal 64 karakter.";
      throw ApiError.validation(msg, { sha256: msg });
    }
    sha256 = payload.sha256.trim().toLowerCase();
  }

  let contentBase64: string | undefined;
  if (payload.contentBase64 !== undefined && payload.contentBase64 !== null) {
    if (
      typeof payload.contentBase64 !== 'string' ||
      payload.contentBase64.trim().length === 0
    ) {
      const msg = "Field 'contentBase64' harus berupa string base64 yang valid.";
      throw ApiError.validation(msg, { contentBase64: msg });
    }
    contentBase64 = payload.contentBase64.trim();
  }

  let evidenceId: string | undefined;
  if (payload.evidenceId !== undefined && payload.evidenceId !== null) {
    evidenceId = validateResourceId(payload.evidenceId, 'evidenceId');
  }

  return {
    fileName: rawFileName,
    contentType: payload.contentType,
    sizeBytes,
    sha256,
    contentBase64,
    evidenceId,
  };
}

// Validasi Magic Bytes Berkas
export function assertValidFileSignature(
  bytes: Uint8Array,
  declaredType: EvidenceContentType,
): void {
  if (bytes.byteLength < 8) {
    const msg = 'Berkas bukti rusak atau terlalu kecil.';
    throw ApiError.uploadRejected(msg, 400, { file: msg });
  }

  if (declaredType === 'application/pdf') {
    const isPdf =
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46 &&
      bytes[4] === 0x2d;
    if (!isPdf) {
      const msg = 'Isi biner berkas tidak sesuai dengan format PDF yang sah.';
      throw ApiError.uploadRejected(msg, 400, { file: msg });
    }
    return;
  }

  if (declaredType === 'image/png') {
    const isPng =
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a;
    if (!isPng) {
      const msg = 'Isi biner berkas tidak sesuai dengan format PNG yang sah.';
      throw ApiError.uploadRejected(msg, 400, { file: msg });
    }
    return;
  }

  if (declaredType === 'image/jpeg') {
    const isJpeg =
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff;
    if (!isJpeg) {
      const msg = 'Isi biner berkas tidak sesuai dengan format JPEG yang sah.';
      throw ApiError.uploadRejected(msg, 400, { file: msg });
    }
  }
}
