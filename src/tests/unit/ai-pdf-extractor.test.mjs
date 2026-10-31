import test from 'node:test';
import assert from 'node:assert/strict';
import { makePdf } from '../../../seed-data.mjs';
import { extractAiPdfText } from '@/server/services/ai-pdf-extractor';
import { ApiError } from '@/server/errors/api-error';

test('extracts searchable PDF text while preserving page headings', async () => {
  const bytes = makePdf([
    ['Panduan SISKA', 'Bagian: Kontak', 'Hubungi petugas pada 0811-222-333.'],
    ['Nomor darurat', 'Hubungi layanan 110.'],
  ]);

  const text = await extractAiPdfText(new Uint8Array(bytes), 'Panduan SISKA');

  assert.match(text, /## Halaman 1/);
  assert.match(text, /## Halaman 2/);
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
