/**
 * SISKA — Strongly-Typed Authenticated API Client (`apiClient`)
 * Sumber otoritas:
 * - docs/04-API-SPEC.yaml
 * - docs/05-BACKEND-ARCHITECTURE.md §4 & §8
 * - docs/07-FRONTEND-ARCHITECTURE.md §5 & §6 ("Each request includes bearer token; server derives identity from token... never store auth tokens in localStorage")
 */

import { auth } from '@/lib/firebase/client';
import type {
  AiChatResponse,
  ApiErrorBody,
  ApiErrorCode,
  ApiErrorFieldMap,
  CreateEvidenceResult,
  KnowledgeReindexResult,
  PaginatedAuditEventsResult,
  PaginatedConversationsResult,
  PaginatedKnowledgeDocumentsResult,
  PaginatedMessagesResult,
  PaginatedReportsResult,
  ReportsSummaryResult,
  SerializedConversation,
  SerializedKnowledgeDocument,
  SerializedMessage,
  SerializedReport,
  SerializedReportDetail,
  SerializedUserProfile,
  SignedDownloadUrlResult,
} from '@/types/api';
import type {
  ConversationStatus,
  EvidenceContentType,
  ReportStatus,
} from '@/types/domain';

export class SiskaApiClientError extends Error {
  public readonly status: number;
  public readonly code: ApiErrorCode | string;
  public readonly requestId: string;
  public readonly fields: ApiErrorFieldMap | null;
  public readonly retryAfterSeconds: number | null;

  constructor(params: {
    status: number;
    code: ApiErrorCode | string;
    message: string;
    requestId: string;
    fields?: ApiErrorFieldMap | null;
    retryAfterSeconds?: number | null;
  }) {
    super(params.message);
    this.name = 'SiskaApiClientError';
    this.status = params.status;
    this.code = params.code;
    this.requestId = params.requestId;
    this.fields = params.fields ?? null;
    this.retryAfterSeconds = params.retryAfterSeconds ?? null;
  }
}

/**
 * Mengambil Firebase ID Token dari sesi pengguna aktif di memori Firebase Auth SDK.
 * Tidak pernah membaca atau menyimpan token di `localStorage` / `sessionStorage` (docs/07-FRONTEND-ARCHITECTURE.md §6).
 */
async function getActiveBearerToken(forceRefresh = false): Promise<string> {
  const currentUser = auth?.currentUser;
  if (!currentUser) {
    throw new SiskaApiClientError({
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Sesi login tidak ditemukan. Silakan masuk terlebih dahulu.',
      requestId: 'client_unauthenticated',
    });
  }
  return currentUser.getIdToken(forceRefresh);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  searchParams?: Record<string, string | number | null | undefined>;
  forceRefreshToken?: boolean;
  signal?: AbortSignal;
}

async function apiRequest<TResponse>(
  path: string,
  options: RequestOptions = {},
): Promise<TResponse> {
  const token = await getActiveBearerToken(options.forceRefreshToken);
  const url = new URL(
    path.startsWith('/') ? `/api/v1${path}` : `/api/v1/${path}`,
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
  );

  if (options.searchParams) {
    for (const [key, val] of Object.entries(options.searchParams)) {
      if (val !== undefined && val !== null && String(val).length > 0) {
        url.searchParams.set(key, String(val));
      }
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  let requestBody: BodyInit | undefined;
  if (options.formData) {
    requestBody = options.formData;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(options.body);
  }

  const response = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers,
    body: requestBody,
    cache: 'no-store',
    signal: options.signal,
  });

  if (response.status === 204) {
    return undefined as TResponse;
  }

  const requestIdHeader = response.headers.get('x-request-id') ?? 'unknown';
  const retryAfterHeader = response.headers.get('retry-after');
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : null;

  let jsonPayload: unknown = null;
  try {
    jsonPayload = await response.json();
  } catch {
    jsonPayload = null;
  }

  if (!response.ok) {
    const errBody = (jsonPayload ?? {}) as Partial<ApiErrorBody>;
    throw new SiskaApiClientError({
      status: response.status,
      code: errBody.code ?? 'INTERNAL_ERROR',
      message:
        errBody.message ??
        'Permintaan belum dapat diproses saat ini. Silakan coba kembali.',
      requestId: errBody.requestId ?? requestIdHeader,
      fields: errBody.fields ?? null,
      retryAfterSeconds: Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds
        : null,
    });
  }

  return jsonPayload as TResponse;
}

// ── 1. Profile API (/api/v1/profile) ───────────────────────────────────────

export async function fetchMyProfile(): Promise<SerializedUserProfile> {
  return apiRequest<SerializedUserProfile>('/profile', { method: 'GET' });
}

export async function updateMyProfileName(
  displayName: string,
): Promise<SerializedUserProfile> {
  return apiRequest<SerializedUserProfile>('/profile', {
    method: 'PATCH',
    body: { displayName },
  });
}

