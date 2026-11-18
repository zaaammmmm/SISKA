// Adapter Penyimpanan Cloudinary

import { createHash } from 'node:crypto';
import { isFirebaseEmulatorMode } from '@/lib/firebase/admin';
import { ApiError } from '@/server/errors/api-error';
import {
  EVIDENCE_SIGNED_URL_EXPIRES_SECONDS,
  type EvidenceContentType,
} from '@/types/domain';

if (typeof window !== 'undefined') {
  throw new Error(
    '[SISKA Security Violation] src/lib/cloudinary/index.ts tidak boleh diimpor di sisi browser/client.',
  );
}

export type StorageProviderMode = 'cloudinary' | 'firebase';
export type CloudinaryResourceType = 'image' | 'raw';
export type CloudinaryDeliveryType = 'private' | 'authenticated' | 'upload';

export interface CloudinaryConfig {
  enabled: boolean;
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  uploadFolder: string;
}

// Konfigurasi Cloudinary
export function resolveCloudinaryConfig(): CloudinaryConfig {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim() || '';
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim() || '';
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || '';
  const uploadFolder =
    process.env.CLOUDINARY_UPLOAD_FOLDER?.trim().replace(/^\/+|\/+$/g, '') ||
    'siska';

  const enabled = Boolean(cloudName && apiKey && apiSecret);

  return {
    enabled,
    cloudName,
    apiKey,
    apiSecret,
    uploadFolder,
  };
}

// Resolusi Storage Provider
export function resolveActiveStorageProvider(): StorageProviderMode {
  const explicitProvider = process.env.STORAGE_PROVIDER?.trim().toLowerCase();
  const cloudinaryCfg = resolveCloudinaryConfig();

  if (explicitProvider === 'cloudinary') {
    if (!cloudinaryCfg.enabled) {
      throw ApiError.internal(
        'STORAGE_PROVIDER=cloudinary tetapi CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, atau CLOUDINARY_API_SECRET belum lengkap.',
        'Layanan penyimpanan media belum terkonfigurasi dengan lengkap.',
      );
    }
    return 'cloudinary';
  }

  if (explicitProvider === 'firebase') {
    return 'firebase';
  }

  if (cloudinaryCfg.enabled && !isFirebaseEmulatorMode()) {
    return 'cloudinary';
  }

  return 'firebase';
}

// Pemetaan Tipe Resource
export function cloudinaryResourceTypeForMime(
  contentType: EvidenceContentType | string,
): CloudinaryResourceType {
  if (contentType === 'application/pdf') {
    return 'raw';
  }
  return 'image';
}

// Normalisasi Public ID
export function toCloudinaryPublicId(
  storagePath: string,
  contentType?: string,
  folderPrefix?: string,
): {
  publicId: string;
  format: string;
  resourceType: CloudinaryResourceType;
} {
  const cleanPath = storagePath.replace(/^\/+/, '');
  const prefix = (
    folderPrefix ?? resolveCloudinaryConfig().uploadFolder
  ).replace(/^\/+|\/+$/g, '');

  const dotIndex = cleanPath.lastIndexOf('.');
  const hasExt = dotIndex > 0 && dotIndex > cleanPath.lastIndexOf('/');
  const ext = hasExt ? cleanPath.slice(dotIndex + 1).toLowerCase() : '';
  const pathWithoutExt = hasExt ? cleanPath.slice(0, dotIndex) : cleanPath;

  const inferredMime =
    contentType ||
    (ext === 'pdf'
      ? 'application/pdf'
      : ext === 'png'
        ? 'image/png'
        : 'image/jpeg');
  const resourceType = cloudinaryResourceTypeForMime(inferredMime);

  const baseId = prefix ? `${prefix}/${pathWithoutExt}` : pathWithoutExt;
  const publicId =
    resourceType === 'raw' && ext ? `${baseId}.${ext}` : baseId;

  return {
    publicId,
    format: ext || (resourceType === 'raw' ? 'pdf' : 'jpg'),
    resourceType,
  };
}

// Signature Parameter API
export function signCloudinaryParams(
  params: Record<string, string | number | boolean | undefined | null>,
  apiSecret: string,
): string {
  const serialized = Object.keys(params)
    .sort()
    .filter((key) => {
      const val = params[key];
      return val !== undefined && val !== null && String(val).length > 0;
    })
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  return createHash('sha1')
    .update(`${serialized}${apiSecret}`, 'utf8')
    .digest('hex');
}

// Signature Delivery URL
export function signCloudinaryDeliveryPath(
  pathToSign: string,
  apiSecret: string,
): string {
  const digest = createHash('sha1')
    .update(`${pathToSign}${apiSecret}`, 'utf8')
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .slice(0, 8);
  return `s--${digest}--`;
}

export interface CloudinarySignedDownloadResult {
  url: string;
  expiresInSeconds: number;
  previewUrl: string | null;
  blurredPreviewUrl: string | null;
}

