// Server HTTP AI
import http from 'node:http';
import crypto from 'node:crypto';
import {
  PORT, HOST, SHARED_SECRET, ALLOW_NO_AUTH, MAX_BODY_BYTES, SESSION_MAX, SESSION_TTL_MS, DEBUG_ENABLED,
} from './config.js';
import { answer, invalidateRetrievalCache } from './rag/rag.js';
import { loadIndex, indexInfo } from './rag/indexStore.js';
import { pingOllama, hasModel, chatModel, embedModel } from './rag/llm.js';
import { getSettings, setSettings, resolveBaseUrl } from './rag/settingsStore.js';
import { listDocs, addDocument, deleteDocument, resetRuntime } from './rag/docStore.js';
import { SessionStore } from './rag/sessions.js';
import { toContractResponse } from './contract.js';

const sessions = new SessionStore(SESSION_MAX, SESSION_TTL_MS);

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function send(res, status, body, requestId) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...(requestId ? { 'X-Request-Id': requestId } : {}),
  });
  res.end(payload);
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Verifikasi Shared Secret
function assertAuthorized(req) {
  if (!SHARED_SECRET) {
    if (ALLOW_NO_AUTH) return;
    throw new HttpError(503, 'AUTH_NOT_CONFIGURED', 'AI_SERVICE_SHARED_SECRET belum diset.');
  }
  const given = String(req.headers['x-service-authorization'] || '');
  if (!given || !safeEqual(given, SHARED_SECRET)) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Tidak diizinkan.');
  }
}

// Pembacaan Body JSON
async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Body terlalu besar.');
    chunks.push(c);
  }
  if (!size) return {};
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error('bukan objek');
    return v;
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Body harus berupa objek JSON yang valid.');
  }
}

// Kunci Identitas Pengguna
function userKey(body) {
  const raw = typeof body.userId === 'string' ? body.userId.trim() : '';
  return /^[a-zA-Z0-9_.:-]{1,128}$/.test(raw) ? raw : 'anonymous';
}

// Handler Endpoint Chat
async function handleChat(req, requestId) {
  const body = await readJson(req);
  const message = typeof body.message === 'string' ? body.message : '';
  if (!message.trim() || message.length > 4000) {
    throw new HttpError(400, 'VALIDATION_ERROR', "Field 'message' wajib diisi (1-4000 karakter).");
  }
  const conversationId = typeof body.conversationId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(body.conversationId)
    ? body.conversationId : null;

  const user = userKey(body);
  const key = SessionStore.key(user, conversationId);
  const settings = getSettings();
  let baseUrl;
  try {
    baseUrl = resolveBaseUrl(settings);
  } catch (e) {
    throw new HttpError(503, 'LLM_NOT_CONFIGURED', String(e.message || e));
  }

  const result = await answer(message, sessions.get(key), user, settings.backend, baseUrl);

  console.log(JSON.stringify({
    t: new Date().toISOString(), requestId, route: result.route,
    backend: result.backend, latencyS: result.latency, grounded: result.sources.length > 0,
    problems: result.problems.length ? result.problems : undefined,
  }));

  if (result.route === 'llm_error') {
    throw new HttpError(503, 'LLM_UNAVAILABLE', 'Model bahasa tidak terjangkau.');
  }
  sessions.set(key, result.history);
  const contract = toContractResponse(result);
  if (DEBUG_ENABLED && req.headers['x-debug'] === '1') return { ...contract, debug: result.debug };
  return contract;
}

// Handler Endpoint Health
async function handleHealth() {
  let indexOk = true;
  let chunkCount = 0;
  try { chunkCount = loadIndex().chunks.length; } catch { indexOk = false; }
  const settings = getSettings();
  let ollama = { up: false };
  try { ollama = await pingOllama(resolveBaseUrl(settings)); } catch (e) { ollama = { up: false, error: String(e.message || e) }; }
  return {
    status: indexOk && ollama.up ? 'ok' : 'degraded',
    indexLoaded: indexOk,
    chunkCount,
    llmReachable: ollama.up,
    // Informasi saja (tidak mengubah `status`): apakah model chat/embedding sudah di-pull di Ollama.
    chatModel: chatModel(),
    index: indexOk ? indexInfo() : null,
    chatModelLoaded: ollama.up ? hasModel(ollama.models, chatModel()) : false,
    embeddingModelLoaded: ollama.up ? hasModel(ollama.models, embedModel()) : false,
    backend: settings.backend,
  };
}

