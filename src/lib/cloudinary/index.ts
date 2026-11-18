/**
 * SISKA — Server-Side Cloudinary Storage & Media Transformation Adapter (`src/lib/cloudinary/index.ts`)
 * Sumber otoritas:
 * - docs/01-SRS.md FR-007, NFR-SEC-02, NFR-SEC-03, NFR-REL-01
 * - docs/04-API-SPEC.yaml (/reports/{reportId}/evidence, Signed URL <= 300s)
 * - docs/05-BACKEND-ARCHITECTURE.md §4.6 & §5
 * - docs/12-DATA-CLASSIFICATION.md (K1 Bukti & Chat Privat, K2 Profil, K4 Edukasi Publik)
 * - docs/13-SECURITY-REVIEW-FINDINGS.md (SEC-F05, SEC-F06, SEC-F07, SEC-F11)
 *
 * Fitur Utama:
 * 1. Murni Server-Side (Node.js `crypto` + `fetch` standar, tanpa membocorkan API Secret ke browser).
 * 2. Mendukung mode Private/Authenticated (`type: 'private'`) untuk bukti K1 & lampiran chat.
 * 3. Menghasilkan Signed Download URL berumur singkat (<= 300 detik) dengan `attachment=true` (SEC-F07).
 * 4. Menghasilkan Signed Preview URL dengan pembersihan EXIF/GPS (`fl_strip_profile`) dan mode blur (`e_blur:1200`).
 * 5. Mendukung Compensating Delete (`destroy`) untuk rollback otomatis saat transaksi Firestore gagal (FILE-04).
 */

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

/**
 * Membaca konfigurasi Cloudinary dari environment server.
 */
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

/**
 * Menentukan provider penyimpanan berkas aktif (`'cloudinary'` atau `'firebase'`).
 * - Jika `STORAGE_PROVIDER="cloudinary"`, memaksa penggunaan Cloudinary.
 * - Jika `STORAGE_PROVIDER="firebase"`, memaksa penggunaan Firebase Storage.
 * - Default (`auto`): menggunakan Cloudinary jika kredensial Cloudinary terpasang
 *   dan tidak sedang berada di mode Firebase Emulator; selebihnya menggunakan Firebase Storage.
 */
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

/**
 * Menentukan `resource_type` Cloudinary berdasarkan MIME type.
 * Catatan penting untuk Cloudinary Free Tier:
 * Berkas PDF disimpan sebagai `raw` agar pengunduhan tidak diblokir oleh batasan
 * default PDF-as-image pada akun Cloudinary gratis, sedangkan JPG/PNG menggunakan `image`.
 */
export function cloudinaryResourceTypeForMime(
  contentType: EvidenceContentType | string,
): CloudinaryResourceType {
  if (contentType === 'application/pdf') {
    return 'raw';
  }
  return 'image';
}

/**
 * Menormalkan path objek internal SISKA (mis. `reports/rpt_1/evidence/ev_1.jpg`)
 * menjadi `public_id` dan `format` untuk Cloudinary.
 */
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

  // Untuk resource_type 'raw' di Cloudinary, public_id menyertakan ekstensi (.pdf)
  const publicId =
    resourceType === 'raw' && ext ? `${baseId}.${ext}` : baseId;

  return {
    publicId,
    format: ext || (resourceType === 'raw' ? 'pdf' : 'jpg'),
    resourceType,
  };
}

/**
 * Menghasilkan signature SHA-1 heksadesimal sesuai spesifikasi autentikasi Cloudinary REST API.
 * Parameter diurutkan alfabetis berdasarkan key, digabung `key=value&...`, lalu ditambah `apiSecret`.
 */
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

/**
 * Menghasilkan token tanda tangan pendek `s--XXXXXXXX--` (8 karakter base64url SHA-1)
 * untuk Signed Delivery URL transformasi gambar Cloudinary (`res.cloudinary.com`).
 */
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

/**
 * Membangun Signed Download URL berumur singkat (maksimal 300 detik / 5 menit)
 * melalui endpoint `/v1_1/{cloud_name}/{resource_type}/download` milik Cloudinary:
 * - Menegakkan `expires_at` di sisi server Cloudinary.
 * - Menambahkan `attachment=true` untuk memaksa `Content-Disposition: attachment` (Menutup SEC-F07).
 * - Untuk berkas foto (`image/jpeg`, `image/png`), menyertakan `previewUrl` (dengan `fl_strip_profile`
 *   penghapus EXIF/GPS) dan `blurredPreviewUrl` (`e_blur:1200`) untuk pratinjau aman.
 */
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

  // Jika berupa foto (JPG/PNG), buat Signed Delivery URL dengan penghapusan EXIF/GPS (fl_strip_profile)
  // serta pratinjau yang diburamkan (e_blur:1200) untuk perlindungan trauma visual petugas/pelapor.
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

/**
 * Membangun URL transformasi publik yang telah dioptimalkan & dibersihkan EXIF-nya
 * khusus untuk aset non-rahasia (Foto Profil K2 `avatar` atau Sampul Edukasi K4 `education`).
 */
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

/**
 * Membangun instruksi Signed Upload untuk alur inisiasi 2-tahap (`registerEvidenceUpload` Mode 3).
 */
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

  // SEC-F05: overwrite='false' mencegah penimpaan objek yang sudah ada
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

/**
 * Mengunggah biner terverifikasi ke Cloudinary melalui Server-to-Server REST API.
 * - Menggunakan `overwrite: 'false'` (SEC-F05: menolak penimpaan objek bukti lama).
 * - Menggunakan `type: 'private'` secara default untuk bukti laporan & lampiran chat.
 */
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

/**
 * Mengunduh biner objek dari Cloudinary menggunakan Signed Download URL internal
 * untuk memverifikasi keberadaan, ukuran, Magic Bytes, dan SHA-256 pada alur Finalisasi 2-Tahap.
 */
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

/**
 * Menghapus aset dari Cloudinary (`POST /v1_1/{cloud_name}/{resource_type}/destroy`).
 * Digunakan untuk compensating rollback (FILE-04 / NFR-REL-01) bila penulisan Firestore gagal,
 * maupun saat dokumen/aset dihapus.
 */
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