// Pembuatan Signed Download URL
export function buildCloudinarySignedDownloadUrl(params: {
  storagePath: string;
  contentType?: string;
  expiresInSeconds?: number;
  deliveryType?: CloudinaryDeliveryType;
}): CloudinarySignedDownloadResult {
  const cfg = resolveCloudinaryConfig();
  if (!cfg.enabled) {
    throw ApiError.internal(
      'Cloudinary belum dikonfigurasi saat membangun Signed Download URL.',
    );
  }

  const boundedTtl = Math.min(
    EVIDENCE_SIGNED_URL_EXPIRES_SECONDS,
    Math.max(60, params.expiresInSeconds ?? EVIDENCE_SIGNED_URL_EXPIRES_SECONDS),
  );
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = nowSeconds + boundedTtl;
  const deliveryType: CloudinaryDeliveryType = params.deliveryType ?? 'private';

  const { publicId, format, resourceType } = toCloudinaryPublicId(
    params.storagePath,
    params.contentType,
    cfg.uploadFolder,
  );

  const signPayload: Record<string, string | number | boolean> = {
    attachment: 'true',
    expires_at: expiresAt,
    public_id: publicId,
    timestamp: nowSeconds,
    type: deliveryType,
    ...(resourceType === 'image' && format ? { format } : {}),
  };

  const signature = signCloudinaryParams(signPayload, cfg.apiSecret);
  const query = new URLSearchParams({
    api_key: cfg.apiKey,
    attachment: 'true',
    expires_at: String(expiresAt),
    public_id: publicId,
    signature,
    timestamp: String(nowSeconds),
    type: deliveryType,
    ...(resourceType === 'image' && format ? { format } : {}),
  });

  const downloadUrl = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloudName)}/${resourceType}/download?${query.toString()}`;

  let previewUrl: string | null = null;
  let blurredPreviewUrl: string | null = null;

  if (resourceType === 'image') {
    const cleanTransform = 'fl_strip_profile,f_auto,q_auto';
    const cleanPath = `${cleanTransform}/${publicId}.${format}`;
    const cleanSig = signCloudinaryDeliveryPath(cleanPath, cfg.apiSecret);
    previewUrl = `https://res.cloudinary.com/${encodeURIComponent(cfg.cloudName)}/image/${deliveryType}/${cleanSig}/${cleanPath}`;

    const blurTransform = 'e_blur:1200,fl_strip_profile,f_auto,q_auto,w_640';
    const blurPath = `${blurTransform}/${publicId}.${format}`;
    const blurSig = signCloudinaryDeliveryPath(blurPath, cfg.apiSecret);
    blurredPreviewUrl = `https://res.cloudinary.com/${encodeURIComponent(cfg.cloudName)}/image/${deliveryType}/${blurSig}/${blurPath}`;
  }

  return {
    url: downloadUrl,
    expiresInSeconds: boundedTtl,
    previewUrl,
    blurredPreviewUrl,
  };
}

// URL Gambar Publik Teroptimasi
export function buildCloudinaryPublicImageUrl(params: {
  storagePath: string;
  preset: 'avatar' | 'education_cover';
}): string {
  const cfg = resolveCloudinaryConfig();
  if (!cfg.enabled) {
    return params.storagePath;
  }

  const { publicId, format } = toCloudinaryPublicId(
    params.storagePath,
    'image/jpeg',
    cfg.uploadFolder,
  );

  const transform =
    params.preset === 'avatar'
      ? 'c_fill,g_auto,w_256,h_256,fl_strip_profile,f_auto,q_auto'
      : 'c_limit,w_1200,fl_strip_profile,f_auto,q_auto';

  return `https://res.cloudinary.com/${encodeURIComponent(cfg.cloudName)}/image/upload/${transform}/${publicId}.${format}`;
}

