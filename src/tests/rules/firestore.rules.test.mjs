/**
 * SISKA — Firestore Security Rules integration tests.
 * Jalankan melalui `npm run test:rules:firestore`.
 * Seluruh data adalah sintetis dan dibuat dengan Rules dinonaktifkan hanya untuk fixture.
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test, before, after, beforeEach } from 'node:test';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  orderBy,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-siska-firestore-rules';
const parseEmulatorHost = (value, fallbackPort) => {
  const [host = '127.0.0.1', rawPort = String(fallbackPort)] = (value || `127.0.0.1:${fallbackPort}`).split(':');
  const port = Number(rawPort);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Alamat emulator tidak valid: ${value}`);
  }
  return { host, port };
};
let env;
const now = () => new Date();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { ...parseEmulatorHost(process.env.FIRESTORE_EMULATOR_HOST, 8085), rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const t = now();
    const user = (uid, role) => ({
      uid,
      displayName: uid,
      email: `${uid}@siska.test`,
      role,
      createdAt: t,
      updatedAt: t,
    });

    await setDoc(doc(db, 'users/repA'), user('repA', 'reporter'));
    await setDoc(doc(db, 'users/repB'), user('repB', 'reporter'));
    await setDoc(doc(db, 'users/adm1'), user('adm1', 'admin'));
    await setDoc(doc(db, 'users/adm2'), user('adm2', 'admin'));
    // Profil reporter dengan token yang nanti memiliki claim admin.
    await setDoc(doc(db, 'users/collision'), user('collision', 'reporter'));
    // Profil reporter tanpa claim: menguji fallback yang sama dengan backend.
    await setDoc(doc(db, 'users/legacyRep'), user('legacyRep', 'reporter'));

    const report = (reporterId) => ({
      reporterId,
      category: 'kategori',
      description: 'isi laporan sintetis',
      status: 'submitted',
      createdAt: t,
      updatedAt: t,
    });
    await setDoc(doc(db, 'reports/r1'), report('repA'));
    await setDoc(doc(db, 'reports/r2'), report('repB'));
    await setDoc(doc(db, 'reports/rLegacy'), report('legacyRep'));

    await setDoc(doc(db, 'reports/r1/evidence/e1'), {
      storagePath: 'reports/r1/evidence/e1.pdf',
      originalName: 'bukti-sintetis.pdf',
      contentType: 'application/pdf',
      sizeBytes: 100,
      uploadedBy: 'repA',
      createdAt: t,
    });
    await setDoc(doc(db, 'reports/r1/statusHistory/h1'), {
      fromStatus: null,
      toStatus: 'submitted',
      actorUid: 'repA',
      createdAt: t,
    });

    const conv = (over = {}) => ({
      type: 'report_admin',
      reporterId: 'repA',
      assignedAdminId: null,
      reportId: 'r1',
      status: 'open',
      createdAt: t,
      updatedAt: t,
      ...over,
    });
    await setDoc(doc(db, 'conversations/c1'), conv({ assignedAdminId: 'adm1' }));
    await setDoc(doc(db, 'conversations/c2'), conv()); // belum ditugaskan
    await setDoc(doc(db, 'conversations/c3'), conv({ assignedAdminId: 'adm1', status: 'closed' }));
    // Field kanonis reporterId harus menang atas alias reporterUid.
    await setDoc(doc(db, 'conversations/c4'), conv({
      reporterId: 'repB',
      reporterUid: 'repA',
      assignedAdminId: 'adm1',
    }));
    // Field kanonis assignedAdminId harus menang atas alias adminUid.
    await setDoc(doc(db, 'conversations/c5'), conv({
      assignedAdminId: 'adm1',
      adminUid: 'adm2',
    }));
    // Claim admin tidak boleh berubah menjadi reporter melalui dokumen profil.
    await setDoc(doc(db, 'conversations/c6'), conv({
      reporterId: 'collision',
      assignedAdminId: 'adm2',
    }));
    // Dokumen legacy tanpa nama field kanonis tetap dapat dibaca sesuai alias.
    await setDoc(doc(db, 'conversations/c7'), {
      type: 'report_admin',
      reporterUid: 'repA',
      adminUid: null,
      reportId: null,
      status: 'open',
      createdAt: t,
      updatedAt: t,
    });

    await setDoc(doc(db, 'conversations/c1/messages/m1'), {
      senderUid: 'repA',
      body: 'pesan sintetis',
      createdAt: t,
    });

    await setDoc(doc(db, 'knowledgeDocuments/k1'), {
      title: 'Pedoman sintetis',
      status: 'indexed',
      createdAt: t,
    });
    await setDoc(doc(db, 'knowledgeChunks/ch1'), {
      documentId: 'k1',
      text: 'potongan sintetis',
      createdAt: t,
    });
    await setDoc(doc(db, 'auditEvents/a1'), {
      actorUid: 'adm1',
      action: 'report.status_changed',
      targetType: 'report',
      targetId: 'r1',
      occurredAt: t,
      requestId: 'req_synthetic_01',
    });
  });
});

const db = (uid, claims = {}) => env.authenticatedContext(uid, claims).firestore();
const rep = (uid) => db(uid, { role: 'reporter' });
const adm = (uid) => db(uid, { role: 'admin' });
const outsider = () => db('outsider');
const anon = () => env.unauthenticatedContext().firestore();

const validProfile = (uid, role = 'reporter') => ({
  uid,
  displayName: uid,
  email: `${uid}@siska.test`,
  role,
  createdAt: now(),
  updatedAt: now(),
});
const validReport = (reporterId) => ({
  reporterId,
  category: 'kategori',
  description: 'isi laporan sintetis',
  status: 'submitted',
  createdAt: now(),
  updatedAt: now(),
});

// AUTH / users

test('AUTH-01: pengguna dapat mengambil profil sendiri; akun lain tidak dapat mengambil profil tersebut', async () => {
  await assertSucceeds(getDoc(doc(rep('repA'), 'users/repA')));
  await assertFails(getDoc(doc(rep('repB'), 'users/repA')));
  await assertFails(getDoc(doc(outsider(), 'users/repA')));
});

test('AUTH-02: admin dapat mengambil satu profil berdasarkan UID, tetapi tidak dapat listing profil massal', async () => {
  await assertSucceeds(getDoc(doc(adm('adm1'), 'users/repA')));
  await assertFails(getDocs(collection(adm('adm1'), 'users')));
});

test('AUTH-03: akun tanpa role tetap hanya dapat mengambil profilnya sendiri', async () => {
  await assertSucceeds(getDoc(doc(outsider(), 'users/outsider')));
  await assertFails(getDoc(doc(outsider(), 'users/repA')));
});

test('AUTH-04: seluruh create/update/delete profil ditolak dari Client SDK', async () => {
  await assertFails(setDoc(doc(rep('repA'), 'users/new-user'), validProfile('new-user')));
  await assertFails(updateDoc(doc(rep('repA'), 'users/repA'), { displayName: 'Nama baru' }));
  await assertFails(updateDoc(doc(adm('adm1'), 'users/repA'), { role: 'admin' }));
  await assertFails(deleteDoc(doc(rep('repA'), 'users/repA')));
});

test('AUTH-05: claim admin tidak dapat memperoleh jalur reporter melalui profil Firestore', async () => {
  await assertFails(getDoc(doc(db('collision', { role: 'admin' }), 'conversations/c6')));
});

test('AUTH-06: reporter tanpa claim dapat memakai fallback profil reporter yang sah', async () => {
  await assertSucceeds(getDoc(doc(db('legacyRep'), 'reports/rLegacy')));
});

// REPORTS

test('REP-01: reporter dapat membaca laporan miliknya sendiri', async () => {
  await assertSucceeds(getDoc(doc(rep('repA'), 'reports/r1')));
  await assertSucceeds(getDoc(doc(db('legacyRep'), 'reports/rLegacy')));
});

test('REP-02: reporter lain, outsider, dan pengguna anonim tidak dapat membaca laporan', async () => {
  await assertFails(getDoc(doc(rep('repB'), 'reports/r1')));
  await assertFails(getDoc(doc(outsider(), 'reports/r1')));
  await assertFails(getDoc(doc(anon(), 'reports/r1')));
});

test('REP-03: query reporter dengan filter kepemilikan berhasil; query lintas pemilik/tanpa filter ditolak', async () => {
  await assertSucceeds(getDocs(query(collection(rep('repA'), 'reports'), where('reporterId', '==', 'repA'))));
  await assertFails(getDocs(query(collection(rep('repB'), 'reports'), where('reporterId', '==', 'repA'))));
  await assertFails(getDocs(collection(rep('repA'), 'reports')));
});

test('REP-04: admin dengan Custom Claim admin dapat membaca seluruh laporan sesuai kebijakan saat ini', async () => {
  await assertSucceeds(getDoc(doc(adm('adm1'), 'reports/r1')));
  await assertSucceeds(getDoc(doc(adm('adm2'), 'reports/r2')));
  await assertSucceeds(getDocs(collection(adm('adm1'), 'reports')));
});

test('REP-05: seluruh create/update/delete laporan ditolak dari Client SDK', async () => {
  await assertFails(setDoc(doc(rep('repA'), 'reports/new-report'), validReport('repA')));
  await assertFails(setDoc(doc(adm('adm1'), 'reports/admin-report'), validReport('adm1')));
  await assertFails(updateDoc(doc(rep('repA'), 'reports/r1'), { status: 'resolved' }));
  await assertFails(deleteDoc(doc(adm('adm1'), 'reports/r1')));
});

// EVIDENCE METADATA & STATUS HISTORY

test('FILE-01: metadata bukti dapat dibaca pemilik laporan dan admin, bukan reporter lain', async () => {
  await assertSucceeds(getDoc(doc(rep('repA'), 'reports/r1/evidence/e1')));
  await assertFails(getDoc(doc(rep('repB'), 'reports/r1/evidence/e1')));
  await assertSucceeds(getDoc(doc(adm('adm1'), 'reports/r1/evidence/e1')));
});

test('FILE-02: seluruh mutasi metadata bukti ditolak dari Client SDK', async () => {
  const evidence = doc(rep('repA'), 'reports/r1/evidence/e2');
  await assertFails(setDoc(evidence, { storagePath: 'x', uploadedBy: 'repA', createdAt: now() }));
  await assertFails(updateDoc(doc(rep('repA'), 'reports/r1/evidence/e1'), { originalName: 'changed.pdf' }));
  await assertFails(deleteDoc(doc(adm('adm1'), 'reports/r1/evidence/e1')));
});

test('REP-06: statusHistory hanya dapat dibaca pemilik/admin dan tidak dapat dimutasi client', async () => {
  await assertSucceeds(getDoc(doc(rep('repA'), 'reports/r1/statusHistory/h1')));
  await assertSucceeds(getDoc(doc(adm('adm1'), 'reports/r1/statusHistory/h1')));
  await assertFails(getDoc(doc(rep('repB'), 'reports/r1/statusHistory/h1')));
  await assertFails(setDoc(doc(rep('repA'), 'reports/r1/statusHistory/h2'), { toStatus: 'resolved' }));
  await assertFails(updateDoc(doc(adm('adm1'), 'reports/r1/statusHistory/h1'), { toStatus: 'resolved' }));
  await assertFails(deleteDoc(doc(adm('adm1'), 'reports/r1/statusHistory/h1')));
});

// CONVERSATIONS & MESSAGES

test('CHAT-01: reporter hanya dapat membaca percakapan miliknya', async () => {
  await assertSucceeds(getDoc(doc(rep('repA'), 'conversations/c1')));
  await assertFails(getDoc(doc(rep('repB'), 'conversations/c1')));
});

test('CHAT-02: admin yang ditugaskan dapat membaca; admin lain tidak', async () => {
  await assertSucceeds(getDoc(doc(adm('adm1'), 'conversations/c1')));
  await assertFails(getDoc(doc(adm('adm2'), 'conversations/c1')));
});

test('CHAT-03: semua admin dapat membaca percakapan belum ditugaskan untuk proses claim lewat API', async () => {
  await assertSucceeds(getDoc(doc(adm('adm1'), 'conversations/c2')));
  await assertSucceeds(getDoc(doc(adm('adm2'), 'conversations/c2')));
});

test('CHAT-04: alias reporterUid hanya dipakai untuk dokumen legacy tanpa reporterId', async () => {
  await assertSucceeds(getDoc(doc(rep('repA'), 'conversations/c7')));
  await assertFails(getDoc(doc(rep('repA'), 'conversations/c4')));
  await assertSucceeds(getDoc(doc(rep('repB'), 'conversations/c4')));
});

test('CHAT-05: assignedAdminId kanonis menang atas alias adminUid yang berkonflik', async () => {
  await assertSucceeds(getDoc(doc(adm('adm1'), 'conversations/c5')));
  await assertFails(getDoc(doc(adm('adm2'), 'conversations/c5')));
});

test('CHAT-06: akun tanpa role dan anonim tidak dapat membaca percakapan atau pesan', async () => {
  await assertFails(getDoc(doc(outsider(), 'conversations/c1')));
  await assertFails(getDoc(doc(anon(), 'conversations/c1')));
  await assertFails(getDoc(doc(outsider(), 'conversations/c1/messages/m1')));
});

test('CHAT-07: pesan hanya dapat dibaca reporter pemilik dan admin yang ditugaskan', async () => {
  await assertSucceeds(getDoc(doc(rep('repA'), 'conversations/c1/messages/m1')));
  await assertSucceeds(getDoc(doc(adm('adm1'), 'conversations/c1/messages/m1')));
  await assertFails(getDoc(doc(rep('repB'), 'conversations/c1/messages/m1')));
  await assertFails(getDocs(collection(adm('adm2'), 'conversations/c1/messages')));
});

test('CHAT-08: seluruh create/update/delete percakapan dan pesan ditolak dari Client SDK', async () => {
  const newConv = doc(rep('repA'), 'conversations/client-created');
  const newMessage = doc(rep('repA'), 'conversations/c1/messages/client-created');
  await assertFails(setDoc(newConv, {
    type: 'report_admin', reporterId: 'repA', assignedAdminId: null,
    reportId: 'r1', status: 'open', createdAt: now(), updatedAt: now(),
  }));
  await assertFails(updateDoc(doc(rep('repA'), 'conversations/c1'), { status: 'closed' }));
  await assertFails(deleteDoc(doc(adm('adm1'), 'conversations/c1')));
  await assertFails(setDoc(newMessage, { senderUid: 'repA', body: 'hello', createdAt: now() }));
  await assertFails(updateDoc(doc(rep('repA'), 'conversations/c1/messages/m1'), { body: 'changed' }));
  await assertFails(deleteDoc(doc(adm('adm1'), 'conversations/c1/messages/m1')));
});

// KNOWLEDGE BASE, AUDIT, DEFAULT DENY


test('CHAT-09: query realtime daftar percakapan reporter/admin sesuai field penugasan diizinkan', async () => {
  const reporterOwn = await getDocs(query(
    collection(rep('repA'), 'conversations'),
    where('reporterId', '==', 'repA'),
    orderBy('updatedAt', 'desc'),
  ));
  assert.ok(reporterOwn.docs.length >= 1);
  assert.ok(reporterOwn.docs.every((snap) => snap.data().reporterId === 'repA'));

  const adminAssigned = await getDocs(query(
    collection(adm('adm1'), 'conversations'),
    where('assignedAdminId', '==', 'adm1'),
    orderBy('updatedAt', 'desc'),
  ));
  assert.ok(adminAssigned.docs.length >= 1);
  assert.ok(adminAssigned.docs.every((snap) => snap.data().assignedAdminId === 'adm1'));

  const adminUnassigned = await getDocs(query(
    collection(adm('adm2'), 'conversations'),
    where('assignedAdminId', '==', null),
    orderBy('updatedAt', 'desc'),
  ));
  assert.ok(adminUnassigned.docs.length >= 1);
  assert.ok(adminUnassigned.docs.every((snap) => snap.data().assignedAdminId === null));
});

test('KB-01: knowledge base hanya dapat dibaca admin', async () => {
  await assertFails(getDoc(doc(rep('repA'), 'knowledgeDocuments/k1')));
  await assertFails(getDoc(doc(rep('repA'), 'knowledgeChunks/ch1')));
  await assertSucceeds(getDoc(doc(adm('adm1'), 'knowledgeDocuments/k1')));
  await assertSucceeds(getDoc(doc(adm('adm1'), 'knowledgeChunks/ch1')));
});

test('KB-02: seluruh mutasi knowledge base ditolak dari Client SDK, termasuk admin', async () => {
  await assertFails(setDoc(doc(adm('adm1'), 'knowledgeDocuments/k2'), { title: 'baru' }));
  await assertFails(updateDoc(doc(adm('adm1'), 'knowledgeDocuments/k1'), { status: 'failed' }));
  await assertFails(deleteDoc(doc(adm('adm1'), 'knowledgeChunks/ch1')));
});

test('PRIV-01: audit events hanya dapat dibaca admin dan tidak dapat dimutasi oleh client', async () => {
  await assertFails(getDoc(doc(rep('repA'), 'auditEvents/a1')));
  await assertSucceeds(getDoc(doc(adm('adm1'), 'auditEvents/a1')));
  await assertFails(setDoc(doc(adm('adm1'), 'auditEvents/fake'), { action: 'fake' }));
  await assertFails(updateDoc(doc(adm('adm1'), 'auditEvents/a1'), { action: 'changed' }));
  await assertFails(deleteDoc(doc(adm('adm1'), 'auditEvents/a1')));
});

test('DEFAULT-DENY: koleksi yang tidak dikenal ditolak untuk seluruh peran', async () => {
  await assertFails(getDoc(doc(adm('adm1'), 'unknownCollection/x')));
  await assertFails(setDoc(doc(adm('adm1'), 'unknownCollection/x'), { value: 1 }));
  await assertFails(getDoc(doc(rep('repA'), 'unknownCollection/x')));
});