// Routing Request HTTP
async function route(req, res, requestId) {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;
  const m = req.method;

  if (m === 'GET' && pathname === '/health') return send(res, 200, await handleHealth(), requestId);

  assertAuthorized(req);

  if (m === 'POST' && pathname === '/chat') return send(res, 200, await handleChat(req, requestId), requestId);

  if (pathname === '/admin/rag-docs') {
    if (m === 'GET') return send(res, 200, { docs: listDocs() }, requestId);
    if (m === 'POST') {
      const b = await readJson(req);
      const file = String(b.file ?? '').trim();
      const cite = String(b.cite ?? '').trim();
      const content = String(b.content ?? '');
      if (!/^[\w .()-]{1,120}\.(md|txt|pdf)$/i.test(file)) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Nama berkas harus .md/.txt/.pdf tanpa folder.');
      }
      if (!cite || !content.trim()) throw new HttpError(400, 'VALIDATION_ERROR', 'cite dan content wajib diisi.');
      if (content.length > 300_000) {
        throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Konten dokumen melebihi batas 300.000 karakter.');
      }
      if (listDocs().some((doc) => doc.file === file)) {
        throw new HttpError(409, 'CONFLICT', `Dokumen "${file}" sudah ada di index.`);
      }
      const out = await addDocument(file, cite, content, resolveBaseUrl(getSettings()));
      invalidateRetrievalCache();
      return send(res, 200, { ok: true, ...out }, requestId);
    }
    if (m === 'DELETE') {
      if (url.searchParams.get('reset') === '1') {
        const out = await resetRuntime();
        invalidateRetrievalCache();
        return send(res, 200, { ok: true, ...out }, requestId);
      }
      const file = url.searchParams.get('file');
      if (!file) throw new HttpError(400, 'VALIDATION_ERROR', 'Parameter ?file= atau ?reset=1 wajib diisi.');
      let out;
      try {
        out = await deleteDocument(file);
      } catch (e) {
        throw new HttpError(404, 'NOT_FOUND', String(e.message || e));
      }
      invalidateRetrievalCache();
      return send(res, 200, { ok: true, ...out }, requestId);
    }
  }

  if (pathname === '/admin/settings') {
    if (m === 'GET') return send(res, 200, getSettings(), requestId);
    if (m === 'POST') {
      const b = await readJson(req);
      const backend = b.backend === 'colab' ? 'colab' : 'local';
      const colabUrl = typeof b.colabUrl === 'string' ? b.colabUrl.trim() : undefined;
      if (colabUrl && !/^https?:\/\//i.test(colabUrl)) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'colabUrl harus diawali http:// atau https://');
      }
      return send(res, 200, setSettings({ backend, ...(colabUrl !== undefined ? { colabUrl } : {}) }), requestId);
    }
  }

  // Reindex Artefak Export
  if (m === 'POST' && pathname === '/admin/reindex') {
    loadIndex(true);
    invalidateRetrievalCache();
    return send(res, 200, { accepted: true, queuedCount: 0 }, requestId);
  }

  // Fallback Ingest PDF
  if (pathname.startsWith('/admin/documents')) {
    throw new HttpError(501, 'NOT_IMPLEMENTED', 'Ingest PDF ditangani oleh SISKA (fallback lokal).');
  }

  throw new HttpError(404, 'NOT_FOUND', 'Endpoint tidak ditemukan.');
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const requestId = String(req.headers['x-request-id'] || crypto.randomUUID()).slice(0, 128);
    try {
      await route(req, res, requestId);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.code, message: e.message }, requestId);
      console.error(JSON.stringify({ t: new Date().toISOString(), requestId, error: String(e && e.message || e) }));
      send(res, 500, { error: 'INTERNAL_ERROR', message: 'Terjadi kesalahan pada layanan AI.' }, requestId);
    }
  });
}
