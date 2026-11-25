// Utilitas Enkripsi Lapisan Aplikasi (AES-256-GCM — Hanya Server)

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import { ApiError } from '@/server/errors/api-error';
import type { EncryptedPayload } from '@/types/domain';

if (typeof window !== 'undefined') {
  throw new Error(
    '[SISKA Security Violation] src/server/crypto/encryption.ts tidak boleh diimpor di sisi browser/client.',
  );
}

const AES_ALGORITHM = 'aes-256-gcm';
const AES_KEY_BYTES = 32;
const AES_IV_BYTES = 12;
const AES_TAG_BYTES = 16;
const HEX_PATTERN = /^[0-9a-f]+$/i;

// Validasi Bentuk Payload Terenkripsi
export function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.ciphertext === 'string' &&
    typeof candidate.iv === 'string' &&
    typeof candidate.tag === 'string' &&
    candidate.iv.length > 0 &&
    candidate.tag.length > 0
  );
}

function decodeHexField(value: string, fieldName: string): Buffer {
  if (value.length === 0) {
    return Buffer.alloc(0);
  }
  if (value.length % 2 !== 0 || !HEX_PATTERN.test(value)) {
    throw ApiError.internal(
      `Field terenkripsi '${fieldName}' bukan hex yang valid.`,
      'Data terenkripsi tidak valid atau rusak.',
    );
  }
  return Buffer.from(value, 'hex');
}

// Resolusi Kunci Enkripsi Server
export function resolveEncryptionKey(): Buffer {
  const rawKey = process.env.DATA_ENCRYPTION_KEY?.trim() || '';
  if (!rawKey) {
    throw ApiError.internal(
      'DATA_ENCRYPTION_KEY belum dikonfigurasi pada environment server.',
      'Layanan enkripsi server belum terkonfigurasi.',
    );
  }

  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }

  const base64Decoded = Buffer.from(rawKey, 'base64');
  const canonicalBase64 = base64Decoded.toString('base64').replace(/=+$/, '');
  if (
    base64Decoded.length === AES_KEY_BYTES &&
    canonicalBase64 === rawKey.replace(/=+$/, '')
  ) {
    return base64Decoded;
  }

  throw ApiError.internal(
    'Format DATA_ENCRYPTION_KEY tidak valid (harus tepat 32 byte dalam format 64 karakter hex atau base64).',
    'Konfigurasi kunci enkripsi server tidak valid.',
  );
}

// Enkripsi Teks UTF-8
export function encryptText(plaintext: string): EncryptedPayload {
  const key = resolveEncryptionKey();
  const iv = randomBytes(AES_IV_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

// Dekripsi Teks UTF-8
export function decryptText(payload: EncryptedPayload): string {
  const key = resolveEncryptionKey();
  const iv = decodeHexField(payload.iv, 'iv');
  const tag = decodeHexField(payload.tag, 'tag');
  const ciphertext = decodeHexField(payload.ciphertext, 'ciphertext');

  if (iv.length !== AES_IV_BYTES || tag.length !== AES_TAG_BYTES) {
    throw ApiError.internal(
      'Panjang IV atau authentication tag AES-256-GCM tidak sesuai standar.',
      'Data terenkripsi tidak dapat didekripsi.',
    );
  }

  try {
    const decipher = createDecipheriv(AES_ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    throw ApiError.internal(
      'Dekripsi AES-256-GCM gagal (kunci tidak cocok atau data telah dimodifikasi).',
      'Data terenkripsi tidak dapat didekripsi.',
    );
  }
}

// Enkripsi Objek JSON
export function encryptJson<T>(data: T): EncryptedPayload {
  return encryptText(JSON.stringify(data));
}

// Dekripsi Objek JSON
export function decryptJson<T>(payload: EncryptedPayload): T {
  const plaintext = decryptText(payload);
  try {
    return JSON.parse(plaintext) as T;
  } catch {
    throw ApiError.internal(
      'Payload JSON hasil dekripsi tidak valid.',
      'Data terenkripsi tidak dapat didekripsi.',
    );
  }
}