/**
 * Inisialisasi satu kali profil `reporter` pada saat registrasi akun baru,
 * diikuti penyegaran ID token agar Custom Claim `{ role: 'reporter' }` langsung aktif.
 */
export async function provisionInitialReporterProfile(
  displayName: string,
): Promise<SerializedUserProfile> {
  const profile = await apiRequest<SerializedUserProfile>('/profile', {
    method: 'POST',
    body: { displayName },
  });
  await auth?.currentUser?.getIdToken(true).catch(() => undefined);
  return profile;
}

// ── 2. Reports API (/api/v1/reports) ───────────────────────────────────────

export async function fetchReportsPage(params?: {
  cursor?: string | null;
  limit?: number;
  status?: ReportStatus | null;
}): Promise<PaginatedReportsResult> {
  return apiRequest<PaginatedReportsResult>('/reports', {
    method: 'GET',
    searchParams: {
      cursor: params?.cursor ?? undefined,
      limit: params?.limit ?? undefined,
      status: params?.status ?? undefined,
    },
  });
}

export async function fetchReportsSummary(): Promise<ReportsSummaryResult> {
  return apiRequest<ReportsSummaryResult>('/reports/summary', {
    method: 'GET',
  });
}

export async function fetchReportDetail(
  reportId: string,
): Promise<SerializedReportDetail> {
  return apiRequest<SerializedReportDetail>(
    `/reports/${encodeURIComponent(reportId)}`,
    { method: 'GET' },
  );
}

export async function submitNewReport(payload: {
  category: string;
  incidentAt?: string | null;
  location?: string | null;
  description: string;
}): Promise<SerializedReport> {
  return apiRequest<SerializedReport>('/reports', {
    method: 'POST',
    body: {
      category: payload.category,
      incidentAt: payload.incidentAt ?? null,
      location: payload.location ?? null,
      description: payload.description,
    },
  });
}

export async function transitionReportStatusByAdmin(
  reportId: string,
  payload: { status: ReportStatus; note?: string | null },
): Promise<SerializedReport> {
  return apiRequest<SerializedReport>(
    `/reports/${encodeURIComponent(reportId)}`,
    {
      method: 'PATCH',
      body: {
        status: payload.status,
        ...(payload.note !== undefined ? { note: payload.note } : {}),
      },
    },
  );
}

// ── 3. Evidence API (/api/v1/reports/{id}/evidence) ────────────────────────

export async function uploadEvidenceMultipart(
  reportId: string,
  file: File,
): Promise<CreateEvidenceResult> {
  const formData = new FormData();
  formData.append('file', file);
  return apiRequest<CreateEvidenceResult>(
    `/reports/${encodeURIComponent(reportId)}/evidence`,
    {
      method: 'POST',
      formData,
    },
  );
}

export async function initiateEvidenceUpload(
  reportId: string,
  meta: {
    fileName: string;
    contentType: EvidenceContentType;
    sizeBytes: number;
    sha256?: string;
  },
): Promise<CreateEvidenceResult> {
  return apiRequest<CreateEvidenceResult>(
    `/reports/${encodeURIComponent(reportId)}/evidence`,
    {
      method: 'POST',
      body: meta,
    },
  );
}

export async function finalizeEvidenceUpload(
  reportId: string,
  meta: {
    evidenceId: string;
    fileName: string;
    contentType: EvidenceContentType;
    sizeBytes: number;
    sha256?: string;
  },
): Promise<CreateEvidenceResult> {
  return apiRequest<CreateEvidenceResult>(
    `/reports/${encodeURIComponent(reportId)}/evidence`,
    {
      method: 'POST',
      body: meta,
    },
  );
}

export async function fetchEvidenceSignedDownloadUrl(
  reportId: string,
  evidenceId: string,
): Promise<SignedDownloadUrlResult> {
  return apiRequest<SignedDownloadUrlResult>(
    `/reports/${encodeURIComponent(reportId)}/evidence/${encodeURIComponent(evidenceId)}/download`,
    { method: 'GET' },
  );
}

// ── 4. Conversations & Messages API (/api/v1/conversations) ────────────────

export async function fetchConversations(): Promise<PaginatedConversationsResult> {
  return apiRequest<PaginatedConversationsResult>('/conversations', {
    method: 'GET',
  });
}

export async function openConversation(
  reportId?: string | null,
): Promise<SerializedConversation> {
  return apiRequest<SerializedConversation>('/conversations', {
    method: 'POST',
    body: reportId ? { reportId } : {},
  });
}

export async function updateConversationStatusByAdmin(
  conversationId: string,
  patch: { assignedAdminId?: string | null; status?: ConversationStatus },
): Promise<SerializedConversation> {
  return apiRequest<SerializedConversation>(
    `/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: 'PATCH',
      body: patch,
    },
  );
}

export async function fetchConversationMessages(
  conversationId: string,
  params?: { cursor?: string | null; limit?: number },
): Promise<PaginatedMessagesResult> {
  return apiRequest<PaginatedMessagesResult>(
    `/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'GET',
      searchParams: {
        cursor: params?.cursor ?? undefined,
        limit: params?.limit ?? undefined,
      },
    },
  );
}

