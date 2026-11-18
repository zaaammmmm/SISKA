import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { makePdf } from '../../../seed-data.mjs';
import { extractAndChunkPdfBytes } from '@/server/services/knowledge.service';

// PDF dengan content stream terkompresi (FlateDecode), seperti PDF dari Word/Google Docs.
function makeFlatePdf(lines) {
  const stream = Buffer.from(
    `BT /F1 12 Tf 14 TL 56 780 Td\n${lines.map((l) => `(${l}) Tj T*`).join('\n')}\nET`,
    'latin1',
  );
  const z = deflateSync(stream);
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',
  ];
  const offs = [];
  let out = Buffer.from('%PDF-1.4\n', 'latin1');
  objs.forEach((o, i) => {
    offs[i + 1] = out.length;
    out = Buffer.concat([out, Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, 'latin1')]);
  });
  offs[5] = out.length;
  out = Buffer.concat([
    out,
    Buffer.from(`5 0 obj\n<< /Length ${z.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'),
    z,
    Buffer.from('\nendstream\nendobj\n', 'latin1'),
  ]);
  const xrefPos = out.length;
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (let n = 1; n <= 5; n += 1) xref += `${String(offs[n]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return new Uint8Array(Buffer.concat([out, Buffer.from(xref, 'latin1')]));
}

test('KB: PDF terkompresi (FlateDecode) berhasil diekstrak', async () => {
  const chunks = await extractAndChunkPdfBytes(
    makeFlatePdf(['Panduan SISKA', 'Bagian: Kontak', 'Hubungi petugas pada 0811-222-333.']),
    'Panduan SISKA',
  );
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].page, 1);
  assert.equal(chunks[0].section, 'Kontak');
  assert.match(chunks[0].text, /0811-222-333/);
});

test('KB: PDF tanpa kompresi tetap berhasil diekstrak', async () => {
  const chunks = await extractAndChunkPdfBytes(
    new Uint8Array(makePdf([['Bagian: Prosedur', 'Langkah pertama.']])),
    'Prosedur',
  );
  assert.equal(chunks[0].section, 'Prosedur');
});

test('KB: PDF tanpa teks ditolak dengan PDF_NO_TEXT', async () => {
  await assert.rejects(
    extractAndChunkPdfBytes(new Uint8Array(makePdf([[]])), 'Scan'),
    /PDF_NO_TEXT/,
  );
});

test('KB: berkas rusak ditolak dengan PDF_PARSE_FAILED', async () => {
  await assert.rejects(
    extractAndChunkPdfBytes(
      new Uint8Array(Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog', 'latin1')),
      'Rusak',
    ),
    /PDF_PARSE_FAILED/,
  );
});
