import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { makePdf } from '../../../seed-data.mjs';
import { extractAiPdfText } from '@/server/services/ai-pdf-extractor';
import {
  addRemoteAiRagDocument,
  deleteRemoteAiRagDocument,
  listRemoteAiRagDocuments,
  resetRemoteAiRagDocuments,
} from '@/server/contracts/ai-service.contract';
import { ApiError } from '@/server/errors/api-error';

test('extracts searchable PDF text per page, keeping line breaks and page separators', async () => {
  const bytes = makePdf([
    ['Panduan SISKA', 'Bagian: Kontak', 'Hubungi petugas pada 0811-222-333.'],
    ['Nomor darurat', 'Hubungi layanan 110.'],
  ]);

  const text = await extractAiPdfText(new Uint8Array(bytes), 'Panduan SISKA');

  const pages = text.split('\f');
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[0].split('\n'), ['Panduan SISKA', 'Bagian: Kontak', 'Hubungi petugas pada 0811-222-333.']);
  assert.deepEqual(pages[1].split('\n'), ['Nomor darurat', 'Hubungi layanan 110.']);
  assert.match(text, /0811-222-333/);
  assert.match(text, /110/);
});

test('rejects scanned PDFs that contain no extractable text', async () => {
  const bytes = makePdf([[]]);

  await assert.rejects(
    extractAiPdfText(new Uint8Array(bytes), 'PDF hasil scan'),
    (error) =>
      error instanceof ApiError &&
      error.code === 'UPLOAD_REJECTED' &&
      /OCR/.test(error.message),
  );
});

test('remote AI RAG document contract supports listing, adding (.md/.txt/.pdf), and deleting documents', async () => {
  const savedEnv = {
    url: process.env.AI_SERVICE_URL,
    enabled: process.env.AI_SERVICE_ENABLE_REMOTE,
    secret: process.env.AI_SERVICE_SHARED_SECRET,
  };
  const originalFetch = globalThis.fetch;
  const calls = [];

  process.env.AI_SERVICE_URL = 'http://ai-service.test';
  process.env.AI_SERVICE_ENABLE_REMOTE = 'true';
  process.env.AI_SERVICE_SHARED_SECRET = 'test-secret';

  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    const parsedBody = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url: String(url), method, body: parsedBody });

    if (method === 'GET' && String(url) === 'http://ai-service.test/admin/rag-docs') {
      return new Response(
        JSON.stringify({
          docs: [
            { file: 'kontak-bantuan.md', cite: 'Kontak Bantuan', chunkCount: 3, source: 'notebook' },
            { file: 'pedoman-baru.pdf', cite: 'Pedoman Baru', chunkCount: 5, source: 'web' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (method === 'POST' && String(url) === 'http://ai-service.test/admin/rag-docs') {
      return new Response(
        JSON.stringify({ ok: true, addedChunks: 4 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (method === 'DELETE' && String(url).startsWith('http://ai-service.test/admin/rag-docs?file=')) {
      return new Response(
        JSON.stringify({ ok: true, removedChunks: 4 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (method === 'DELETE' && String(url) === 'http://ai-service.test/admin/rag-docs?reset=1') {
      return new Response(
        JSON.stringify({ ok: true, restoredBaseDocs: 2, removedAddedDocs: 1 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    return new Response('{}', { status: 404 });
  };

  try {
    const listed = await listRemoteAiRagDocuments('req_list_rag');
    assert.equal(listed.length, 2);
    assert.equal(listed[1].file, 'pedoman-baru.pdf');
    assert.equal(listed[1].source, 'web');

    const addedMd = await addRemoteAiRagDocument(
      {
        file: 'panduan-admin.md',
        cite: 'Panduan Admin',
        content: '# Bagian 1\n\nIsi dokumen markdown.',
      },
      'req_add_md',
    );
    assert.equal(addedMd.ok, true);
    assert.equal(addedMd.addedChunks, 4);

    const addedTxt = await addRemoteAiRagDocument(
      {
        file: 'catatan-layanan.txt',
        cite: 'Catatan Layanan',
        content: 'Isi dokumen teks biasa hingga ratusan ribu karakter.',
      },
      'req_add_txt',
    );
    assert.equal(addedTxt.ok, true);

    const deleted = await deleteRemoteAiRagDocument('panduan-admin.md', 'req_del_md');
    assert.equal(deleted.ok, true);
    assert.equal(deleted.removedChunks, 4);
    const reset = await resetRemoteAiRagDocuments('req_reset');
    assert.equal(reset.restoredBaseDocs, 2);
    assert.equal(reset.removedAddedDocs, 1);
    assert.equal(calls.length, 5);
  } finally {
    globalThis.fetch = originalFetch;
    if (savedEnv.url === undefined) delete process.env.AI_SERVICE_URL;
    else process.env.AI_SERVICE_URL = savedEnv.url;
    if (savedEnv.enabled === undefined) delete process.env.AI_SERVICE_ENABLE_REMOTE;
    else process.env.AI_SERVICE_ENABLE_REMOTE = savedEnv.enabled;
    if (savedEnv.secret === undefined) delete process.env.AI_SERVICE_SHARED_SECRET;
    else process.env.AI_SERVICE_SHARED_SECRET = savedEnv.secret;
  }
});

test('LiveAdminDocumentsPage is wired to /api/v1/admin/ai-documents while preserving /api/v1/admin/knowledge-documents', () => {
  const livePagesSrc = readFileSync(
    resolvePath(process.cwd(), 'src/components/live-pages.tsx'),
    'utf-8',
  );
  const adminBlock = livePagesSrc.slice(
    livePagesSrc.indexOf('export function LiveAdminDocumentsPage'),
  );

  assert.match(adminBlock, /fetchAiRagDocumentsByAdmin/);
  assert.match(adminBlock, /uploadAiRagPdfByAdmin/);
  assert.match(adminBlock, /addAiRagDocumentByAdmin/);
  assert.match(adminBlock, /deleteAiRagDocumentByAdmin/);
  assert.match(adminBlock, /resetAiRagDocumentsByAdmin/);
  assert.match(adminBlock, /\.pdf,\.md,\.txt/);
});
