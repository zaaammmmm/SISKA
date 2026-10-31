import test from 'node:test';
import assert from 'node:assert/strict';
import { stripCitationMarkers, formatAiReply } from '@/lib/ai-reply';

test('AI-REPLY: penanda sumber [n] tidak tampil ke pengguna', () => {
  assert.equal(stripCitationMarkers('Halo siska adalah [n]'), 'Halo siska adalah');
  assert.equal(stripCitationMarkers('Halo siska adalah [1]'), 'Halo siska adalah');
  assert.equal(stripCitationMarkers('SISKA adalah platform pengaduan[1]. Ada layanan chat [2].'), 'SISKA adalah platform pengaduan. Ada layanan chat.');
  assert.equal(stripCitationMarkers('Fakta [1][2] dan [1, 3].'), 'Fakta dan.');
});

test('AI-REPLY: angka, kurung biasa, dan baris baru tidak rusak', () => {
  assert.equal(stripCitationMarkers('Hubungi 0811-2551-922 [1]\n- SAPA 129 [2]'), 'Hubungi 0811-2551-922\n- SAPA 129');
  assert.equal(stripCitationMarkers('Pasal 5 ayat (2)'), 'Pasal 5 ayat (2)');
});

test('AI-REPLY: formatAiReply menambahkan pesan eskalasi sebagai paragraf terpisah', () => {
  assert.equal(formatAiReply({ answer: 'Jawaban [1].', escalationMessage: null }), 'Jawaban.');
  assert.equal(formatAiReply({ answer: 'Ini mendesak.', escalationMessage: 'Hubungi petugas.' }), 'Ini mendesak.\n\nHubungi petugas.');
});