// Inisiasi Signed Upload
export function buildCloudinarySignedUploadGrant(params: {
  storagePath: string;
  contentType: EvidenceContentType;
  deliveryType?: CloudinaryDeliveryType;
}): {
  uploadUrl: string;
  expiresInSeconds: number;
  uploadParams: Record<string, string>;
} {
  const cfg = resolveCloudinaryConfig();
  if (!cfg.enabled) {
    throw ApiError.internal(
      'Cloudinary belum dikonfigurasi saat menginisiasi Signed Upload.',
    );
  }

  const deliveryType: CloudinaryDeliveryType = params.deliveryType ?? 'private';
  const { publicId, resourceType } = toCloudinaryPublicId(
    params.storagePath,
    params.contentType,
    cfg.uploadFolder,
  );
  const timestamp = Math.floor(Date.now() / 1000);

  const toSign: Record<string, string | number> = {
    overwrite: 'false',
    public_id: publicId,
    timestamp,
    type: deliveryType,
  };

  const signature = signCloudinaryParams(toSign, cfg.apiSecret);
  const query = new URLSearchParams({
    api_key: cfg.apiKey,
    overwrite: 'false',
    public_id: publicId,
    signature,
    timestamp: String(timestamp),
    type: deliveryType,
  });

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloudName)}/${resourceType}/upload?${query.toString()}`,
    expiresInSeconds: EVIDENCE_SIGNED_URL_EXPIRES_SECONDS,
    uploadParams: {
      api_key: cfg.apiKey,
      overwrite: 'false',
      public_id: publicId,
      signature,
      timestamp: String(timestamp),
      type: deliveryType,
    },
  };
}

export interface CloudinaryUploadResponse {
  publicId: string;
  resourceType: CloudinaryResourceType;
  deliveryType: CloudinaryDeliveryType;
  bytes: number;
  format: string;
  secureUrl: string;
}

// Unggah Biner ke Cloudinary
export async function uploadBytesToCloudinary(params: {
  storagePath: string;
  bytes: Uint8Array;
  contentType: string;
  fileName?: string;
  deliveryType?: CloudinaryDeliveryType;
}): Promise<CloudinaryUploadResponse> {
  const cfg = resolveCloudinaryConfig();
  if (!cfg.enabled) {
    throw ApiError.internal(
      'Kredensial Cloudinary belum diatur pada environment server.',
    );
  }

  const deliveryType: CloudinaryDeliveryType = params.deliveryType ?? 'private';
  const { publicId, format, resourceType } = toCloudinaryPublicId(
    params.storagePath,
    params.contentType,
    cfg.uploadFolder,
  );
  const timestamp = Math.floor(Date.now() / 1000);

  const signParams: Record<string, string | number> = {
    overwrite: 'false',
    public_id: publicId,
    timestamp,
    type: deliveryType,
  };

  const signature = signCloudinaryParams(signParams, cfg.apiSecret);

  const formData = new FormData();
  const blob = new Blob([Buffer.from(params.bytes)], {
    type: params.contentType,
  });
  formData.append('file', blob, params.fileName || `asset.${format}`);
  formData.append('api_key', cfg.apiKey);
  formData.append('timestamp', String(timestamp));
  formData.append('public_id', publicId);
  formData.append('type', deliveryType);
  formData.append('overwrite', 'false');
  formData.append('signature', signature);

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloudName)}/${resourceType}/upload`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw ApiError.internal(
      err instanceof Error ? err.message : 'Cloudinary upload network error',
      'Gagal menghubungi layanan penyimpanan media Cloudinary.',
    );
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const errObj = payload.error as { message?: string } | undefined;
    const reason =
      errObj?.message || `Cloudinary upload HTTP ${response.status}`;
    if (response.status === 400 || response.status === 422) {
      throw ApiError.uploadRejected(
        'Berkas ditolak oleh pemindai format media. Pastikan berkas tidak rusak.',
        400,
      );
    }
    throw ApiError.internal(
      reason,
      'Gagal mengunggah berkas ke layanan penyimpanan media.',
    );
  }

  return {
    publicId: String(payload.public_id ?? publicId),
    resourceType,
    deliveryType,
    bytes: Number(payload.bytes ?? params.bytes.byteLength),
    format: String(payload.format ?? format),
    secureUrl: String(payload.secure_url ?? ''),
  };
}

// Unduh Biner dari Cloudinary
export async function downloadBytesFromCloudinary(params: {
  storagePath: string;
  contentType: string;
  deliveryType?: CloudinaryDeliveryType;
}): Promise<Uint8Array | null> {
  const signed = buildCloudinarySignedDownloadUrl({
    storagePath: params.storagePath,
    contentType: params.contentType,
    expiresInSeconds: 60,
    deliveryType: params.deliveryType ?? 'private',
  });

  try {
    const response = await fetch(signed.url, {
      method: 'GET',
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Cloudinary download returned HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (err) {
    if (err instanceof Error && err.message.includes('404')) {
      return null;
    }
    throw err;
  }
}

// Hapus Aset Cloudinary
export async function deleteFromCloudinary(params: {
  storagePath: string;
  contentType?: string;
  deliveryType?: CloudinaryDeliveryType;
}): Promise<boolean> {
  const cfg = resolveCloudinaryConfig();
  if (!cfg.enabled) {
    return false;
  }

  const deliveryType: CloudinaryDeliveryType = params.deliveryType ?? 'private';
  const { publicId, resourceType } = toCloudinaryPublicId(
    params.storagePath,
    params.contentType,
    cfg.uploadFolder,
  );
  const timestamp = Math.floor(Date.now() / 1000);

  const signParams: Record<string, string | number> = {
    invalidate: 'true',
    public_id: publicId,
    timestamp,
    type: deliveryType,
  };
  const signature = signCloudinaryParams(signParams, cfg.apiSecret);

  const formData = new FormData();
  formData.append('api_key', cfg.apiKey);
  formData.append('invalidate', 'true');
  formData.append('public_id', publicId);
  formData.append('timestamp', String(timestamp));
  formData.append('type', deliveryType);
  formData.append('signature', signature);

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloudName)}/${resourceType}/destroy`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
