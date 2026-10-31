import test from 'node:test';
import assert from 'node:assert/strict';
import { stripCitations } from '../src/rag/cleanAnswer.js';
import { toContractResponse } from '../src/contract.js';

test('menghapus penanda [n] tunggal, ganda, dan rentang', () => {
  assert.equal(stripCitations('SISKA adalah platform pengaduan[1].'), 'SISKA adalah platform pengaduan.');
  assert.equal(stripCitations('Halo siska adalah [1]'), 'Halo siska adalah');
  assert.equal(stripCitations('Ini fakta [1][2] dan itu [1, 2] serta [3-4].'), 'Ini fakta dan itu serta.');
  assert.equal(stripCitations('Kalimat satu [1]. Kalimat dua [2].'), 'Kalimat satu. Kalimat dua.');
});

test('menjaga baris baru dan daftar, serta angka asli tetap utuh', () => {
  const t = 'Kontak:\n- PLT PPKS: 0811-2551-922 [1]\n- SAPA: 129 [2]';
  assert.equal(stripCitations(t), 'Kontak:\n- PLT PPKS: 0811-2551-922\n- SAPA: 129');
  assert.equal(stripCitations('Pasal 5 ayat (2) berlaku [1].'), 'Pasal 5 ayat (2) berlaku.');
});

test('membuang kurung kosong sisa penghapusan', () => {
  assert.equal(stripCitations('Berlaku (sumber: [1]).'), 'Berlaku.');
});

test('teks kosong/undefined aman', () => {
  assert.equal(stripCitations(''), '');
  assert.equal(stripCitations(undefined), '');
});

test('kontrak: tidak membocorkan route/backend/latency; grounded hanya bila ada sumber', () => {
  const ok = toContractResponse({
    route: 'answered', answer: 'x', backend: 'local', latency: 45, problems: [],
    sources: [{ doc: 'a.md', cite: 'A', page: '', id: 'a-1' }, { doc: 'a.md', cite: 'A', page: '', id: 'a-2' }, { doc: 'b.pdf', cite: 'B', page: '12', id: 'b-1' }],
  });
  assert.deepEqual(Object.keys(ok).sort(), ['answer', 'escalationMessage', 'grounded', 'sources']);
  assert.equal(ok.grounded, true);
  assert.deepEqual(ok.sources, [
    { documentId: 'a.md', title: 'A', page: 0 },
    { documentId: 'b.pdf', title: 'B', page: 12 },
  ]);
  assert.equal(toContractResponse({ route: 'smalltalk', answer: 'halo', sources: [] }).grounded, false);
  assert.equal(toContractResponse({ route: 'answered', answer: 'x', sources: [] }).grounded, false);
});
