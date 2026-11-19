import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunkDocument, ocrFix } from '../src/rag/chunking.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'chunking-parity.json'), 'utf-8'));

test('chunker Node identik dengan chunker notebook RAG_v4 (hasil acuan dibuat oleh kode Python notebook)', () => {
  const { file, cite, content, expected } = fixture.pdf;
  const got = chunkDocument(content, { file, cite });
  assert.equal(got.length, expected.length);
  got.forEach((c, i) => assert.deepEqual(c, expected[i], `chunk ${i}`));
});

test('PDF unggahan: header berulang dibuang, nomor halaman jadi label, angka salah-OCR diperbaiki', () => {
  const { file, cite, content } = fixture.pdf;
  const got = chunkDocument(content, { file, cite });
  assert.equal(got.some((c) => /PERATURAN CONTOH NOMOR/.test(c.text)), false);
  assert.ok(got.some((c) => c.text.includes('Rp10.000.000')));
  assert.deepEqual([...new Set(got.map((c) => c.page))], ['1', '2', '3', '4', '6']);
});

test('ocrFix hanya mengubah huruf O di dalam angka', () => {
  assert.equal(ocrFix('Rp10.0OO.000'), 'Rp10.000.000');
  assert.equal(ocrFix('Rp 50.000.000'), 'Rp50.000.000');
  assert.equal(ocrFix('Pasal OK'), 'Pasal OK');
});

test('dokumen .md memakai judul markdown sebagai section dan tidak diperbaiki OCR', () => {
  const md = '# Judul\n\nPembuka.\n\n## Bagian A\nIsi A yang cukup panjang untuk dijadikan satu chunk sendiri di dalam pengujian ini, ya.\n\n## Bagian B\nTarif 1O0 tetap.';
  const got = chunkDocument(md, { file: 'uji.md', cite: 'Uji' });
  assert.deepEqual(got.map((c) => c.section), ['Judul', 'Bagian A', 'Bagian B']);
  assert.match(got[2].text, /1O0/);
  assert.equal(got[0].id, 'uji-0001');
  assert.match(got[1].ctext, /^\[Uji \| Bagian A\]\n/);
});
