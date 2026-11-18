import { ApiError } from '@/server/errors/api-error';
import {
  assertAllowlistedKeys,
  validateOptionalString,
  validateRequiredString,
  validateResourceId,
} from '@/server/validators/common';
import {
  assertValidFileSignature,
  isEvidenceContentType,
  validateCreateEvidenceInput,
} from '@/server/validators/evidence.validator';
import {
  EVIDENCE_MAX_BYTES,
  type EvidenceContentType,
} from '@/types/domain';

export interface CreateConversationInput {
  reportId: string | null;
}

export interface SendMessageAttachmentInput {
  fileName: string;
  contentType: EvidenceContentType;
  sizeBytes: number;
  bytes: Uint8Array;
}

export interface SendMessageInput {
  body: string;
  attachment?: SendMessageAttachmentInput | null;
}

const CREATE_CONVERSATION_ALLOWED_KEYS = ['reportId'] as const;

// Validasi Input Pembuatan Percakapan
export function validateCreateConversationInput(
  payload: Record<string, unknown>,
): CreateConversationInput {
  assertAllowlistedKeys(
    payload,
    CREATE_CONVERSATION_ALLOWED_KEYS,
    'pembuatan percakapan',
  );

  if (
    payload.reportId === undefined ||
    payload.reportId === null ||
    payload.reportId === ''
  ) {
    return { reportId: null };
  }

  return {
    reportId: validateResourceId(payload.reportId, 'reportId'),
  };
}

const SEND_MESSAGE_ALLOWED_KEYS = ['body', 'attachment'] as const;

// Validasi Input Pengiriman Pesan (JSON)
export function validateSendMessageInput(
  payload: Record<string, unknown>,
): SendMessageInput {
  assertAllowlistedKeys(payload, SEND_MESSAGE_ALLOWED_KEYS, 'pengiriman pesan');

  const body = validateRequiredString(payload.body, 'body', {
    minLength: 1,
    maxLength: 10000,
  });

  if (payload.attachment === undefined || payload.attachment === null) {
    return { body };
  }

  if (typeof payload.attachment !== 'object' || Array.isArray(payload.attachment)) {
    const msg = "Field 'attachment' harus berupa objek lampiran yang valid.";
    throw ApiError.validation(msg, { attachment: msg });
  }

  const rawAtt = payload.attachment as Record<string, unknown>;
  const validatedMeta = validateCreateEvidenceInput(rawAtt);

  if (!validatedMeta.contentBase64) {
    const msg = "Field 'attachment.contentBase64' wajib disertakan pada pengiriman lampiran via JSON.";
    throw ApiError.validation(msg, { attachment: msg });
  }

  const maxBase64Chars = Math.ceil((EVIDENCE_MAX_BYTES * 4) / 3) + 1024;
  if (validatedMeta.contentBase64.length > maxBase64Chars) {
    const msg = `Ukuran lampiran melebihi batas maksimum 5 MiB (${EVIDENCE_MAX_BYTES} byte).`;
    throw ApiError.uploadRejected(msg, 413, { sizeBytes: msg });
  }

  const decoded = Buffer.from(validatedMeta.contentBase64, 'base64');
  if (decoded.byteLength !== validatedMeta.sizeBytes) {
    const msg = "Ukuran hasil dekode 'contentBase64' tidak sesuai dengan 'sizeBytes'.";
    throw ApiError.validation(msg, { sizeBytes: msg });
  }

  const bytes = new Uint8Array(decoded);
  assertValidFileSignature(bytes, validatedMeta.contentType);

  return {
    body,
    attachment: {
      fileName: validatedMeta.fileName,
      contentType: validatedMeta.contentType,
      sizeBytes: bytes.byteLength,
      bytes,
    },
  };
}

// Validasi Input Pengiriman Pesan Beserta Lampiran Foto/Berkas (Multipart FormData)
export async function validateMultipartSendMessageInput(
  formData: FormData,
): Promise<SendMessageInput> {
  const rawBody = formData.get('body');
  const fileEntry = formData.get('file');

  const hasFile =
    fileEntry !== null &&
    typeof fileEntry !== 'string' &&
    fileEntry instanceof Blob &&
    fileEntry.size > 0;

  const fallbackBody =
    typeof rawBody === 'string' && rawBody.trim().length > 0
      ? rawBody
      : hasFile
        ? `[Lampiran: ${(fileEntry as File).name || 'berkas'}]`
        : '';

  const body = validateRequiredString(fallbackBody, 'body', {
    minLength: 1,
    maxLength: 10000,
  });

  if (!hasFile) {
    return { body };
  }

  const file = fileEntry as File;
  if (file.size > EVIDENCE_MAX_BYTES) {
    const msg = `Ukuran lampiran melebihi batas maksimum 5 MiB (${EVIDENCE_MAX_BYTES} byte).`;
    throw ApiError.uploadRejected(msg, 413, { sizeBytes: msg });
  }

  if (!isEvidenceContentType(file.type)) {
    const msg = 'Tipe lampiran percakapan hanya mendukung JPG, PNG, atau PDF.';
    throw ApiError.uploadRejected(msg, 400, { contentType: msg });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validatedMeta = validateCreateEvidenceInput({
    fileName: file.name || 'attachment',
    contentType: file.type,
    sizeBytes: bytes.byteLength,
  });

  assertValidFileSignature(bytes, validatedMeta.contentType);

  return {
    body,
    attachment: {
      fileName: validatedMeta.fileName,
      contentType: validatedMeta.contentType,
      sizeBytes: bytes.byteLength,
      bytes,
    },
  };
}

const ASSIGN_CONVERSATION_ALLOWED_KEYS = ['assignedAdminId', 'status'] as const;

export interface UpdateConversationAdminInput {
  assignedAdminId?: string | null;
  status?: 'open' | 'closed';
}

// Validasi Pembaruan Percakapan Admin
export function validateUpdateConversationAdminInput(
  payload: Record<string, unknown>,
): UpdateConversationAdminInput {
  assertAllowlistedKeys(
    payload,
    ASSIGN_CONVERSATION_ALLOWED_KEYS,
    'pembaruan percakapan admin',
  );

  const result: UpdateConversationAdminInput = {};

  if ('assignedAdminId' in payload) {
    result.assignedAdminId =
      payload.assignedAdminId === null
        ? null
        : validateOptionalString(payload.assignedAdminId, 'assignedAdminId', {
            maxLength: 128,
          });
  }

  if ('status' in payload && payload.status !== undefined) {
    if (payload.status !== 'open' && payload.status !== 'closed') {
      const msg = "Field 'status' harus bernilai 'open' atau 'closed'.";
      throw ApiError.validation(msg, { status: msg });
    }
    result.status = payload.status;
  }

  return result;
}
