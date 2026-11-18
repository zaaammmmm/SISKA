import { withAuthenticatedRoute } from '@/server/authz/route-handler';
import { jsonSuccess } from '@/server/errors/api-error';
import {
  RATE_LIMIT_POLICIES,
  enforceRateLimit,
} from '@/server/rate-limit/limiter';
import {
  addRemoteAiRagDocument,
  deleteRemoteAiRagDocument,
  listRemoteAiRagDocuments,
} from '@/server/contracts/ai-service.contract';
import { ApiError } from '@/server/errors/api-error';
import {
  assertAllowlistedKeys,
  parseJsonObject,
  validateRequiredString,
} from '@/server/validators/common';
import { recordAuditEvent } from '@/server/services/audit.service';
import { extractAiPdfText } from '@/server/services/ai-pdf-extractor';
import { validateKnowledgePdfFormData } from '@/server/validators';
import type { SerializedAiRagDocument } from '@/types/api';

const DOCUMENT_KEYS = ['file', 'cite', 'content'] as const;
const FILE_NAME_RX = /^[\w .()-]{1,120}\.(?:md|txt|pdf)$/i;
export const AI_DOCUMENT_MAX_TEXT_CHARS = 300_000;

export const runtime = 'nodejs';

function sanitizeFileName(rawName: string): string {
  const trimmed = rawName.trim();
  if (FILE_NAME_RX.test(trimmed)) return trimmed;

  const extMatch = /\.(md|txt|pdf)$/i.exec(trimmed);
  if (!extMatch) return trimmed;

  const ext = extMatch[1].toLowerCase();
  const base = trimmed
    .slice(0, trimmed.length - extMatch[0].length)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w .()-]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^-+|-+$/g, '')
    .trim()
    .slice(0, 120);

  return `${base || 'dokumen'}.${ext}`;
}

function validateFileName(value: unknown): string {
  const rawFile = validateRequiredString(value, 'file', { maxLength: 180 });
  const file = sanitizeFileName(rawFile);
  if (!FILE_NAME_RX.test(file)) {
    throw ApiError.validation(
      'Nama dokumen harus berakhiran .md, .txt, atau .pdf dan tidak boleh berisi folder.',
      { file: 'Gunakan nama file .md/.txt/.pdf tanpa folder.' },
    );
  }
  return file;
}

// GET /api/v1/admin/ai-documents
export const GET = withAuthenticatedRoute(
  async ({ requestId }) => {
    const docs = await listRemoteAiRagDocuments(requestId);
    return jsonSuccess<{ items: SerializedAiRagDocument[]; nextCursor: null }>(
      { items: docs, nextCursor: null },
      requestId,
    );
  },
  { adminOnly: true },
);

// POST /api/v1/admin/ai-documents
export const POST = withAuthenticatedRoute(
  async ({ request, requestId, caller }) => {
    enforceRateLimit(caller.uid, RATE_LIMIT_POLICIES.ADMIN_MUTATION);
    let file: string;
    let cite: string;
    let content: string;

    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      const upload = await validateKnowledgePdfFormData(await request.formData());
      file = validateFileName(upload.fileName);
      cite = upload.title;
      content = await extractAiPdfText(upload.bytes, cite);
    } else {
      const body = await parseJsonObject(request);
      assertAllowlistedKeys(body, DOCUMENT_KEYS, 'dokumen SISKA AI');
      file = validateFileName(body.file);
      cite = validateRequiredString(body.cite, 'cite', { maxLength: 200 });
      content = validateRequiredString(body.content, 'content', {
        maxLength: AI_DOCUMENT_MAX_TEXT_CHARS,
      });
    }

    const result = await addRemoteAiRagDocument(
      { file, cite, content },
      requestId,
    );
    await recordAuditEvent({
      actorUid: caller.uid,
      action: 'kb.document_uploaded',
      targetType: 'knowledgeDocument',
      targetId: file,
      requestId,
    });

    return jsonSuccess<SerializedAiRagDocument>(
      { file, cite, chunkCount: result.addedChunks ?? 0, source: 'web' },
      requestId,
      201,
    );
  },
  { adminOnly: true },
);

// DELETE /api/v1/admin/ai-documents
export const DELETE = withAuthenticatedRoute(
  async ({ request, requestId, caller }) => {
    enforceRateLimit(caller.uid, RATE_LIMIT_POLICIES.ADMIN_MUTATION);
    const body = await parseJsonObject(request);
    assertAllowlistedKeys(body, ['file'], 'penghapusan dokumen SISKA AI');
    const file = validateFileName(body.file);

    const result = await deleteRemoteAiRagDocument(file, requestId);
    await recordAuditEvent({
      actorUid: caller.uid,
      action: 'kb.document_deleted',
      targetType: 'knowledgeDocument',
      targetId: file,
      requestId,
    });

    return jsonSuccess({ file, removedChunks: result.removedChunks }, requestId);
  },
  { adminOnly: true },
);
