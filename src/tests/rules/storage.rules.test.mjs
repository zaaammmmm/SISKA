/**
 * SISKA — Firebase Storage Security Rules tests.
 * Kebijakan: Client SDK tidak memiliki akses langsung. Upload/download resmi
 * melalui API backend (Admin SDK) atau Signed URL yang diterbitkan backend.
 */
import { readFileSync } from 'node:fs';
import { test, before, after, beforeEach } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  deleteObject,
  getBytes,
  ref,
  uploadBytes,
} from 'firebase/storage';

const PROJECT_ID = 'demo-siska-storage-rules';
const parseEmulatorHost = (value, fallbackPort) => {
  const [host = '127.0.0.1', rawPort = String(fallbackPort)] = (value || `127.0.0.1:${fallbackPort}`).split(':');
  const port = Number(rawPort);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Alamat emulator tidak valid: ${value}`);
  }
  return { host, port };
};
let env;
const bytes = (length = 256) => new Uint8Array(length).fill(7);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: { ...parseEmulatorHost(process.env.FIREBASE_STORAGE_EMULATOR_HOST, 9199), rules: readFileSync('storage.rules', 'utf8') },
  });
});

after(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearStorage();
  // Fixture objek dibuat oleh konteks rules-disabled, mewakili objek yang
  // disimpan backend/Admin SDK. Client tetap tidak boleh mengaksesnya langsung.
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), 'reports/r1/evidence/existing.pdf'), bytes(), {
      contentType: 'application/pdf',
    });
    await uploadBytes(ref(ctx.storage(), 'knowledge-base/k1/v1.pdf'), bytes(), {
      contentType: 'application/pdf',
    });
  });
});

const storage = (uid, claims = {}) => env.authenticatedContext(uid, claims).storage();
const rep = (uid) => storage(uid, { role: 'reporter' });
const adm = (uid) => storage(uid, { role: 'admin' });
const outsider = () => storage('outsider');
const anon = () => env.unauthenticatedContext().storage();
const evidence = (st, reportId, fileName = 'existing.pdf') =>
  ref(st, `reports/${reportId}/evidence/${fileName}`);
const knowledge = (st, fileName = 'v1.pdf') => ref(st, `knowledge-base/k1/${fileName}`);

// Evidence object: direct client read denied, including owner and admin.
test('STO-01: reporter pemilik tidak dapat membaca objek bukti melalui Storage Client SDK', async () => {
  await assertFails(getBytes(evidence(rep('repA'), 'r1')));
});

test('STO-02: reporter lain tidak dapat membaca objek bukti lintas laporan', async () => {
  await assertFails(getBytes(evidence(rep('repB'), 'r1')));
});

test('STO-03: admin tidak dapat membaca objek bukti langsung melalui Storage Client SDK', async () => {
  await assertFails(getBytes(evidence(adm('adm1'), 'r1')));
});

test('STO-04: akun tanpa role dan pengguna anonim tidak dapat membaca objek bukti', async () => {
  await assertFails(getBytes(evidence(outsider(), 'r1')));
  await assertFails(getBytes(evidence(anon(), 'r1')));
});

// Evidence object: all direct client writes denied. The API performs validation,
// checksum, metadata commit and audit before/after using Admin SDK/Signed URL.
test('STO-05: upload PDF valid milik sendiri tetap harus melalui backend', async () => {
  await assertFails(uploadBytes(evidence(rep('repA'), 'r1', 'new.pdf'), bytes(), {
    contentType: 'application/pdf',
  }));
});

test('STO-06: upload JPEG dan PNG melalui Client SDK ditolak', async () => {
  await assertFails(uploadBytes(evidence(rep('repA'), 'r1', 'new.jpg'), bytes(), {
    contentType: 'image/jpeg',
  }));
  await assertFails(uploadBytes(evidence(rep('repA'), 'r1', 'new.png'), bytes(), {
    contentType: 'image/png',
  }));
});

test('STO-07: admin tidak dapat mengunggah bukti langsung atas nama pelapor', async () => {
  await assertFails(uploadBytes(evidence(adm('adm1'), 'r1', 'admin.pdf'), bytes(), {
    contentType: 'application/pdf',
  }));
});

test('STO-08: reporter lain tidak dapat mengunggah ke path bukti laporan orang lain', async () => {
  await assertFails(uploadBytes(evidence(rep('repB'), 'r1', 'cross-account.pdf'), bytes(), {
    contentType: 'application/pdf',
  }));
});

test('STO-09: upload dengan MIME non-allowlist ditolak dari Client SDK', async () => {
  for (const contentType of [
    'application/x-msdownload', 'text/html', 'image/svg+xml',
    'text/plain', 'image/gif', 'application/octet-stream',
  ]) {
    await assertFails(uploadBytes(evidence(rep('repA'), 'r1', `bad-${contentType.replaceAll('/', '-')}`), bytes(), {
      contentType,
    }));
  }
});

test('STO-10: upload kosong dan upload berukuran besar ditolak dari Client SDK', async () => {
  await assertFails(uploadBytes(evidence(rep('repA'), 'r1', 'empty.pdf'), new Uint8Array(0), {
    contentType: 'application/pdf',
  }));
  await assertFails(uploadBytes(evidence(rep('repA'), 'r1', 'large.pdf'), bytes(5 * 1024 * 1024 + 1), {
    contentType: 'application/pdf',
  }));
});

test('STO-11: objek bukti yang sudah ada tidak dapat ditimpa pemilik maupun admin', async () => {
  await assertFails(uploadBytes(evidence(rep('repA'), 'r1'), bytes(512), {
    contentType: 'application/pdf',
  }));
  await assertFails(uploadBytes(evidence(adm('adm1'), 'r1'), bytes(512), {
    contentType: 'application/pdf',
  }));
});

test('STO-12: objek bukti tidak dapat dihapus oleh pemilik maupun admin', async () => {
  await assertFails(deleteObject(evidence(rep('repA'), 'r1')));
  await assertFails(deleteObject(evidence(adm('adm1'), 'r1')));
});

// Knowledge Base object: even admin accesses these only through backend.
test('STO-13: reporter tidak dapat membaca PDF Knowledge Base langsung', async () => {
  await assertFails(getBytes(knowledge(rep('repA'))));
});

test('STO-14: admin tidak dapat membaca PDF Knowledge Base langsung melalui Storage SDK', async () => {
  await assertFails(getBytes(knowledge(adm('adm1'))));
});

test('STO-15: upload PDF Knowledge Base dari Client SDK ditolak untuk reporter dan admin', async () => {
  await assertFails(uploadBytes(knowledge(rep('repA'), 'new.pdf'), bytes(), {
    contentType: 'application/pdf',
  }));
  await assertFails(uploadBytes(knowledge(adm('adm1'), 'new.pdf'), bytes(), {
    contentType: 'application/pdf',
  }));
});

test('STO-16: upload non-PDF atau PDF besar ke Knowledge Base ditolak', async () => {
  await assertFails(uploadBytes(knowledge(adm('adm1'), 'new.png'), bytes(), {
    contentType: 'image/png',
  }));
  await assertFails(uploadBytes(knowledge(adm('adm1'), 'large.pdf'), bytes(25 * 1024 * 1024 + 1), {
    contentType: 'application/pdf',
  }));
});

test('STO-17: penghapusan PDF Knowledge Base oleh admin melalui Client SDK ditolak', async () => {
  await assertFails(deleteObject(knowledge(adm('adm1'))));
});

test('STO-18: seluruh path Storage di luar endpoint resmi juga ditolak', async () => {
  for (const path of ['uploads/x.pdf', 'x.pdf', 'reports/r1/other/x.pdf', 'knowledge/x.pdf']) {
    await assertFails(uploadBytes(ref(rep('repA'), path), bytes(), {
      contentType: 'application/pdf',
    }));
    await assertFails(uploadBytes(ref(adm('adm1'), path), bytes(), {
      contentType: 'application/pdf',
    }));
  }
});
