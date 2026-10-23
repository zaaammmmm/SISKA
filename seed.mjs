#!/usr/bin/env node
// SISKA — Firebase seed runner (Auth + Firestore + Storage).
//
// Pemakaian:
//   node seed.mjs --dry-run                 validasi + ringkasan, tanpa menyentuh Firebase
//   node seed.mjs --emulator                seed ke Emulator Suite (host default sesuai firebase.json.example)
//   node seed.mjs --emulator --reset        hapus data seed lama lalu seed ulang
//   node seed.mjs --emulator --reset-only   hanya hapus data seed
//   Opsi: --with-adversarial  fixture XSS + prompt injection (CHAT-03, AI-03)
//         --only=auth,firestore,storage   seed sebagian layanan saja (default: semuanya)
//         --no-storage        sama dengan mengecualikan storage
//         --out=seed-dump.json  tulis dump JSON (tanpa password/bytes) saat --dry-run
//         --project=<id>      project ID (default emulator: demo-siska)
//   Project nyata (dev/staging, JANGAN produksi):
//         --allow-remote --confirm-project=<id>  dan env SEED_PASSWORD (>= 12 karakter)

import net from 'node:net';
import { writeFileSync } from 'node:fs';
import { buildDataset, validateDataset, DEMO_PASSWORD, kindOfPath } from './seed-data.mjs';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const die = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };

const withAdversarial = flag('with-adversarial');
const only = opt('only')?.split(',').map((x) => x.trim()).filter(Boolean);
if (only?.some((x) => !['auth', 'firestore', 'storage'].includes(x))) die('--only hanya menerima: auth, firestore, storage');
const svc = {
  auth: !only || only.includes('auth'),
  firestore: !only || only.includes('firestore'),
  storage: (!only || only.includes('storage')) && !flag('no-storage'),
};

// ── 1. Bangun + validasi dataset (selalu) ──────────────────────────────
const dataset = buildDataset({ withAdversarial });
const problems = validateDataset(dataset);
if (problems.length) {
  console.error('✖ Validasi dataset gagal:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}

const counts = {};
for (const { path } of dataset.docs) counts[kindOfPath(path)] = (counts[kindOfPath(path)] ?? 0) + 1;
const summary = () => {
  console.log('Dataset lolos validasi integritas (ERD, SRS §7, rules, API spec):');
  console.log(`  Auth users   : ${dataset.authUsers.length}`);
  for (const [k, n] of Object.entries(counts)) console.log(`  ${k.padEnd(18)}: ${n}`);
  console.log(`  Storage files: ${dataset.files.length}`);
};

if (flag('dry-run')) {
  summary();
  const out = opt('out');
  if (out) {
    writeFileSync(out, JSON.stringify({
      authUsers: dataset.authUsers.map(({ uid, email, displayName, claims }) => ({ uid, email, displayName, claims })),
      docs: dataset.docs,
      files: dataset.files.map(({ path, contentType, bytes }) => ({ path, contentType, sizeBytes: bytes.length })),
    }, null, 2));
    console.log(`\nDump JSON ditulis ke ${out}`);
  }
  process.exit(0);
}

// ── 2. Tentukan target & pengaman ──────────────────────────────────────
if (flag('emulator')) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
  if (svc.storage) process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199';
}
const fsHost = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const stHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;

// Campuran emulator + layanan nyata berbahaya (mis. Auth nyata + Firestore emulator) → tolak.
const needed = [['Firestore', svc.firestore, fsHost], ['Auth', svc.auth, authHost], ['Storage', svc.storage, stHost]].filter(([, on]) => on);
const isEmulator = needed.length > 0 && needed.every(([, , h]) => h);
if (!isEmulator && needed.some(([, , h]) => h)) {
  die(`Konfigurasi emulator tidak lengkap: ${needed.map(([n]) => n).join(', ')} harus semuanya emulator (atau tidak satu pun). Gunakan --emulator, atau batasi dengan --only / --no-storage.`);
}
if (!needed.length) die('Tidak ada layanan yang dipilih untuk di-seed.');

let projectId = opt('project') ?? process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID;
let password = process.env.SEED_PASSWORD;
if (isEmulator) {
  projectId ??= 'demo-siska';
  password ??= DEMO_PASSWORD;
} else {
  if (!flag('allow-remote')) die('Target bukan emulator. Jalankan dengan --emulator, atau (khusus dev/staging) --allow-remote --confirm-project=<id>.');
  if (!projectId) die('Project ID wajib diberikan (--project=<id>) untuk target nyata.');
  if (opt('confirm-project') !== projectId) die('--confirm-project harus sama persis dengan project ID.');
  if (/prod/i.test(projectId)) die('Project ID mengandung "prod": seed data uji tidak boleh dijalankan ke produksi.');
  if (!password || password.length < 12) die('Set env SEED_PASSWORD (>= 12 karakter) untuk akun uji di project nyata.');
}

const tcpOpen = (hostPort) => new Promise((resolve) => {
  const [host, port] = hostPort.split(':');
  const s = net.connect({ host, port: Number(port), timeout: 2000 });
  s.once('connect', () => { s.destroy(); resolve(true); });
  s.once('error', () => resolve(false));
  s.once('timeout', () => { s.destroy(); resolve(false); });
});
if (isEmulator) {
  for (const [name, , hp] of needed) {
    if (!(await tcpOpen(hp))) die(`Emulator ${name} tidak terjangkau di ${hp}. Jalankan: firebase emulators:start --project ${projectId}`);
  }
}

// ── 3. Firebase Admin ──────────────────────────────────────────────────
const { initializeApp } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore } = await import('firebase-admin/firestore');
const { getStorage } = await import('firebase-admin/storage');

