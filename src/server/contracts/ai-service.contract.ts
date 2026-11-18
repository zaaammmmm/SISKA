// Kontrak Integrasi AI

import type { AiCitationSource } from '@/types/api';
import type { KBDocumentStatus } from '@/types/domain';
import { ApiError } from '@/server/errors/api-error';

// Konstanta Endpoint & Header
export const AI_SERVICE_ENDPOINTS = {
  HEALTH: '/health',
  CHAT: '/chat',
  ADMIN_DOCUMENTS: '/admin/documents',
  ADMIN_RAG_DOCUMENTS: '/admin/rag-docs',
  ADMIN_DOCUMENT_BY_ID: (documentId: string) =>
    `/admin/documents/${encodeURIComponent(documentId)}`,
  ADMIN_REINDEX: '/admin/reindex',
} as const;

export const AI_SERVICE_HEADERS = {
  REQUEST_ID: 'X-Request-Id',
  SERVICE_AUTH: 'X-Service-Authorization',
} as const;

// Kontrak Payload AI
export interface AiServiceHealthResponse {
  status: 'ok' | 'degraded';
  embeddingModelLoaded?: boolean;
}

export interface AiServiceChatRequest {
  message: string;
  conversationId?: string | null;
  userId?: string;
}

export interface AiServiceChatResponse {
  answer: string;
  grounded: boolean;
  sources: AiCitationSource[];
  escalationMessage?: string | null;
}

export interface AiServiceRagDocument {
  file: string;
  cite: string;
  chunkCount: number;
  source: 'notebook' | 'web';
}

export interface AiServiceRagDocumentInput {
  file: string;
  cite: string;
  content: string;
}

export interface AiServiceRagDocumentResult {
  ok: true;
  addedChunks?: number;
  removedChunks?: number;
}

export interface AiServiceDocumentIngestRequest {
  documentId: string;
  title: string;
  storagePath: string;
  sha256: string;
  version: number;
  uploadedBy: string;
}

export interface AiServiceDocumentStatusItem {
  documentId: string;
  status: KBDocumentStatus;
  chunkCount: number;
  errorCode?: string | null;
}

export interface AiServiceReindexRequest {
  documentIds?: string[];
  requestedBy: string;
}

export interface AiServiceReindexResponse {
  accepted: boolean;
  queuedCount: number;
}

// Konfigurasi Runtime AI
export interface AiServiceRuntimeConfig {
  enabled: boolean;
  baseUrl: string | null;
  sharedSecret: string | null;
  timeoutMs: number;
}

export function resolveAiServiceConfig(): AiServiceRuntimeConfig {
  const baseUrl = process.env.AI_SERVICE_URL?.trim() || null;
  const remoteFlag = process.env.AI_SERVICE_ENABLE_REMOTE?.trim().toLowerCase();
  const enabled =
    Boolean(baseUrl) && remoteFlag !== 'false' && remoteFlag !== '0';
  const sharedSecret = process.env.AI_SERVICE_SHARED_SECRET?.trim() || null;
  const timeoutMs = Math.min(
    90_000,
    Math.max(2_000, Number(process.env.AI_SERVICE_TIMEOUT_MS) || 8_000),
  );

  return {
    enabled,
    baseUrl: baseUrl ? baseUrl.replace(/\/$/, '') : null,
    sharedSecret,
    timeoutMs,
  };
}

function buildServiceHeaders(
  requestId: string,
  sharedSecret: string | null,
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    [AI_SERVICE_HEADERS.REQUEST_ID]: requestId,
    ...(sharedSecret
      ? { [AI_SERVICE_HEADERS.SERVICE_AUTH]: sharedSecret }
      : {}),
  };
}

