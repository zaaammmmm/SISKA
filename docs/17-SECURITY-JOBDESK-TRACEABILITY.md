# 17 — Traceability Jobdesk Keamanan Akses SISKA

Dokumen ini memetakan tugas dan artefak yang tersedia setelah integrasi pada branch development. Status dibedakan antara penyusunan, integrasi source, koordinasi manusia, dan bukti runtime.

| Jobdesk | Artefak/bukti | Status paket | Yang masih diperlukan |
|---|---|---|---|
| Menyusun Firestore Rules awal | `firestore.rules`; default-deny; role/owner/assignment; 27 test cases | **Disusun dan terintegrasi** | Jalankan Emulator tests; review SEC-F03 |
| Menyusun Storage Rules | `storage.rules`; default-deny direct Client SDK; 18 test cases | **Disusun dan terintegrasi** | Jalankan Storage Emulator tests; uji backend upload/download/Signed URL |
| Menerapkan aturan ke konfigurasi Firebase | `firebase.json`, `firebase.json.example`, `.env.example`, `next.config.ts`; port 8085 | **Terintegrasi secara konfigurasi source** | Verifikasi env lokal dan jalankan Emulator |
| Berkoordinasi dengan backend | `docs/05`, `docs/08`, `docs/13`, `docs/14`; pemetaan Admin SDK/API/AI service | **Dasar teknis tersedia; koordinasi belum terverifikasi** | Minta review/persetujuan Bintang/tim backend, terutama SEC-F03, storage flow dan AI service |
| Membuat matriks izin teknis | `docs/08-AUTHORIZATION-MATRIX.md` | **Terintegrasi dan diperluas** | Validasi kebijakan role/admin dengan pemilik proses |
| Menyiapkan pengujian keamanan | Firestore 27, Storage 18, `scripts/idor-check.mjs`, test backend, AI service E2E | **Harness dan skenario tersedia** | Install Rules Unit Testing + Firebase CLI; jalankan semua suite |
| Membuktikan hasil pengujian | `docs/11-SECURITY-RULES-TEST-RESULTS.md` | **Belum terbukti / Pending** | Tempel output aktual; isi PASS/FAIL/SKIP dan screenshot/log |

## Pernyataan status yang boleh digunakan dalam laporan tugas

Pekerjaan penyusunan Rules, konfigurasi source Firebase, matriks izin, dan penyiapan test suite telah disiapkan serta diintegrasikan ke arsitektur development terbaru. Pengujian runtime Firebase Rules, API IDOR, dan pembuktian hasil belum dapat diklaim selesai sebelum dijalankan dan dicatat. Koordinasi dengan backend harus dibuktikan melalui review/approval tim, bukan hanya dokumentasi teknis.

## Perintah untuk memperoleh bukti

```bash
npm install --save-dev @firebase/rules-unit-testing@^4.0.1
npm install -g firebase-tools
npm run seed:dry
npm run test:backend
npm test
npm run test:ai-service
npm run test:rules
# emulator utama + seed + Next.js berjalan di terminal terpisah
npm run test:idor
npm run lint
npm run build
```

Jangan menjalankan seed/reset atau deployment pada project produksi.


## Bukti runtime yang sudah tersedia pada saat paket disusun

- `npm run seed:dry`: **PASS**; dataset sintetis tervalidasi (5 Auth users, 4 users, 8 reports, 23 statusHistory, 4 evidence, 4 conversations, 12 messages, 4 knowledgeDocuments, 7 chunks, 23 auditEvents, 8 storage files).
- Backend test-plan terarah: **PASS 11/11** dengan Node 22.16 menggunakan `--experimental-strip-types`.
- `npm run test:ai-service`: **FAIL 15/16** pada satu assertion emergency contacts. Kegagalan yang sama direproduksi pada ZIP `SISKA-development` original, sehingga merupakan baseline issue yang belum selesai, bukan regresi dari patch keamanan.
- Firestore Rules Emulator (27), Storage Rules Emulator (18), API IDOR, lint, dan build: **PENDING**; belum boleh diklaim lulus.

Bukti tersebut bersifat snapshot pada saat integrasi dan harus diperbarui setelah tes dijalankan kembali pada clone branch development milik tim.
