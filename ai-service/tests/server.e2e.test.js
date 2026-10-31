/**
 * Uji ujung-ke-ujung dengan Ollama palsu: memastikan alur nyata
 * (guard -> retrieval -> LLM -> verifikasi sitasi -> pembersihan -> kontrak) bekerja.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripCitations } from '../src/rag/cleanAnswer.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const exportDir = path.join(here, '..', 'data', 'export');
const runtimeExportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siska-ai-export-'));
for (const file of ['chunks.json', 'embeddings.f32', 'manifest.json', 'policy.json', 'prompts.json', 'router.json']) {
  fs.copyFileSync(path.join(exportDir, file), path.join(runtimeExportDir, file));
}
const manifest = JSON.parse(fs.readFileSync(path.join(exportDir, 'manifest.json'), 'utf-8'));
const chunks = JSON.parse(fs.readFileSync(path.join(exportDir, 'chunks.json'), 'utf-8'));
const buf = fs.readFileSync(path.join(exportDir, 'embeddings.f32'));
const emb = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const row = chunks.findIndex((c) => c.doc !== 'kontak-bantuan.md');
assert.notEqual(row, -1, 'Export harus memiliki dokumen RAG selain dokumen kontak.');
const vec = Array.from(emb.subarray(row * manifest.dim, (row + 1) * manifest.dim));
const targetChunk = chunks[row];
const ragQuestion = 'Apa isi pedoman pencegahan dan penanganan kekerasan seksual di perguruan tinggi?';

let llmReply = `${targetChunk.text.slice(0, 100)} [1]`;
let chatRequests = 0;
let lastSystemPrompt = '';
let fakeOllama;
let svc;
let base;
let originalExportDir;

function post(pathname, body, headers = {}) {
  return fetch(base + pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-service-authorization': 'test-secret', ...headers },
    body: JSON.stringify(body),
  });
}

before(async () => {
  originalExportDir = process.env.RAG_EXPORT_DIR;
  process.env.RAG_EXPORT_DIR = runtimeExportDir;
  fakeOllama = http.createServer((req, res) => {
    let b = '';
    req.on('data', (d) => (b += d));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'fake' }] }));
      if (req.url === '/api/embed') return res.end(JSON.stringify({ embeddings: [vec] }));
      if (req.url === '/api/chat') {
        chatRequests += 1;
        lastSystemPrompt = JSON.parse(b).messages.find((message) => message.role === 'system')?.content || '';
        return res.end(JSON.stringify({ message: { content: llmReply } }));
      }
      res.statusCode = 404; res.end('{}');
    });
  });
  await new Promise((r) => fakeOllama.listen(0, '127.0.0.1', r));
  process.env.OLLAMA_LOCAL_URL = `http://127.0.0.1:${fakeOllama.address().port}`;
  process.env.OLLAMA_BACKEND = 'local';
  process.env.AI_SERVICE_SHARED_SECRET = 'test-secret';
  const { createServer } = await import('../src/server.js');
  svc = createServer();
  await new Promise((r) => svc.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${svc.address().port}`;
});

after(async () => {
  await Promise.all([
    new Promise((resolve) => svc?.close(resolve)),
    new Promise((resolve) => fakeOllama?.close(resolve)),
  ]);
  if (originalExportDir === undefined) delete process.env.RAG_EXPORT_DIR;
  else process.env.RAG_EXPORT_DIR = originalExportDir;
  fs.rmSync(runtimeExportDir, { recursive: true, force: true });
});

test('jawaban RAG: penanda [n] hilang, sumber & grounded tetap ada, tanpa field internal', async () => {
  const r = await post('/chat', { message: ragQuestion, userId: 'u-e2e-1', conversationId: 'c1' });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(j.answer.length > 0);
  assert.doesNotMatch(j.answer, /\[\d+\]/);
  assert.equal(j.grounded, true);
  assert.ok(j.sources.length >= 1);
  assert.match(lastSystemPrompt, /maksimal 3 kalimat atau 3 butir singkat/i);
  assert.match(lastSystemPrompt, /catatan editorial\/pemeliharaan dokumen/i);
  assert.deepEqual(Object.keys(j).sort(), ['answer', 'escalationMessage', 'grounded', 'sources']);
});

test('pembersih jawaban AI menghapus placeholder sitasi [n]', () => {
  assert.equal(stripCitations('Halo, SISKA adalah platform informasi [n].'), 'Halo, SISKA adalah platform informasi.');
});

test('smalltalk: teks ramah tanpa label rute/backend/latensi', async () => {
  const j = await (await post('/chat', { message: 'halo', userId: 'u-e2e-2' })).json();
  assert.match(j.answer, /^Halo/);
  assert.equal(j.grounded, false);
  assert.equal(JSON.stringify(j).includes('smalltalk'), false);
  assert.equal(JSON.stringify(j).includes('latency'), false);
  assert.equal(JSON.stringify(j).includes('local'), false);
});

test('pertanyaan nomor darurat memberi kontak ringkas dan relevan langsung dari RAG', async () => {
  const before = chatRequests;
  const response = await post('/chat', {
    message: 'Aku butuh nomor darurat yang bisa dihubungi secepatnya.',
    userId: 'u-emergency-contacts',
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.grounded, true);
  assert.match(result.answer, /0811-2551-922/);
  assert.match(result.answer, /129/);
  assert.match(result.answer, /08111-129-129/);
  assert.match(result.answer, /110/);
  assert.ok(result.answer.length < 300, 'Jawaban kontak harus to the point.');
  assert.doesNotMatch(result.answer, /Dokumen ini|Perbarui dokumen|pltppks@|https?:\/\//i);
  assert.equal(result.sources.length, 1, 'Kontak tetap terlacak ke dokumen sumber.');
  assert.ok(result.sources.some((source) => source.documentId === 'kontak-bantuan.md'));
  assert.equal(chatRequests, before);
});

test('permintaan email kontak menyertakan email resmi tanpa menyertakan detail yang tidak diminta', async () => {
  const result = await (await post('/chat', {
    message: 'Apa email kontak PLT PPKS?',
    userId: 'u-contact-email',
  })).json();
  assert.match(result.answer, /pltppks@uin-suka\.ac\.id/);
  assert.doesNotMatch(result.answer, /Website:|Perbarui dokumen|anonimitas/i);
});

test('jawaban tanpa penanda sitasi diblokir guard (tidak dikirim mentah)', async () => {
  llmReply = targetChunk.text.slice(0, 100);
  const j = await (await post('/chat', { message: ragQuestion, userId: 'u-e2e-3' })).json();
  assert.equal(j.grounded, false);
  assert.notEqual(j.answer, llmReply);
  llmReply = `${targetChunk.text.slice(0, 100)} [1]`;
});

test('autentikasi: tanpa/ salah secret ditolak; /health terbuka tanpa membocorkan env', async () => {
  assert.equal((await fetch(base + '/chat', { method: 'POST', body: '{"message":"halo"}' })).status, 401);
  assert.equal((await post('/chat', { message: 'halo' }, { 'x-service-authorization': 'salah' })).status, 401);
  const h = await (await fetch(base + '/health')).json();
  assert.equal(h.status, 'ok');
  assert.equal(JSON.stringify(h).includes('test-secret'), false);
});

test('validasi: message kosong -> 400; body bukan JSON -> 400', async () => {
  assert.equal((await post('/chat', { message: '   ' })).status, 400);
  const r = await fetch(base + '/chat', { method: 'POST', headers: { 'x-service-authorization': 'test-secret' }, body: 'bukan json' });
  assert.equal(r.status, 400);
});

test('Ollama mati -> 503 agar SISKA memakai fallback aman (REL-01)', async () => {
  const saved = process.env.OLLAMA_LOCAL_URL;
  process.env.OLLAMA_LOCAL_URL = 'http://127.0.0.1:1';
  const r = await post('/chat', { message: 'apa itu siska', userId: 'u-e2e-4' });
  process.env.OLLAMA_LOCAL_URL = saved;
  assert.equal(r.status, 503);
});

test('admin dapat menambah dan menghapus dokumen web tanpa mengubah dokumen export awal', async () => {
  const file = 'dokumen-uji-admin.txt';
  const added = await post('/admin/rag-docs', {
    file,
    cite: 'Dokumen uji admin',
    content: '# Prosedur tambahan\n\nInformasi layanan lokal yang sudah diverifikasi.',
  });
  assert.equal(added.status, 200);
  assert.equal((await added.json()).addedChunks, 1);

  const docs = await (await fetch(base + '/admin/rag-docs', {
    headers: { 'x-service-authorization': 'test-secret' },
  })).json();
  assert.equal(docs.docs.find((doc) => doc.file === file)?.source, 'web');

  const duplicate = await post('/admin/rag-docs', {
    file,
    cite: 'Dokumen duplikat',
    content: 'Isi lain.',
  });
  assert.equal(duplicate.status, 409);

  const protectedSource = await fetch(
    `${base}/admin/rag-docs?file=${encodeURIComponent(targetChunk.doc)}`,
    { method: 'DELETE', headers: { 'x-service-authorization': 'test-secret' } },
  );
  assert.equal(protectedSource.status, 403);

  const removed = await fetch(
    `${base}/admin/rag-docs?file=${encodeURIComponent(file)}`,
    { method: 'DELETE', headers: { 'x-service-authorization': 'test-secret' } },
  );
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).removedChunks, 1);
});

test('AI service menerima dokumen PDF setelah teksnya diekstrak oleh backend SISKA', async () => {
  const file = 'panduan-layanan-uji.pdf';
  const added = await post('/admin/rag-docs', {
    file,
    cite: 'Panduan Layanan Uji',
    content: '# Halaman 1\n\nNomor layanan uji adalah 12345.',
  });
  assert.equal(added.status, 200);

  const docs = await (await fetch(base + '/admin/rag-docs', {
    headers: { 'x-service-authorization': 'test-secret' },
  })).json();
  assert.equal(docs.docs.find((doc) => doc.file === file)?.source, 'web');

  const removed = await fetch(
    `${base}/admin/rag-docs?file=${encodeURIComponent(file)}`,
    { method: 'DELETE', headers: { 'x-service-authorization': 'test-secret' } },
  );
  assert.equal(removed.status, 200);
});