// Client HTTP AI
async function requestAiService<TResponse>(
  endpoint: string,
  requestId: string,
  init: RequestInit = {},
): Promise<TResponse> {
  const config = resolveAiServiceConfig();
  if (!config.enabled || !config.baseUrl || !config.sharedSecret) {
    throw ApiError.internal(
      'AI_SERVICE_URL, AI_SERVICE_ENABLE_REMOTE, atau AI_SERVICE_SHARED_SECRET belum dikonfigurasi.',
      'Layanan pengelolaan dokumen AI belum dikonfigurasi.',
    );
  }

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${endpoint}`, {
      ...init,
      headers: {
        ...buildServiceHeaders(requestId, config.sharedSecret),
        ...init.headers,
      },
      signal: AbortSignal.timeout(config.timeoutMs),
      cache: 'no-store',
    });
  } catch (error) {
    throw ApiError.internal(
      error instanceof Error ? error.message : 'AI Service request failed.',
      'AI Service tidak dapat dihubungi. Periksa apakah layanannya sedang berjalan.',
    );
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    body = {};
  }

  if (!response.ok) {
    const message =
      typeof body.message === 'string'
        ? body.message
        : 'Permintaan ke AI Service belum dapat diproses.';
    if (response.status === 400) throw ApiError.validation(message);
    if (response.status === 413) throw ApiError.uploadRejected(message, 413);
    if (response.status === 403) throw ApiError.forbidden(message);
    if (response.status === 404) throw ApiError.notFound(message);
    if (response.status === 409) throw ApiError.conflict(message);
    throw ApiError.internal(
      `AI Service returned HTTP ${response.status}.`,
      response.status === 401 || response.status === 503
        ? 'AI Service menolak permintaan. Periksa shared secret dan konfigurasi layanan.'
        : 'AI Service belum dapat memproses permintaan ini.',
    );
  }

  return body as TResponse;
}

// Daftar Dokumen RAG
export async function listRemoteAiRagDocuments(
  requestId: string,
): Promise<AiServiceRagDocument[]> {
  const body = await requestAiService<{ docs?: unknown }>(
    AI_SERVICE_ENDPOINTS.ADMIN_RAG_DOCUMENTS,
    requestId,
    { method: 'GET' },
  );
  if (
    !Array.isArray(body.docs) ||
    !body.docs.every(
      (doc) =>
        doc &&
        typeof doc === 'object' &&
        typeof doc.file === 'string' &&
        typeof doc.cite === 'string' &&
        typeof doc.chunkCount === 'number' &&
        (doc.source === 'notebook' || doc.source === 'web'),
    )
  ) {
    throw ApiError.internal(
      'AI Service returned an invalid document list.',
      'Format daftar dokumen dari AI Service tidak valid.',
    );
  }
  return body.docs as AiServiceRagDocument[];
}

// Tambah Dokumen RAG
export async function addRemoteAiRagDocument(
  payload: AiServiceRagDocumentInput,
  requestId: string,
): Promise<AiServiceRagDocumentResult> {
  const body = await requestAiService<AiServiceRagDocumentResult>(
    AI_SERVICE_ENDPOINTS.ADMIN_RAG_DOCUMENTS,
    requestId,
    { method: 'POST', body: JSON.stringify(payload) },
  );
  if (body.ok !== true || typeof body.addedChunks !== 'number') {
    throw ApiError.internal(
      'AI Service returned an invalid document creation response.',
      'AI Service mengembalikan hasil penambahan dokumen yang tidak valid.',
    );
  }
  return body;
}

// Hapus Dokumen RAG
export async function deleteRemoteAiRagDocument(
  file: string,
  requestId: string,
): Promise<AiServiceRagDocumentResult> {
  const body = await requestAiService<AiServiceRagDocumentResult>(
    `${AI_SERVICE_ENDPOINTS.ADMIN_RAG_DOCUMENTS}?file=${encodeURIComponent(file)}`,
    requestId,
    { method: 'DELETE' },
  );
  if (body.ok !== true || typeof body.removedChunks !== 'number') {
    throw ApiError.internal(
      'AI Service returned an invalid document deletion response.',
      'AI Service mengembalikan hasil penghapusan dokumen yang tidak valid.',
    );
  }
  return body;
}

// Panggilan Chat AI
export async function callRemoteAiChat(
  payload: AiServiceChatRequest,
  requestId: string,
): Promise<AiServiceChatResponse | null> {
  const config = resolveAiServiceConfig();
  if (!config.enabled || !config.baseUrl) {
    return null;
  }

  try {
    const response = await fetch(
      `${config.baseUrl}${AI_SERVICE_ENDPOINTS.CHAT}`,
      {
        method: 'POST',
        headers: buildServiceHeaders(requestId, config.sharedSecret),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(config.timeoutMs),
      },
    );

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as Partial<AiServiceChatResponse>;
    if (typeof body.answer !== 'string' || !Array.isArray(body.sources)) {
      return null;
    }

    return {
      answer: body.answer,
      grounded: Boolean(body.grounded && body.sources.length > 0),
      sources: body.sources,
      escalationMessage: body.escalationMessage ?? null,
    };
  } catch {
    return null;
  }
}

// Ingest Dokumen Remote
export async function triggerRemoteAiDocumentIngest(
  payload: AiServiceDocumentIngestRequest,
  requestId: string,
): Promise<AiServiceDocumentStatusItem | null> {
  const config = resolveAiServiceConfig();
  if (!config.enabled || !config.baseUrl) {
    return null;
  }

  try {
    const response = await fetch(
      `${config.baseUrl}${AI_SERVICE_ENDPOINTS.ADMIN_DOCUMENTS}`,
      {
        method: 'POST',
        headers: buildServiceHeaders(requestId, config.sharedSecret),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(config.timeoutMs),
      },
    );

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as Partial<AiServiceDocumentStatusItem>;
    if (!body || typeof body.status !== 'string') {
      return null;
    }

    return {
      documentId: payload.documentId,
      status: body.status as KBDocumentStatus,
      chunkCount: Number(body.chunkCount ?? 0),
      errorCode: typeof body.errorCode === 'string' ? body.errorCode : null,
    };
  } catch {
    return null;
  }
}

// Hapus Dokumen Remote
export async function triggerRemoteAiDocumentDelete(
  documentId: string,
  requestId: string,
): Promise<boolean> {
  const config = resolveAiServiceConfig();
  if (!config.enabled || !config.baseUrl) {
    return false;
  }

  try {
    const response = await fetch(
      `${config.baseUrl}${AI_SERVICE_ENDPOINTS.ADMIN_DOCUMENT_BY_ID(documentId)}`,
      {
        method: 'DELETE',
        headers: buildServiceHeaders(requestId, config.sharedSecret),
        signal: AbortSignal.timeout(config.timeoutMs),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

// Reindex Dokumen Remote
export async function triggerRemoteAiReindex(
  payload: AiServiceReindexRequest,
  requestId: string,
): Promise<AiServiceReindexResponse | null> {
  const config = resolveAiServiceConfig();
  if (!config.enabled || !config.baseUrl) {
    return null;
  }

  try {
    const response = await fetch(
      `${config.baseUrl}${AI_SERVICE_ENDPOINTS.ADMIN_REINDEX}`,
      {
        method: 'POST',
        headers: buildServiceHeaders(requestId, config.sharedSecret),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(config.timeoutMs),
      },
    );

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as Partial<AiServiceReindexResponse>;
    return {
      accepted: Boolean(body.accepted ?? true),
      queuedCount: Number(body.queuedCount ?? 0),
    };
  } catch {
    return null;
  }
}

// Cek Kesehatan AI
export async function probeRemoteAiHealth(
  requestId: string,
): Promise<{ reachable: boolean; status: string }> {
  const config = resolveAiServiceConfig();
  if (!config.enabled || !config.baseUrl) {
    return { reachable: false, status: 'disabled_using_firestore_rag' };
  }

  try {
    const response = await fetch(
      `${config.baseUrl}${AI_SERVICE_ENDPOINTS.HEALTH}`,
      {
        method: 'GET',
        headers: buildServiceHeaders(requestId, config.sharedSecret),
        signal: AbortSignal.timeout(Math.min(3_000, config.timeoutMs)),
      },
    );
    if (!response.ok) {
      return { reachable: false, status: `http_${response.status}` };
    }
    return { reachable: true, status: 'ok' };
  } catch {
    return { reachable: false, status: 'unreachable_fallback_active' };
  }
}
