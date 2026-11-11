# 11 — Bukti Pengujian Firebase Security Rules

**Status paket:** Suite pengujian telah disiapkan; eksekusi Firebase Emulator belum dilakukan pada lingkungan penyusunan ZIP ini.  
**Tanggal integrasi:** 2 November 2026  
**Penting:** dokumen ini bukan laporan hasil lulus. Isi hasil aktual hanya setelah perintah pengujian benar-benar dijalankan.

## 1. Ringkasan suite

| Suite | File | Jumlah skenario | Status saat paket dibuat |
|---|---|---:|---|
| Firestore Rules | `src/tests/rules/firestore.rules.test.mjs` | 27 | Belum dijalankan |
| Storage Rules | `src/tests/rules/storage.rules.test.mjs` | 18 | Belum dijalankan |
| API IDOR | `scripts/idor-check.mjs` | Pemeriksaan endpoint terintegrasi | Belum dijalankan |
| Backend unit (targeted) | `src/tests/unit/backend-test-plan.test.mjs` | 11 | **PASS 11/11** dengan Node 22.16 + `--experimental-strip-types` |

Jumlah skenario Rules yang disediakan: **45** (27 Firestore + 18 Storage). Pengujian API IDOR dan backend adalah lapisan tambahan, terpisah dari Rules.

## 2. Prasyarat

Dari root proyek:

```bash
npm install
npm install --save-dev @firebase/rules-unit-testing@^4.0.1
npm install -g firebase-tools
```

Perintah `npm install --save-dev` akan menambahkan dependensi Rules Unit Testing ke `package.json` dan memperbarui `package-lock.json` pada mesin pengembang. Commit kedua file tersebut setelah instalasi berhasil.

## 3. Jalankan Firestore dan Storage Rules

```bash
npm run test:backend
npm run test:rules
```

Skrip menjalankan dua emulator suite secara berurutan dengan project ID terpisah:
- Firestore: `demo-siska-firestore-rules`
- Storage: `demo-siska-storage-rules`

Pemisahan mencegah fixture `clearFirestore()` dari suite Firestore mengganggu suite Storage. Port berasal dari `firebase.json`: Auth `9099`, Firestore `8085`, Storage `9199`, UI `4000`.

## 4. Jalankan API IDOR

Pengujian API memakai akun seed sintetis dan membutuhkan tiga terminal:

**Terminal 1 — Firebase Emulator**

```bash
firebase emulators:start --project demo-siska
```

**Terminal 2 — seed dan Next.js**

```bash
npm run seed
npm run dev
```

**Terminal 3 — API IDOR**

```bash
npm run test:idor
```

Skrip menguji token tanpa login/palsu, akun tanpa role, akses lintas reporter, endpoint evidence, percakapan lintas akun, penugasan admin, KB, audit, dan percobaan eskalasi role.

## 5. Catat hasil aktual

Isi tabel berikut berdasarkan output terminal. Jangan mengisi jumlah lulus/gagal dengan perkiraan.

| Metadata | Hasil aktual |
|---|---|
| Tanggal dan waktu pengujian | Belum dijalankan |
| Commit/versi source | Belum dicatat |
| Node.js | Belum dicatat |
| Firebase CLI | Belum dicatat |
| `npm run test:rules:firestore` | Belum dijalankan |
| `npm run test:rules:storage` | Belum dijalankan |
| `npm run test:idor` | Belum dijalankan |
| Catatan kegagalan / skipped | Belum ada bukti |

### Ringkasan jumlah

| Suite | Lulus | Gagal | Skipped | Bukti output |
|---|---:|---:|---:|---|
| Firestore Rules | — | — | — | Tempel output terminal setelah run |
| Storage Rules | — | — | — | Tempel output terminal setelah run |
| API IDOR | — | — | — | Tempel output terminal setelah run |
| Backend unit/service | — | — | — | Tempel output terminal setelah run |

## 6. Kriteria penerimaan

