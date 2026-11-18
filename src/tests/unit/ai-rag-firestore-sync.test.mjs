import test from 'node:test';
import assert from 'node:assert/strict';
import { makePdf, UID } from '../../../seed-data.mjs';
import {
  resetMockFirebaseAdmin,
  getMockDoc,
  getMockStorageObject,
  listMockCollectionDocs,
} from '../firebase-admin-mock.mjs';
import { ApiError } from '@/server/errors/api-error';
import {
  registerAiRagPdfInKnowledgeBase,
  removeAiRagDocumentFromKnowledgeBase,
} from '@/server/services/knowledge.service';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
process.env.FIREBASE_PROJECT_ID = 'demo-siska';
process.env.FIREBASE_STORAGE_BUCKET = 'demo-siska.appspot.com';

const ADMIN = { uid: UID.admin1, email: 'admin.a@siska.test', role: 'admin', claimVerified: true };
const REPORTER = { uid: UID.reporterA, email: 'reporter.a@siska.test', role: 'reporter', claimVerified: true };

test('PDF dari Dokumen SISKA AI tercatat di knowledgeDocuments dan berkasnya disimpan', async () => {
  resetMockFirebaseAdmin();
  const bytes = new Uint8Array(makePdf([['Bagian: Profil', 'Isi profil SISKA AI.']]));

  const doc = await registerAiRagPdfInKnowledgeBase({
    caller: ADMIN,
    file: 'Profil-SISKA-AI.pdf',
    title: 'Profil SISKA AI',
    bytes,
    chunkCount: 5,
  });

  const stored = getMockDoc(`knowledgeDocuments/${doc.id}`);
  assert.ok(stored);
  assert.equal(stored.title, 'Profil SISKA AI');
  assert.equal(stored.status, 'indexed');
  assert.equal(stored.chunkCount, 5);
  assert.equal(stored.errorCode, null);
  assert.equal(stored.sourceUrl, null);
  assert.equal(stored.version, 1);
  assert.equal(stored.uploadedBy, UID.admin1);
  assert.equal(stored.ragFile, 'Profil-SISKA-AI.pdf');
  assert.equal(stored.storagePath, `knowledge-base/${doc.id}/v1.pdf`);
  assert.match(stored.sha256, /^[0-9a-f]{64}$/);
  assert.ok(getMockStorageObject(stored.storagePath));
});

test('mengunggah ulang berkas yang sama tidak menggandakan catatan', async () => {
  resetMockFirebaseAdmin();
  const bytes = new Uint8Array(makePdf([['Isi.']]));
  const params = { caller: ADMIN, file: 'a.pdf', title: 'A', bytes, chunkCount: 1 };

  const first = await registerAiRagPdfInKnowledgeBase(params);
  const second = await registerAiRagPdfInKnowledgeBase(params);

  assert.notEqual(first.id, second.id);
  assert.equal(listMockCollectionDocs('knowledgeDocuments').length, 1);
  assert.equal(getMockStorageObject(`knowledge-base/${first.id}/v1.pdf`), null);
  assert.ok(getMockStorageObject(`knowledge-base/${second.id}/v1.pdf`));
});

test('menghapus dokumen AI membersihkan catatan Firestore, chunk, dan berkas PDF', async () => {
  resetMockFirebaseAdmin();
  const bytes = new Uint8Array(makePdf([['Isi.']]));
  const doc = await registerAiRagPdfInKnowledgeBase({
    caller: ADMIN, file: 'hapus.pdf', title: 'Hapus', bytes, chunkCount: 1,
  });

  assert.equal(await removeAiRagDocumentFromKnowledgeBase('hapus.pdf'), 1);
  assert.equal(getMockDoc(`knowledgeDocuments/${doc.id}`), null);
  assert.equal(getMockStorageObject(`knowledge-base/${doc.id}/v1.pdf`), null);
  assert.equal(await removeAiRagDocumentFromKnowledgeBase('tidak-ada.pdf'), 0);
});

test('hanya admin terverifikasi yang boleh mencatat dokumen', async () => {
  resetMockFirebaseAdmin();
  await assert.rejects(
    registerAiRagPdfInKnowledgeBase({
      caller: REPORTER, file: 'x.pdf', title: 'X',
      bytes: new Uint8Array(makePdf([['Isi.']])), chunkCount: 1,
    }),
    (err) => err instanceof ApiError && err.status === 403,
  );
});
