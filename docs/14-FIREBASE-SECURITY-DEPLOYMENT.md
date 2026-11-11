# 14 — Firebase Security Rules: Setup, Test, dan Deployment

## 1. File yang diterapkan

| File | Fungsi | Konfigurasi |
|---|---|---|
| `firestore.rules` | Akses baca terbatas; seluruh client writes ditolak; default-deny | `firebase.json` → `firestore.rules` |
| `storage.rules` | Seluruh akses langsung Firebase Storage Client SDK ditolak | `firebase.json` → `storage.rules` |
| `firestore.indexes.json` | Composite indexes yang dibutuhkan query backend/client | `firebase.json` → `firestore.indexes.json` |
| `firebase.json` | Mengikat file rules, indexes, dan port emulator | Root repository |

Port emulator konsisten: Auth `9099`, Firestore `8085`, Storage `9199`, Emulator UI `4000`.

## 2. Model akses

- Client SDK: hanya dapat membaca resource Firestore yang diizinkan Rules. Seluruh create/update/delete ditolak.
- Backend: Next.js API memverifikasi ID token dan otorisasi, lalu menggunakan Firebase Admin SDK untuk mutasi.
- Storage Client SDK: seluruh operasi langsung ditolak.
- Evidence: upload melalui backend (Admin SDK atau Signed Upload URL setelah otorisasi); download melalui endpoint setelah pemeriksaan owner/admin, lalu Signed URL.
- Knowledge Base: upload/pengelolaan dan akses file oleh backend/admin API.

Firebase Admin SDK melewati Security Rules. Signed URL GCS juga tidak dievaluasi oleh Firebase Storage Rules. Jangan membagikan Signed URL dan pertahankan TTL singkat.

## 3. Setup lokal

Dari root repository:

```bash
npm install
npm install --save-dev @firebase/rules-unit-testing@^4.0.1
npm install -g firebase-tools
```

Perintah penambahan `@firebase/rules-unit-testing` akan mengubah `package.json` dan `package-lock.json`; commit keduanya bersama test suite. Gunakan versi 4.x yang sesuai dengan Firebase JS SDK 11 pada proyek ini.

Mulai emulator utama untuk seed dan API:

```bash
firebase emulators:start --project demo-siska
```

Jalankan seed dan Next.js pada terminal lain:

```bash
npm run seed
npm run dev
```

## 4. Pengujian Rules

```bash
npm run test:rules
```

Script memulai Firestore dan Storage Emulator secara terpisah/berurutan agar fixture tidak saling membersihkan. Bila port terpakai, matikan proses emulator lain terlebih dahulu.

Untuk menjalankan satu suite:

```bash
npm run test:rules:firestore
npm run test:rules:storage
```

## 5. Pengujian API

Dengan emulator utama, data seed, dan Next.js sudah aktif:

```bash
npm run test:idor
```

Jalankan juga:

```bash
npm test
npm run lint
```

Catat output terminal dan versi runtime pada `docs/11-SECURITY-RULES-TEST-RESULTS.md`. Jangan menandai pengujian lulus sebelum output aktual diperoleh.

## 6. Deployment ke staging

Setelah tes Rules dan backend lulus, deploy hanya ke project staging yang sudah ditetapkan tim:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage --project <staging-project-id>
```

Pastikan `<staging-project-id>` bukan project produksi dan cocok dengan persetujuan tim. `.firebaserc` pada ZIP masih memuat alias existing; perintah di atas sengaja meminta project eksplisit.

## 7. Produksi dan rollback

Jangan deploy ke produksi sebelum:
- SEC-F03 disetujui;
- tes Rules, API IDOR, backend unit, dan upload/download selesai;
- frontend memastikan tidak ada operasi tulis Firestore atau akses langsung Storage Client SDK;
- tim menyetujui perubahan perilaku bahwa semua client writes ditolak.

Simpan salinan rules yang sedang live sebelum deploy. Bila terjadi regresi, rollback hanya rules yang sebelumnya disetujui, lalu jalankan ulang pengujian. Jangan mengembalikan izin client writes secara cepat tanpa review dan tes baru.


## 8. Integrasi dengan Node.js AI Service

Root SISKA tetap menggunakan `ai-service/` Node.js yang disertakan pada branch development. Jangan menyalin atau mengganti `src/server/contracts/ai-service.contract.ts`, `src/server/services/ai.service.ts`, `ai-service/`, atau `src/app/api/v1/admin/ai-documents/route.ts` dengan versi dari proyek lain yang memakai FastAPI. Next.js API harus memverifikasi admin/user terlebih dahulu; microservice memvalidasi `X-Service-Authorization` untuk seluruh endpoint selain `/health`. Jalankan `npm run test:ai-service` untuk E2E service dan masukkan kontrol akses `/api/v1/admin/ai-documents` ke hasil IDOR.
