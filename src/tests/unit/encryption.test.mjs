/**
 * SISKA — Automated Verification Suite for Backend Application-Layer Encryption (AES-256-GCM)
 * Menguji enkripsi & dekripsi field sensitif laporan (`encryptedData`) dan pesan chat (`body`),
 * kompatibilitas mundur terhadap data plaintext lama/seed, serta penolakan fail-closed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import { buildDataset, UID } from '../../../seed-data.mjs';
import {
  getMockDoc,
  resetMockFirebaseAdmin,
  seedMockDocs,
} from '../firebase-admin-mock.mjs';

import {
  decryptJson,
  decryptText,
  encryptJson,
  encryptText,
  isEncryptedPayload,
} from '@/server/crypto/encryption';
import { ApiError } from '@/server/errors/api-error';
import {
  createOrOpenConversation,
  getConversationById,
  listConversations,
  listMessages,
  sendMessage,
  updateConversationByAdmin,
} from '@/server/services/conversation.service';
import {
  createReport,
  getReportDetail,
  listReports,
  updateReportStatus,
} from '@/server/services/report.service';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
process.env.FIREBASE_PROJECT_ID = 'demo-siska';

const TEST_HEX_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const ALT_HEX_KEY =
  'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
const TEST_BASE64_KEY = Buffer.from(TEST_HEX_KEY, 'hex').toString('base64');

process.env.DATA_ENCRYPTION_KEY = TEST_HEX_KEY;

const CALLER_ADMIN_1 = {
  uid: UID.admin1,
  email: 'admin.a@siska.test',
  role: 'admin',
  claimVerified: true,
};

const CALLER_REPORTER_A = {
  uid: UID.reporterA,
  email: 'reporter.a@siska.test',
  role: 'reporter',
  claimVerified: true,
};

function withEncryptionKey(keyValue, fn) {
  return async () => {
    const previous = process.env.DATA_ENCRYPTION_KEY;
    if (keyValue === undefined) {
      delete process.env.DATA_ENCRYPTION_KEY;
    } else {
      process.env.DATA_ENCRYPTION_KEY = keyValue;
    }

    try {
      await fn();
    } finally {
      if (previous === undefined) {
        delete process.env.DATA_ENCRYPTION_KEY;
      } else {
        process.env.DATA_ENCRYPTION_KEY = previous;
      }
    }
  };
}

test('ENC-01: Helper AES-256-GCM menghasilkan iv unik, mendukung key hex/base64, dan mendeteksi manipulasi ciphertext/tag', async () => {
  const sample = 'Kronologi rahasia: kejadian di Gedung A lantai 2 🔒';
  const enc1 = encryptText(sample);
  const enc2 = encryptText(sample);

  assert.equal(isEncryptedPayload(enc1), true);
  assert.notEqual(enc1.iv, enc2.iv);
  assert.notEqual(enc1.ciphertext, enc2.ciphertext);
  assert.equal(enc1.iv.length, 24);
  assert.equal(enc1.tag.length, 32);
  assert.equal(decryptText(enc1), sample);
  assert.equal(decryptText(enc2), sample);

  // Format key base64 (32 byte) menghasilkan dekripsi kompatibel untuk ciphertext yang sama
  await withEncryptionKey(TEST_BASE64_KEY, () => {
    assert.equal(decryptText(enc1), sample);
    const jsonEnc = encryptJson({ description: 'Tes JSON', location: null });
    assert.deepEqual(decryptJson(jsonEnc), {
      description: 'Tes JSON',
      location: null,
    });
  })();

  // Tamper auth tag harus ditolak fail-closed
  const flippedTag = `${enc1.tag.slice(0, -1)}${enc1.tag.endsWith('0') ? '1' : '0'}`;
  assert.throws(
    () => decryptText({ ...enc1, tag: flippedTag }),
    (err) => err instanceof ApiError && err.status === 500,
  );

  // Kunci salah harus ditolak fail-closed
  await withEncryptionKey(ALT_HEX_KEY, () => {
    assert.throws(
      () => decryptText(enc1),
      (err) => err instanceof ApiError && err.status === 500,
    );
  })();

  // Kunci kosong atau panjang tidak valid harus fail-closed
  await withEncryptionKey(undefined, () => {
    assert.throws(
      () => encryptText(sample),
      (err) => err instanceof ApiError && err.status === 500,
    );
  })();

  await withEncryptionKey('terlalu-pendek', () => {
    assert.throws(
      () => encryptText(sample),
      (err) => err instanceof ApiError && err.status === 500,
    );
  })();
});

test('ENC-02: Laporan baru menyimpan encryptedData (description & location) di Firestore dan terdekripsi pada API baca/status', async () => {
  resetMockFirebaseAdmin();

  const incidentAt = new Date('2026-11-06T02:10:00+07:00');
  const created = await createReport(
    CALLER_REPORTER_A,
    {
      category: 'Perundungan',
      incidentAt,
      location: 'Ruang Rapat Lantai 3',
      description: 'Narasi kronologi sensitif pelapor yang harus terenkripsi.',
    },
    'req_enc_rep_1',
  );

  // Respons API kembali dalam bentuk plaintext terdekripsi untuk UI
  assert.equal(created.category, 'Perundungan');
  assert.equal(created.location, 'Ruang Rapat Lantai 3');
  assert.equal(
    created.description,
    'Narasi kronologi sensitif pelapor yang harus terenkripsi.',
  );

  // Dokumen mentah di Firestore harus sesuai struktur PM (tanpa description/location plaintext)
  const stored = getMockDoc(`reports/${created.id}`);
  assert.ok(stored);
  assert.deepEqual(Object.keys(stored).sort(), [
    'category',
    'createdAt',
    'encryptedData',
    'incidentAt',
    'reporterId',
    'resolvedAt',
    'status',
    'updatedAt',
  ]);
  assert.equal('description' in stored, false);
  assert.equal('location' in stored, false);
  assert.equal(isEncryptedPayload(stored.encryptedData), true);
  assert.deepEqual(Object.keys(stored.encryptedData).sort(), [
    'ciphertext',
    'iv',
    'tag',
  ]);

  const detail = await getReportDetail(CALLER_REPORTER_A, created.id);
  assert.equal(detail.location, 'Ruang Rapat Lantai 3');
  assert.equal(
    detail.description,
    'Narasi kronologi sensitif pelapor yang harus terenkripsi.',
  );

  const page = await listReports(CALLER_REPORTER_A, {
    cursor: null,
    limit: 20,
    status: null,
  });
  const listed = page.items.find((item) => item.id === created.id);
  assert.ok(listed);
  assert.equal(listed.location, 'Ruang Rapat Lantai 3');
  assert.equal(
    listed.description,
    'Narasi kronologi sensitif pelapor yang harus terenkripsi.',
  );

  const updated = await updateReportStatus(
    CALLER_ADMIN_1,
    created.id,
    { status: 'under_review', note: null },
    'req_enc_rep_status',
  );
  assert.equal(updated.status, 'under_review');
  assert.equal(updated.location, 'Ruang Rapat Lantai 3');
  assert.equal(
    updated.description,
    'Narasi kronologi sensitif pelapor yang harus terenkripsi.',
  );
});

test('ENC-03: Pesan chat baru dan conversations.lastMessage tersimpan terenkripsi {ciphertext, iv, tag} di Firestore dan terdekripsi lewat API', async () => {
  resetMockFirebaseAdmin();
  const ds = buildDataset();
  seedMockDocs(ds.docs, ds.files);

  const { conversation } = await createOrOpenConversation(CALLER_REPORTER_A, {
    reportId: 'seed_rpt_a1',
  });

  const longMessage = `${'Pesan rahasia pelapor kepada petugas SISKA. '.repeat(6)}END`;
  const sent = await sendMessage(CALLER_REPORTER_A, conversation.id, {
    body: longMessage,
  });

  // Respons API mengembalikan plaintext terdekripsi
  assert.equal(sent.body, longMessage);

  // Dokumen mentah di Firestore menyimpan body terenkripsi sesuai struktur PM
  const storedMsg = getMockDoc(
    `conversations/${conversation.id}/messages/${sent.id}`,
  );
  assert.ok(storedMsg);
  assert.deepEqual(Object.keys(storedMsg).sort(), [
    'attachmentPath',
    'body',
    'createdAt',
    'senderUid',
  ]);
  assert.equal(typeof storedMsg.body, 'object');
  assert.equal(isEncryptedPayload(storedMsg.body), true);
  assert.deepEqual(Object.keys(storedMsg.body).sort(), [
    'ciphertext',
    'iv',
    'tag',
  ]);

  // Dokumen induk conversations/{id}.lastMessage juga harus tersimpan terenkripsi (bukan plaintext)
  const storedConv = getMockDoc(`conversations/${conversation.id}`);
  assert.ok(storedConv);
  assert.equal(typeof storedConv.lastMessage, 'object');
  assert.equal(isEncryptedPayload(storedConv.lastMessage), true);
  assert.deepEqual(Object.keys(storedConv.lastMessage).sort(), [
    'ciphertext',
    'iv',
    'tag',
  ]);

  // Endpoint API percakapan (list, detail, admin update) mengembalikan lastMessage terdekripsi (maks 180 karakter)
  const expectedPreview = longMessage.slice(0, 180);
  const convList = await listConversations(CALLER_REPORTER_A);
  const convItem = convList.items.find((item) => item.id === conversation.id);
  assert.ok(convItem);
  assert.equal(convItem.lastMessage, expectedPreview);

  const convDetail = await getConversationById(CALLER_REPORTER_A, conversation.id);
  assert.equal(convDetail.lastMessage, expectedPreview);

  const convUpdated = await updateConversationByAdmin(
    CALLER_ADMIN_1,
    conversation.id,
    { assignedAdminId: CALLER_ADMIN_1.uid },
    'req_enc_conv_assign',
  );
  assert.equal(convUpdated.lastMessage, expectedPreview);

  const listed = await listMessages(CALLER_REPORTER_A, conversation.id, {
    cursor: null,
    limit: 50,
  });
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].body, longMessage);
});

test('ENC-04: Data lama/seed plaintext tetap terbaca (backward-compatible), sedangkan payload terenkripsi rusak gagal secara aman', async () => {
  resetMockFirebaseAdmin();
  const ds = buildDataset();
  seedMockDocs(ds.docs, ds.files);

  // Laporan seed plaintext tetap terbaca normal
  const legacyReport = await getReportDetail(CALLER_REPORTER_A, 'seed_rpt_a1');
  assert.match(legacyReport.description, /DATA UJI SINTETIS/);
  assert.equal(legacyReport.location, 'Grup komunitas daring (contoh)');

  // Pesan seed plaintext tetap terbaca normal, dan bisa bercampur dengan pesan terenkripsi baru
  await sendMessage(CALLER_REPORTER_A, 'seed_conv_a3', {
    body: 'Pesan baru terenkripsi setelah pesan lama.',
  });
  const legacyMessages = await listMessages(CALLER_REPORTER_A, 'seed_conv_a3', {
    cursor: null,
    limit: 50,
  });
  assert.ok(legacyMessages.items.length >= 2);
  assert.equal(typeof legacyMessages.items[0].body, 'string');
  assert.ok(legacyMessages.items[0].body.length > 0);
  assert.equal(
    legacyMessages.items[legacyMessages.items.length - 1].body,
    'Pesan baru terenkripsi setelah pesan lama.',
  );

  // Laporan dengan encryptedData korup harus gagal fail-closed saat dibaca
  const created = await createReport(
    CALLER_REPORTER_A,
    {
      category: 'Lainnya',
      incidentAt: null,
      location: null,
      description: 'Akan dirusak tag-nya.',
    },
    'req_enc_corrupt',
  );
  const storedReport = getMockDoc(`reports/${created.id}`);
  storedReport.encryptedData = {
    ...storedReport.encryptedData,
    tag: '0'.repeat(32),
  };
  seedMockDocs([{ path: `reports/${created.id}`, data: storedReport }]);

  await assert.rejects(
    () => getReportDetail(CALLER_REPORTER_A, created.id),
    (err) => err instanceof ApiError && err.status === 500,
  );

  // Pesan dengan body terenkripsi korup harus gagal fail-closed saat dibaca
  const lastMsg = legacyMessages.items[legacyMessages.items.length - 1];
  const storedCorruptMsg = getMockDoc(
    `conversations/seed_conv_a3/messages/${lastMsg.id}`,
  );
  storedCorruptMsg.body = {
    ...storedCorruptMsg.body,
    tag: 'f'.repeat(32),
  };
  seedMockDocs([
    {
      path: `conversations/seed_conv_a3/messages/${lastMsg.id}`,
      data: storedCorruptMsg,
    },
  ]);

  await assert.rejects(
    () =>
      listMessages(CALLER_REPORTER_A, 'seed_conv_a3', {
        cursor: null,
        limit: 50,
      }),
    (err) => err instanceof ApiError && err.status === 500,
  );

  // Percakapan dengan lastMessage terenkripsi korup harus gagal fail-closed saat dibaca
  const corruptConv = getMockDoc('conversations/seed_conv_a3');
  corruptConv.lastMessage = {
    ciphertext: 'abcd',
    iv: '0'.repeat(24),
    tag: 'f'.repeat(32),
  };
  seedMockDocs([{ path: 'conversations/seed_conv_a3', data: corruptConv }]);

  await assert.rejects(
    () => getConversationById(CALLER_REPORTER_A, 'seed_conv_a3'),
    (err) => err instanceof ApiError && err.status === 500,
  );
});

test('ENC-05: ConversationChat di live-pages mengambil percakapan dan pesan dari API backend (bukan data.body/data.lastMessage mentah Firestore)', () => {
  const livePagesSource = readFileSync(
    resolvePath(process.cwd(), 'src/components/live-pages.tsx'),
    'utf8',
  );
  assert.match(livePagesSource, /fetchConversations\(/);
  assert.match(livePagesSource, /fetchConversationMessages\(/);
  assert.doesNotMatch(livePagesSource, /data\.body\?\?/);
  assert.doesNotMatch(livePagesSource, /data\.lastMessage\s*===\s*"string"/);
});
