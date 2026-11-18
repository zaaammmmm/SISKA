import { ApiError } from '@/server/errors/api-error';
import {
  assertAllowlistedKeys,
  validateRequiredString,
} from '@/server/validators/common';
import {
  assertValidFileSignature,
  validateCreateEvidenceInput,
} from '@/server/validators/evidence.validator';
import { EVIDENCE_MAX_BYTES } from '@/types/domain';

export interface ProfileAvatarUploadInput {
  fileName: string;
  contentType: 'image/jpeg' | 'image/png';
  sizeBytes: number;
  bytes: Uint8Array;
}

export interface UpdateProfileInput {
  displayName: string;
  avatar?: ProfileAvatarUploadInput | null;
}

const UPDATE_PROFILE_ALLOWED_KEYS = ['displayName', 'avatar'] as const;

// Validasi Objek Avatar
function parseAvatarObject(rawAvatar: unknown): ProfileAvatarUploadInput {
  if (!rawAvatar || typeof rawAvatar !== 'object' || Array.isArray(rawAvatar)) {
    const msg = "Field 'avatar' harus berupa objek berkas foto profil.";
    throw ApiError.validation(msg, { avatar: msg });
  }

  const meta = validateCreateEvidenceInput(rawAvatar as Record<string, unknown>);
  if (meta.contentType !== 'image/jpeg' && meta.contentType !== 'image/png') {
    const msg = 'Foto profil hanya mendukung format gambar JPEG atau PNG.';
    throw ApiError.uploadRejected(msg, 400, { contentType: msg });
  }

  if (!meta.contentBase64) {
    const msg = "Field 'avatar.contentBase64' wajib disertakan pada unggahan JSON.";
    throw ApiError.validation(msg, { avatar: msg });
  }

  const maxBase64Chars = Math.ceil((EVIDENCE_MAX_BYTES * 4) / 3) + 1024;
  if (meta.contentBase64.length > maxBase64Chars) {
    const msg = `Ukuran foto profil melebihi batas maksimum 5 MiB (${EVIDENCE_MAX_BYTES} byte).`;
    throw ApiError.uploadRejected(msg, 413, { sizeBytes: msg });
  }

  const decoded = Buffer.from(meta.contentBase64, 'base64');
  if (decoded.byteLength !== meta.sizeBytes) {
    const msg = "Ukuran hasil dekode 'contentBase64' tidak sesuai dengan 'sizeBytes'.";
    throw ApiError.validation(msg, { sizeBytes: msg });
  }

  const bytes = new Uint8Array(decoded);
  assertValidFileSignature(bytes, meta.contentType);

  return {
    fileName: meta.fileName,
    contentType: meta.contentType,
    sizeBytes: bytes.byteLength,
    bytes,
  };
}

// Validasi Profil JSON
// Validasi Input Pembaruan Profil
export function validateUpdateProfileInput(
  payload: Record<string, unknown>,
): UpdateProfileInput {
  assertAllowlistedKeys(
    payload,
    UPDATE_PROFILE_ALLOWED_KEYS,
    'pembaruan profil pengguna',
  );

  const displayName = validateRequiredString(
    payload.displayName,
    'displayName',
    {
      minLength: 1,
      maxLength: 120,
    },
  );

  if (payload.avatar === undefined || payload.avatar === null) {
    return { displayName };
  }

  return {
    displayName,
    avatar: parseAvatarObject(payload.avatar),
  };
}

// Validasi Profil Multipart
export async function validateMultipartUpdateProfileInput(
  formData: FormData,
  fallbackDisplayName?: string,
): Promise<UpdateProfileInput> {
  const rawName = formData.get('displayName');
  const displayName = validateRequiredString(
    typeof rawName === 'string' && rawName.trim().length > 0
      ? rawName
      : fallbackDisplayName ?? '',
    'displayName',
    {
      minLength: 1,
      maxLength: 120,
    },
  );

  const fileEntry = formData.get('avatar') ?? formData.get('file');
  if (
    !fileEntry ||
    typeof fileEntry === 'string' ||
    !(fileEntry instanceof Blob) ||
    fileEntry.size === 0
  ) {
    return { displayName };
  }

  const file = fileEntry as File;
  if (file.size > EVIDENCE_MAX_BYTES) {
    const msg = `Ukuran foto profil melebihi batas maksimum 5 MiB (${EVIDENCE_MAX_BYTES} byte).`;
    throw ApiError.uploadRejected(msg, 413, { sizeBytes: msg });
  }

  if (file.type !== 'image/jpeg' && file.type !== 'image/png') {
    const msg = 'Foto profil hanya mendukung format gambar JPEG atau PNG.';
    throw ApiError.uploadRejected(msg, 400, { contentType: msg });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const meta = validateCreateEvidenceInput({
    fileName: file.name || 'avatar.jpg',
    contentType: file.type,
    sizeBytes: bytes.byteLength,
  });
  assertValidFileSignature(bytes, meta.contentType);

  return {
    displayName,
    avatar: {
      fileName: meta.fileName,
      contentType: meta.contentType as 'image/jpeg' | 'image/png',
      sizeBytes: bytes.byteLength,
      bytes,
    },
  };
}