export async function postConversationMessage(
  conversationId: string,
  body: string,
): Promise<SerializedMessage> {
  return apiRequest<SerializedMessage>(
    `/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      body: { body },
    },
  );
}

// ── 5. SISKA AI Chat API (/api/v1/ai/chat) ─────────────────────────────────

export async function askSiskaAiQuestion(
  message: string,
  conversationId?: string,
  signal?: AbortSignal,
): Promise<AiChatResponse> {
  return apiRequest<AiChatResponse>('/ai/chat', {
    method: 'POST',
    body: {
      message,
      ...(conversationId ? { conversationId } : {}),
    },
    signal,
  });
}

// ── 6. Admin Knowledge Base & Audit API (/api/v1/admin/*) ──────────────────

export async function fetchKnowledgeDocumentsByAdmin(): Promise<PaginatedKnowledgeDocumentsResult> {
  return apiRequest<PaginatedKnowledgeDocumentsResult>(
    '/admin/knowledge-documents',
    { method: 'GET' },
  );
}

export async function uploadKnowledgePdfByAdmin(
  file: File,
  title?: string,
): Promise<SerializedKnowledgeDocument> {
  const formData = new FormData();
  formData.append('file', file);
  if (title && title.trim().length > 0) {
    formData.append('title', title.trim());
  }
  return apiRequest<SerializedKnowledgeDocument>(
    '/admin/knowledge-documents',
    {
      method: 'POST',
      formData,
    },
  );
}

export async function deleteKnowledgeDocumentByAdmin(
  documentId: string,
): Promise<void> {
  return apiRequest<void>(
    `/admin/knowledge-documents/${encodeURIComponent(documentId)}`,
    { method: 'DELETE' },
  );
}

export async function triggerKnowledgeReindexByAdmin(): Promise<KnowledgeReindexResult> {
  return apiRequest<KnowledgeReindexResult>('/admin/knowledge-documents/reindex', {
    method: 'POST',
  });
}

export async function fetchAuditEventsByAdmin(params?: {
  cursor?: string | null;
  limit?: number;
}): Promise<PaginatedAuditEventsResult> {
  return apiRequest<PaginatedAuditEventsResult>('/admin/audit-events', {
    method: 'GET',
    searchParams: {
      cursor: params?.cursor ?? undefined,
      limit: params?.limit ?? undefined,
    },
  });
}

// ── 7. Readiness & Health Check (/api/v1/health) ───────────────────────────

export interface BackendHealthStatus {
  status: 'ok';
  service: string;
  apiVersion: string;
  aiEngineMode: 'remote_fastapi_rag' | 'local_firestore_rag';
  timestamp: string;
}

export async function fetchBackendHealth(): Promise<BackendHealthStatus> {
  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/v1/health`
      : 'http://localhost:3000/api/v1/health';
  const response = await fetch(url, { method: 'GET', cache: 'no-store' });
  const json = (await response.json()) as BackendHealthStatus;
  return json;
}

/**
 * Objek SDK terstruktur (`siskaApi`) untuk memudahkan eksplorasi endpoint
 * melalui autocomplete oleh Tim Frontend dan Tim AI.
 */
export const siskaApi = {
  health: {
    check: fetchBackendHealth,
  },
  profile: {
    get: fetchMyProfile,
    updateName: updateMyProfileName,
    provisionReporter: provisionInitialReporterProfile,
  },
  reports: {
    list: fetchReportsPage,
    summary: fetchReportsSummary,
    detail: fetchReportDetail,
    create: submitNewReport,
    updateStatus: transitionReportStatusByAdmin,
  },
  evidence: {
    uploadMultipart: uploadEvidenceMultipart,
    initiateJsonUpload: initiateEvidenceUpload,
    finalizeJsonUpload: finalizeEvidenceUpload,
    getSignedDownloadUrl: fetchEvidenceSignedDownloadUrl,
  },
  conversations: {
    list: fetchConversations,
    open: openConversation,
    updateByAdmin: updateConversationStatusByAdmin,
    listMessages: fetchConversationMessages,
    sendMessage: postConversationMessage,
  },
  ai: {
    ask: askSiskaAiQuestion,
  },
  admin: {
    listKnowledgeDocuments: fetchKnowledgeDocumentsByAdmin,
    uploadKnowledgePdf: uploadKnowledgePdfByAdmin,
    deleteKnowledgeDocument: deleteKnowledgeDocumentByAdmin,
    reindexKnowledgeBase: triggerKnowledgeReindexByAdmin,
    listAuditEvents: fetchAuditEventsByAdmin,
  },
} as const;


