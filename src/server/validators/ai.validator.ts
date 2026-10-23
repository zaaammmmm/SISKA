/**
 * SISKA — AI Chat & Knowledge Base Document Validators
 * Sumber otoritas:
 * - docs/04-API-SPEC.yaml (/ai/chat, /admin/knowledge-documents)
 * - docs/06-AI-ARCHITECTURE.md §3 & §4
 * - docs/09-TEST-PLAN.md AI-03, AI-04, KB-01
 */

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

/** Batas ukuran unggahan PDF Knowledge Base: 25 MiB (storage.rules line 7) */
export const KB_PDF_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Validasi body `POST /api/v1/ai/chat` sesuai docs/04-API-SPEC.yaml:
 * - `message`: string [1..4000] (wajib)
 * - `conversationId`: string opsional
 * Menolak field `reportId`, `context`, atau `systemPrompt` dari client (NFR-PRIV-02 & AI-04).
 */
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

/**
 * Validasi berkas PDF Knowledge Base yang diunggah melalui `multipart/form-data`
 * pada `POST /api/v1/admin/knowledge-documents` (docs/04-API-SPEC.yaml lines 240-256).
 */
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
