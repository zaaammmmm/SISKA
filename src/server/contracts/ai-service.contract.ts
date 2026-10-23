/**
 * SISKA — Server-to-Server AI Service Integration Contract (`FastAPI RAG Service`)
 * Sumber otoritas:
 * - docs/05-BACKEND-ARCHITECTURE.md §2 & §9 (AI service dipanggil server-to-server; health check, timeout, fallback)
 * - docs/06-AI-ARCHITECTURE.md §3 (Endpoints FastAPI), §4 (Ingestion pipeline), §8 (Configuration)
 * - docs/09-TEST-PLAN.md REL-01 (Bounded timeout & graceful fallback)
 *
 * File ini menjadi panduan kontrak mutlak bagi Tim AI saat membangun microservice Python FastAPI:
 * 1. Seluruh request dari Next.js Backend menyertakan header:
 *    - `X-Request-Id`: ID korelasi request untuk audit/tracing.
 *    - `X-Service-Authorization`: Nilai `AI_SERVICE_SHARED_SECRET` (wajib divalidasi oleh FastAPI).
 * 2. AI Service TIDAK BOLEH mengakses koleksi `reports`, `evidence`, atau `conversations`.
 */

import type { AiCitationSource } from '@/types/api';
import type { KBDocumentStatus } from '@/types/domain';

/* ========================================================================== */
/* 1. Endpoint & Header Constants (docs/06-AI-ARCHITECTURE.md §3)             */
/* ========================================================================== */

export const AI_SERVICE_ENDPOINTS = {
  HEALTH: '/health',
  CHAT: '/chat',
  ADMIN_DOCUMENTS: '/admin/documents',
  ADMIN_DOCUMENT_BY_ID: (documentId: string) =>
    `/admin/documents/${encodeURIComponent(documentId)}`,
  ADMIN_REINDEX: '/admin/reindex',
} as const;

export const AI_SERVICE_HEADERS = {
  REQUEST_ID: 'X-Request-Id',
  SERVICE_AUTH: 'X-Service-Authorization',
} as const;

/* ========================================================================== */
/* 2. Payload Contracts (Next.js Backend <-> FastAPI RAG Service)             */
/* ========================================================================== */

/** `GET /health` response dari FastAPI (tanpa mengekspos secret/env) */
export interface FastApiHealthResponse {
  status: 'ok' | 'degraded';
  embeddingModelLoaded?: boolean;
}

/** `POST /chat` request body dari Next.js Backend ke FastAPI */
export interface FastApiChatRequest {
  message: string;
  conversationId?: string | null;
}

/** `POST /chat` response body dari FastAPI ke Next.js Backend */
export interface FastApiChatResponse {
  answer: string;
  grounded: boolean;
  sources: AiCitationSource[];
  escalationMessage?: string | null;
}

/** `POST /admin/documents` request metadata untuk antrean indexing PDF di FastAPI */
export interface FastApiDocumentIngestRequest {
  documentId: string;
  title: string;
  storagePath: string;
  sha256: string;
  version: number;
  uploadedBy: string;
}

/** `POST /admin/documents` & `GET /admin/documents` item status */
export interface FastApiDocumentStatusItem {
  documentId: string;
  status: KBDocumentStatus;
  chunkCount: number;
  errorCode?: string | null;
}

/** `POST /admin/reindex` request & response */
export interface FastApiReindexRequest {
  documentIds?: string[];
  requestedBy: string;
}

export interface FastApiReindexResponse {
  accepted: boolean;
  queuedCount: number;
}

/* ========================================================================== */
/* 3. Runtime Configuration & Server-to-Server Client Adapter                 */
/* ========================================================================== */

export interface AiServiceRuntimeConfig {
  enabled: boolean;
  baseUrl: string | null;
  sharedSecret: string | null;
  timeoutMs: number;
}

/**
 * Membaca konfigurasi runtime AI Service dari environment server.
 * Secara default `AI_SERVICE_ENABLE_REMOTE="false"` menggunakan Firestore-backed RAG lokal
 * sampai container FastAPI dijalankan.
 */
export function resolveAiServiceConfig(): AiServiceRuntimeConfig {
  const baseUrl = process.env.AI_SERVICE_URL?.trim() || null;
  const remoteFlag = process.env.AI_SERVICE_ENABLE_REMOTE?.trim().toLowerCase();
  const enabled =
    Boolean(baseUrl) && remoteFlag !== 'false' && remoteFlag !== '0';
  const sharedSecret = process.env.AI_SERVICE_SHARED_SECRET?.trim() || null;
  const timeoutMs = Math.min(
    15_000,
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

/**
 * Memanggil `POST /chat` pada microservice FastAPI RAG dengan batas waktu ketat (`REL-01`).
 * Mengembalikan `null` bila remote service dinonaktifkan atau gagal/timeout,
 * sehingga `ai.service.ts` dapat melakukan fallback aman ke Firestore RAG.
 */
export async function callRemoteAiChat(
  payload: FastApiChatRequest,
  requestId: string,
): Promise<FastApiChatResponse | null> {
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

    const body = (await response.json()) as Partial<FastApiChatResponse>;
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

/**
 * Memicu proses ingesti/embedding dokumen PDF baru ke microservice FastAPI (`POST /admin/documents` — docs/06-AI-ARCHITECTURE.md §3).
 * Mengembalikan `null` bila remote AI service dinonaktifkan atau tidak terjangkau,
 * sehingga `knowledge.service.ts` tetap menjalankan pipeline ingesti lokal sebagai fallback.
 */
export async function triggerRemoteAiDocumentIngest(
  payload: FastApiDocumentIngestRequest,
  requestId: string,
): Promise<FastApiDocumentStatusItem | null> {
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

    const body = (await response.json()) as Partial<FastApiDocumentStatusItem>;
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

/**
 * Memberitahukan microservice FastAPI untuk menghapus indeks vektor dan cache dokumen (`DELETE /admin/documents/{id}` — docs/06-AI-ARCHITECTURE.md §3).
 */
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

/**
 * Memicu job reindex idempoten pada microservice FastAPI (`POST /admin/reindex` — docs/06-AI-ARCHITECTURE.md §3).
 */
export async function triggerRemoteAiReindex(
  payload: FastApiReindexRequest,
  requestId: string,
): Promise<FastApiReindexResponse | null> {
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

    const body = (await response.json()) as Partial<FastApiReindexResponse>;
    return {
      accepted: Boolean(body.accepted ?? true),
      queuedCount: Number(body.queuedCount ?? 0),
    };
  } catch {
    return null;
  }
}

/**
 * Memeriksa kesiapan (`GET /health`) microservice FastAPI RAG tanpa membocorkan secret.
 */
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