const storageBucket = process.env.SEED_STORAGE_BUCKET ?? `${projectId}.appspot.com`;
initializeApp({ projectId, storageBucket });
const auth = svc.auth ? getAuth() : null;
const db = svc.firestore ? getFirestore() : null;
const bucket = svc.storage ? getStorage().bucket() : null;

console.log(`Target : ${isEmulator ? 'Emulator Suite' : 'PROJECT NYATA'} • project=${projectId} • layanan=${needed.map(([n]) => n).join('+')}${bucket ? ` • bucket=${storageBucket}` : ''}`);

// ── 4. Reset (hanya objek dengan ID seed_*) ────────────────────────────
async function resetSeed() {
  const full = buildDataset({ withAdversarial: true }); // semua ID yang mungkin pernah di-seed
  const topLevel = [...new Set(full.docs.map((d) => d.path.split('/').slice(0, 2).join('/')))];
  if (db) for (const p of topLevel) await db.recursiveDelete(db.doc(p));
  const res = auth ? await auth.deleteUsers(full.authUsers.map((u) => u.uid)) : null;
  if (bucket) for (const f of full.files) await bucket.file(f.path).delete({ ignoreNotFound: true });
  console.log(`Reset  : ${db ? topLevel.length : 0} dokumen induk (+subkoleksi), ${res?.successCount ?? 0} akun Auth, ${bucket ? full.files.length : 0} objek Storage dibersihkan`);
}
if (flag('reset') || flag('reset-only')) await resetSeed();
if (flag('reset-only')) process.exit(0);

// ── 5. Auth: akun + custom claims tepercaya ────────────────────────────
if (auth) for (const u of dataset.authUsers) {
  const props = { email: u.email, password, displayName: u.displayName, emailVerified: true };
  try { await auth.getUser(u.uid); await auth.updateUser(u.uid, props); }
  catch (e) { if (e.code !== 'auth/user-not-found') throw e; await auth.createUser({ uid: u.uid, ...props }); }
  await auth.setCustomUserClaims(u.uid, u.claims); // null = tanpa claim role
}
if (auth) console.log(`Auth   : ${dataset.authUsers.length} akun (claim role ditetapkan via Admin SDK)`);

// ── 6. Firestore (idempoten: ID deterministik + set) ───────────────────
if (db) {
  let failed = 0;
  const writer = db.bulkWriter();
  writer.onWriteError((err) => { failed++; console.error(`  ✖ ${err.documentRef.path}: ${err.message}`); return false; });
  for (const { path, data } of dataset.docs) writer.set(db.doc(path), data);
  await writer.close();
  if (failed) die(`${failed} penulisan Firestore gagal.`);
  console.log(`Firestore: ${dataset.docs.length} dokumen ditulis`);
}

// ── 7. Storage: berkas placeholder privat ──────────────────────────────
if (bucket) {
  for (const f of dataset.files) {
    await bucket.file(f.path).save(f.bytes, { contentType: f.contentType, resumable: false, metadata: { cacheControl: 'private, max-age=0' } });
  }
  console.log(`Storage: ${dataset.files.length} objek diunggah (privat, tanpa URL publik)`);
}

console.log('\n✔ Seed selesai.\n');
summary();
if (isEmulator && auth) {
  console.log(`\nAkun uji (password: ${password}) — hanya untuk emulator:`);
  for (const u of dataset.authUsers) console.log(`  ${u.email.padEnd(24)} ${(u.claims?.role ?? '(tanpa role)').padEnd(12)} uid=${u.uid}`);
}
process.exit(0);
