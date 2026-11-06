import { ApiError } from '@/server/errors/api-error';
import {
  assertAllowlistedKeys,
  validateOptionalString,
  validateRequiredString,
  validateResourceId,
} from '@/server/validators/common';
import { assertValidFileSignature } from '@/server/validators/evidence.validator';

export interface AiChatInput {
  message: string;
  conversationId: string | null;
}

const AI_CHAT_ALLOWED_KEYS = ['message', 'conversationId'] as const;

// Batas Ukuran PDF KB
export const KB_PDF_MAX_BYTES = 25 * 1024 * 1024;

// Validasi Input Chat AI
export function validateAiChatInput(
  payload: Record<string, unknown>,
): AiChatInput {
  assertAllowlistedKeys(payload, AI_CHAT_ALLOWED_KEYS, 'pertanyaan SISKA AI');

  const message = validateRequiredString(payload.message, 'message', {
    minLength: 1,
    maxLength: 4000,
  });

  const conversationId =
    payload.conversationId === undefined ||
    payload.conversationId === null ||
    payload.conversationId === ''
      ? null
      : validateResourceId(payload.conversationId, 'conversationId');

  return {
    message,
    conversationId,
  };
}

export interface ValidatedKnowledgePdfUpload {
  title: string;
  fileName: string;
  sizeBytes: number;
  bytes: Uint8Array;
}

// Validasi Form Data PDF KB
export async function validateKnowledgePdfFormData(
  formData: FormData,
): Promise<ValidatedKnowledgePdfUpload> {
  const fileEntry = formData.get('file');
  if (
    !fileEntry ||
    typeof fileEntry === 'string' ||
    !(fileEntry instanceof Blob)
  ) {
    const msg =
      "Field berkas 'file' (PDF) wajib disertakan pada multipart/form-data.";
    throw ApiError.validation(msg, { file: msg });
  }

  const file = fileEntry as File;
  if (file.type && file.type !== 'application/pdf') {
    const msg =
      'Dokumen Knowledge Base hanya menerima berkas berformat PDF (application/pdf).';
    throw ApiError.uploadRejected(msg, 400, { file: msg });
  }

  if (file.size < 1) {
    const msg = 'Berkas PDF tidak boleh kosong.';
    throw ApiError.uploadRejected(msg, 400, { file: msg });
  }

  if (file.size > KB_PDF_MAX_BYTES) {
    const msg = `Ukuran berkas PDF Knowledge Base melebihi batas maksimum 25 MiB (${KB_PDF_MAX_BYTES} byte).`;
    throw ApiError.uploadRejected(msg, 413, { file: msg });
  }

  const rawTitle = formData.get('title');
  const fallbackTitle = (file.name || 'Dokumen Knowledge Base')
    .replace(/\.pdf$/i, '')
    .slice(0, 250);
  const title =
    typeof rawTitle === 'string' && rawTitle.trim().length > 0
      ? validateOptionalString(rawTitle, 'title', { maxLength: 250 }) ??
        fallbackTitle
      : fallbackTitle;

  const bytes = new Uint8Array(await file.arrayBuffer());
  assertValidFileSignature(bytes, 'application/pdf');

  return {
    title,
    fileName: file.name || 'document.pdf',
    sizeBytes: bytes.byteLength,
    bytes,
  };
}
