/**
 * SISKA — Pemeriksaan akses tidak sah pada endpoint API (IDOR / otorisasi lintas akun)
 *
 * Skrip ini menembak API Next.js yang SEDANG BERJALAN memakai akun seed, lalu memeriksa bahwa akses
 * lintas akun ditolak. Berbeda dari tes rules, ini menguji lapisan backend (Admin SDK melewati Rules).
 *
 * Prasyarat (4 terminal, atau jalankan berurutan):
 *   1. firebase emulators:start --project demo-siska
 *   2. npm run seed                 (membuat akun seed_* dan data uji)
 *   3. npm run dev                  (Next.js di http://127.0.0.1:3000, pastikan .env mengarah ke emulator)
 *   4. npm run test:idor
 *
 * Variabel opsional: SISKA_BASE_URL (default http://127.0.0.1:3000), FIREBASE_AUTH_EMULATOR_HOST (default 127.0.0.1:9099)
 */

const BASE = process.env.SISKA_BASE_URL ?? 'http://127.0.0.1:3000';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const PASSWORD = 'SiskaDemo#2026'; // password demo yang hanya berlaku di emulator (README seed)

const ACCOUNTS = {
  repA: 'reporter.a@siska.test',
  repB: 'reporter.b@siska.test',
  adm1: 'admin.a@siska.test',
  adm2: 'admin.b@siska.test',
  outsider: 'outsider@siska.test',
};

async function signIn(email) {
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
    },
  );
  const body = await res.json();
  if (!body.idToken) throw new Error(`Gagal login ${email}: ${JSON.stringify(body)}`);
  return body.idToken;
}

async function call(token, method, path, json) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (json !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { method, headers, body: json !== undefined ? JSON.stringify(json) : undefined });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body, text };
}

const results = [];
function check(id, deskripsi, ok, detail = '') {
  results.push({ id, deskripsi, ok, detail });
  console.log(`${ok ? 'LULUS ' : 'GAGAL '} ${id}  ${deskripsi}${ok ? '' : `  → ${detail}`}`);
}
const expectStatus = (id, deskripsi, res, expected) =>
  check(id, deskripsi, res.status === expected, `status ${res.status}, diharapkan ${expected}`);