1. Seluruh 27 tes Firestore Rules lulus.
2. Seluruh 18 tes Storage Rules lulus.
3. Tidak ada test suite yang dilewati tanpa alasan terdokumentasi.
4. Pengujian API IDOR menunjukkan 404/403 yang diharapkan untuk akses lintas akun dan 2xx untuk kontrol positif yang sah.
5. Backend unit/service lulus setelah perubahan resolver field kanonis/alias.
6. Jika satu tes gagal, dokumentasikan hasil, temuan, penanggung jawab, dan retest; jangan menandai implementasi final.

**Batas penting:** Rules Emulator membuktikan perilaku Firebase Client SDK. Firebase Admin SDK melewati Rules, sehingga backend API tetap harus diuji secara terpisah. Signed URL juga tidak diperiksa oleh Firebase Storage Rules; uji otorisasi penerbitan URL melalui API dan expiry-nya.


## 7. Test tambahan yang dipertahankan dari development

- `npm test` tetap mencakup backend-test-plan, `ai-reply.test.mjs`, dan `ai-pdf-extractor.test.mjs` (development baseline).
- `npm run test:ai-service` menjalankan `ai-service/tests/server.e2e.test.js`, termasuk validasi shared secret dan pengelolaan RAG docs Node.js.
- IDOR harness terintegrasi menambahkan pengujian akses reporter ke `/api/v1/admin/ai-documents` (GET/POST/DELETE harus 403).

**Status saat pengecekan paket:** backend test-plan dijalankan terpisah dan lulus 11/11; AI service E2E dijalankan 15/16 dengan satu kegagalan baseline yang juga muncul pada ZIP development original. Tes gabungan `npm test` belum dapat diselesaikan pada environment pembuat paket karena dependency `pdfjs-dist` belum terpasang di environment tersebut; dependency ini tetap tercantum pada package.json development. Lihat §8.


## 8. Pemeriksaan awal pada paket integrasi (2 November 2026)

Pemeriksaan berikut benar-benar dijalankan pada source gabungan berbasis development. Ini bukan hasil Firebase Rules/IDOR.

| Pemeriksaan | Hasil aktual | Catatan |
|---|---|---|
| `npm run seed:dry` | **PASS** | Dataset sintetis lolos validasi; 5 Auth users, 4 users, 8 reports, 23 statusHistory, 4 evidence, 4 conversations, 12 messages, 4 knowledgeDocuments, 7 chunks, 23 auditEvents, 8 storage files |
| `npm run test:ai-service` | **FAIL — 15/16** | 15 lulus, 1 gagal pada test emergency contacts: jawaban aktual memuat 110 dan hotline PLT PPKS, tetapi assertion juga mengharapkan SAPA 129 dan WhatsApp 08111-129-129 |
| Baseline `SISKA-development` AI service test | **FAIL — 15/16** | Pengujian yang sama pada ZIP development original juga menghasilkan 15/16; kegagalan bukan disebabkan oleh security integration. Perlu tindak lanjut AI team atau koreksi golden expectation berdasarkan kebijakan kontak yang disetujui. |
| Firestore Rules Emulator | **PENDING** | Firebase CLI dan `@firebase/rules-unit-testing` tidak tersedia pada environment integrasi ini |
| Storage Rules Emulator | **PENDING** | Firebase CLI dan `@firebase/rules-unit-testing` tidak tersedia pada environment integrasi ini |
| API IDOR | **PENDING** | Memerlukan dependency proyek, Firebase Emulator Auth/Firestore/Storage, seed, dan Next.js server berjalan |
| Backend test-plan (targeted) | **PASS 11/11** | `npm run test:backend` (11/11 lulus; perintah setara dengan Node 22.16 + `--experimental-strip-types`) |
| Root `npm test` gabungan | **PENDING** | Belum dapat dieksekusi penuh karena `pdfjs-dist` belum terpasang di environment penyusunan ZIP; dependency tetap tercantum pada manifest development |
| `npm run lint` dan `npm run build` | **PENDING** | Belum dijalankan pada environment integrasi ini |

Jangan mengubah test emergency-contact agar lulus dengan menghapus assertion tanpa review. Source RAG dan test tersebut tidak diubah dari development; kegagalan sudah direproduksi pada ZIP development original.