async function main() {
  // Pastikan layanan hidup
  try {
    await fetch(`${BASE}/api/v1/health`);
  } catch {
    console.error(`API tidak bisa dihubungi di ${BASE}. Jalankan "npm run dev" dulu.`);
    process.exit(2);
  }
  const t = {};
  try {
    for (const [k, email] of Object.entries(ACCOUNTS)) t[k] = await signIn(email);
  } catch (e) {
    console.error(`${e.message}\nPastikan emulator Auth jalan dan "npm run seed" sudah dijalankan.`);
    process.exit(2);
  }

  // ── Autentikasi dasar ──
  expectStatus('AUTH-N1', 'Tanpa token → 401', await call(null, 'GET', '/api/v1/reports'), 401);
  expectStatus('AUTH-N2', 'Token palsu → 401', await call('bukan.token.valid', 'GET', '/api/v1/reports'), 401);
  expectStatus('AUTH-N3', 'Akun tanpa role (outsider) → 403 di /reports', await call(t.outsider, 'GET', '/api/v1/reports'), 403);

  // ── Kontrol positif: pemilik harus tetap bisa ──
  expectStatus('CTRL-1', 'Pelapor A membaca laporan sendiri → 200', await call(t.repA, 'GET', '/api/v1/reports/seed_rpt_a1'), 200);
  expectStatus('CTRL-2', 'Pelapor A membaca percakapan sendiri → 200', await call(t.repA, 'GET', '/api/v1/conversations/seed_conv_a3'), 200);

  // ── REP-03: akses laporan lintas pelapor (IDOR) ──
  const other = await call(t.repB, 'GET', '/api/v1/reports/seed_rpt_a1');
  const ghost = await call(t.repB, 'GET', '/api/v1/reports/seed_rpt_tidak_ada');
  expectStatus('REP-03a', 'Pelapor B membaca laporan pelapor A → 404', other, 404);
  check('REP-03b', 'Pesan 404 (milik orang lain) IDENTIK dengan 404 (ID tidak ada) — tidak membocorkan keberadaan ID',
    other.status === 404 && ghost.status === 404 && other.body?.message === ghost.body?.message,
    `pesan A="${other.body?.message}" vs pesan tak-ada="${ghost.body?.message}"`);
  const list = await call(t.repB, 'GET', '/api/v1/reports');
  check('REP-03c', 'Daftar laporan pelapor B tidak memuat laporan pelapor A',
    list.status === 200 && !list.text.includes('seed_rpt_a'), `status ${list.status}`);
  const summary = await call(t.repB, 'GET', '/api/v1/reports/summary');
  check('REP-03d', 'Ringkasan pelapor B hanya cakupan miliknya (scope reporter_own)',
    summary.status === 200 && summary.body?.scope === 'reporter_own', `status ${summary.status}, scope ${summary.body?.scope}`);

  // ── REP-04: ubah status oleh non-admin ──
  expectStatus('REP-04a', 'Pelapor mengubah status laporan sendiri (PATCH) → 403', await call(t.repB, 'PATCH', '/api/v1/reports/seed_rpt_b1', { status: 'resolved' }), 403);
  expectStatus('REP-04b', 'Pelapor mengubah status lewat alias /status → 403', await call(t.repB, 'PATCH', '/api/v1/reports/seed_rpt_b1/status', { status: 'resolved' }), 403);
  expectStatus('REP-04c', 'Pelapor mengubah status laporan ORANG LAIN → 403', await call(t.repB, 'PATCH', '/api/v1/reports/seed_rpt_a1', { status: 'resolved' }), 403);

  // ── FILE-03: bukti lintas akun ──
  expectStatus('FILE-03a', 'Pelapor B meminta unduhan bukti pelapor A → 404', await call(t.repB, 'GET', '/api/v1/reports/seed_rpt_a1/evidence/seed_ev_a1_01/download'), 404);
  expectStatus('FILE-03b', 'Pelapor B menginisiasi unggah bukti ke laporan pelapor A → 404',
    await call(t.repB, 'POST', '/api/v1/reports/seed_rpt_a1/evidence', { fileName: 'x.pdf', contentType: 'application/pdf', sizeBytes: 100 }), 404);
  expectStatus('FILE-03c', 'Admin tidak bisa mengunggah bukti atas nama pelapor → 403', await call(t.adm1, 'POST', '/api/v1/reports/seed_rpt_a1/evidence', { fileName: 'x.pdf', contentType: 'application/pdf', sizeBytes: 100 }), 403);

  // ── CHAT-02: percakapan lintas akun ──
  expectStatus('CHAT-02a', 'Pelapor B membaca percakapan pelapor A → 404', await call(t.repB, 'GET', '/api/v1/conversations/seed_conv_a3'), 404);
  expectStatus('CHAT-02b', 'Pelapor B membaca PESAN percakapan pelapor A → 404', await call(t.repB, 'GET', '/api/v1/conversations/seed_conv_a3/messages'), 404);
  expectStatus('CHAT-01a', 'Pelapor B mengirim pesan ke percakapan pelapor A → 404', await call(t.repB, 'POST', '/api/v1/conversations/seed_conv_a3/messages', { body: 'uji' }), 404);
  expectStatus('CHAT-03a', 'Pelapor B membuka percakapan untuk laporan pelapor A → 404', await call(t.repB, 'POST', '/api/v1/conversations', { reportId: 'seed_rpt_a1' }), 404);
  expectStatus('CHAT-02c', 'Admin 2 membaca percakapan yang ditugaskan ke Admin 1 → 404', await call(t.adm2, 'GET', '/api/v1/conversations/seed_conv_a3'), 404);
  // Reporter pemilik dapat mengirim melalui API.
  expectStatus('CHAT-P1', 'Reporter A mengirim pesan pada percakapan miliknya → 201', await call(t.repA, 'POST', '/api/v1/conversations/seed_conv_a3/messages', { body: 'Kontrol positif reporter.' }), 201);

  // Admin pertama yang mengirim pada percakapan unassigned mengklaimnya
  // secara atomik. Setelah itu, admin lain wajib ditolak.
  expectStatus('CHAT-P2', 'Admin 2 mengklaim percakapan belum ditugaskan melalui API → 201', await call(t.adm2, 'POST', '/api/v1/conversations/seed_conv_a_general/messages', { body: 'Kontrol positif admin claim.' }), 201);
  expectStatus('CHAT-N2', 'Setelah claim, Admin 1 tidak dapat mengirim ke percakapan yang ditugaskan ke Admin 2 → 404', await call(t.adm1, 'POST', '/api/v1/conversations/seed_conv_a_general/messages', { body: 'Admin tidak ditugaskan.' }), 404);

  // ── KB-02 / audit: endpoint admin oleh pelapor ──
  expectStatus('KB-02a', 'Pelapor membaca daftar knowledge base admin → 403', await call(t.repA, 'GET', '/api/v1/admin/knowledge-documents'), 403);
  expectStatus('KB-02b', 'Pelapor memicu reindex → 403', await call(t.repA, 'POST', '/api/v1/admin/knowledge-documents/reindex'), 403);
  expectStatus('KB-02c', 'Pelapor menghapus dokumen knowledge base → 403', await call(t.repA, 'DELETE', '/api/v1/admin/knowledge-documents/seed_kb_panduan'), 403);
  expectStatus('PRIV-01', 'Pelapor membaca audit log → 403', await call(t.repA, 'GET', '/api/v1/admin/audit-events'), 403);
  // Endpoint pengelolaan dokumen RAG Node.js juga hanya untuk admin.
  expectStatus('AI-DOC-01', 'Pelapor membaca daftar dokumen SISKA AI → 403', await call(t.repA, 'GET', '/api/v1/admin/ai-documents'), 403);
  expectStatus('AI-DOC-02', 'Pelapor mencoba menambah dokumen SISKA AI → 403', await call(t.repA, 'POST', '/api/v1/admin/ai-documents', { file: 'uji.txt', cite: 'Uji', content: 'Teks uji' }), 403);
  expectStatus('AI-DOC-03', 'Pelapor mencoba menghapus dokumen SISKA AI → 403', await call(t.repA, 'DELETE', '/api/v1/admin/ai-documents', { file: 'uji.txt' }), 403);

  // ── AUTH-04: eskalasi role lewat profil ──
  const esc = await call(t.repA, 'PATCH', '/api/v1/profile', { displayName: 'Uji', role: 'admin' });
  check('AUTH-04a', 'Pelapor menyisipkan role=admin pada PATCH profil → ditolak (4xx)', esc.status >= 400 && esc.status < 500, `status ${esc.status}`);
  const adminCheck = await call(t.repA, 'GET', '/api/v1/admin/audit-events');
  check('AUTH-04b', 'Setelah percobaan, pelapor tetap tidak bisa mengakses endpoint admin', adminCheck.status === 403, `status ${adminCheck.status}`);

  const gagal = results.filter((r) => !r.ok);
  console.log(`\nRingkasan: ${results.length - gagal.length}/${results.length} lulus.`);
  if (gagal.length) {
    console.log('Yang GAGAL perlu dilaporkan ke Bintang (Backend) beserta bukti responsnya:');
    for (const g of gagal) console.log(` - ${g.id}: ${g.detail}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
