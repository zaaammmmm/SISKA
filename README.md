# SISKA — Firebase Seed (Auth + Firestore + Storage)

Seed data **sintetis** untuk Firebase Emulator Suite, disusun dari `SISKA-SRS-Engineering-Spec`
(`docs/02-ERD.md`, `docs/08-AUTHORIZATION-MATRIX.md`, `docs/09-TEST-PLAN.md`,
`firebase/firestore.rules`, `firebase/firestore.indexes.json`, `firebase/storage.rules`).

Tidak ada laporan, bukti, kontak, atau identitas nyata. Semua email memakai domain `.test`,
semua deskripsi diberi tag `[DATA UJI SINTETIS]`, dan kontak resmi KB sengaja berupa placeholder.

## Isi

| File | Fungsi |
|---|---|
| `seed-data.mjs` | Dataset deterministik + validator integritas (tanpa I/O, tanpa firebase-admin) |
| `seed.mjs` | Runner: Auth (akun + custom claims), Firestore, Storage; dry-run, reset, pengaman |
| `package.json` | Skrip `npm run seed*` |

## Cara pakai

Letakkan folder ini di root repo SISKA (sejajar dengan `firebase/`), lalu:

```bash
cp firebase/firebase.json.example firebase.json        # sekali saja
firebase emulators:start --project demo-siska          # terminal 1 (Auth 9099, Firestore 8080, Storage 9199)

cd siska && npm install                                # terminal 2
npm run seed:dry                                       # validasi tanpa Firebase
npm run seed                                           # seed ke emulator
```

| Perintah | Hasil |
|---|---|
| `npm run seed` | Seed idempoten (ID deterministik `seed_*`, aman dijalankan berulang) |
| `npm run seed:reset` | Hapus data seed lama, lalu seed ulang |
| `npm run seed:adversarial` | Reset + fixture XSS dan prompt injection |
| `npm run seed:clean` | Hanya hapus data seed |
| `node seed.mjs --emulator --only=auth,firestore` | Seed sebagian layanan (mis. tanpa Storage) |
| `node seed.mjs --dry-run --out=dump.json` | Dump JSON dokumen (tanpa password/bytes) |

Reset hanya menyentuh ID berawalan `seed_` (dokumen + subkoleksi, akun Auth, objek Storage).

### Pengaman
- Default **hanya emulator**. Bila Firestore/Auth/Storage setengah-emulator setengah-nyata, skrip menolak.
- Project nyata (khusus dev/staging) butuh `--allow-remote --confirm-project=<id>` **dan** env `SEED_PASSWORD` (≥ 12 karakter). Project ID yang mengandung `prod` selalu ditolak.
- Password demo `SiskaDemo#2026` hanya berlaku di emulator.
- Dataset divalidasi sebelum menulis apa pun; satu pelanggaran = skrip berhenti.

## Akun uji

| Email | Role (custom claim) | UID | Catatan |
|---|---|---|---|
| `admin.a@siska.test` | `admin` | `seed_admin_1` | Petugas yang ditugaskan di sebagian besar chat |
| `admin.b@siska.test` | `admin` | `seed_admin_2` | Tidak ditugaskan pada chat aktif; uji kebijakan admin global vs. assigned |
| `reporter.a@siska.test` | `reporter` | `seed_reporter_a` | 5 laporan |
| `reporter.b@siska.test` | `reporter` | `seed_reporter_b` | 3 laporan; pelapor "lintas akun" |
| `outsider@siska.test` | *(tanpa claim)* | `seed_outsider` | Akun tidak berwenang (Test Plan §4): login valid, tanpa profil/data |

Role ditetapkan lewat Admin SDK (`setCustomUserClaims`) karena `firestore.rules` membaca
`request.auth.token.role`. Dokumen `users/{uid}.role` hanya cerminan; claim adalah otoritas.

## Data yang di-seed

| Koleksi | Jumlah | Keterangan |
|---|---:|---|
| `users` | 4 | uid, displayName, email, role, createdAt, updatedAt (ERD §4) |
| `reports` | 8 | Mencakup kelima status; satu laporan dibuka kembali |
| `reports/*/statusHistory` | 23 | Rantai null→submitted… konsisten dengan transisi SRS §7 |
| `reports/*/evidence` | 4 | Metadata + berkas privat nyata (PDF/PNG/JPEG) di Storage; sha256 & ukuran cocok |
| `conversations` | 4 (+1) | `report_admin`; terbuka, tertutup, belum ditugaskan, tanpa laporan |
| `conversations/*/messages` | 12 (+2) | Hanya peserta sebagai pengirim |
| `knowledgeDocuments` | 4 (+1) | `indexed` ×2, `failed`, `processing` |
| `knowledgeChunks` | 7 (+1) | Teks = isi halaman PDF yang sama (halaman N = chunk N), jadi bisa di-ingest ulang |
| `auditEvents` | 23 (+1) | Perubahan status, provisioning role, aksi KB; tanpa payload/catatan |

`(+n)` = tambahan dengan `--with-adversarial`.

Laporan: `a1` submitted · `a2` under_review · `a3` in_progress (pernah kembali ke under_review) ·
`a4` resolved · `a5` rejected · `b1` submitted · `b2` in_progress · `b3` reopened (resolved → under_review).

### Pemetaan ke Test Plan

| Test ID | Fixture |
|---|---|
| AUTH-01, AUTH-04 | `seed_reporter_a` (claim `reporter`); coba tulis `role` pada `users/…` → harus ditolak |
| REP-03 | Login `reporter.b`, baca `reports/seed_rpt_a1` → harus ditolak |
| REP-04 | Login `reporter.a`, ubah `status` `seed_rpt_a1` → harus ditolak |
| REP-05, REP-06 | `seed_rpt_a1` (submitted→under_review sah), `seed_rpt_a2` (under_review→submitted ilegal) |
| Terminal / reopen | `seed_rpt_a4` (resolved), `seed_rpt_a5` (rejected), `seed_rpt_b3` (reopened) |
| FILE-01, FILE-03 | `reports/seed_rpt_a3/evidence/*` — `reporter.b` tidak boleh mengunduh |
| CHAT-01, CHAT-02 | `seed_conv_a3` (A ↔ admin1); `reporter.b` / `outsider` tidak boleh membaca |
| Kebijakan admin | `seed_conv_a3`: `admin.b` bukan petugas yang ditugaskan |
| CHAT-03 | `seed_conv_xss` (`--with-adversarial`) |
| KB-01…KB-03 | `seed_kb_panduan`, `seed_kb_edukasi` (indexed), `seed_kb_gagal` (failed), `seed_kb_proses` (processing) |
| AI-03 | `seed_kb_injection` (`--with-adversarial`) |
| AI-02, AI-05 | KB tidak memuat nomor kontak; hanya `[KONTAK RESMI KAMPUS - BELUM DITETAPKAN]` |
| PRIV-01 | `auditEvents` hanya berisi aktor/aksi/target/waktu/requestId |

## Asumsi (spesifikasi tidak menetapkan — mohon konfirmasi)

1. **Reopen**: `resolved`/`rejected` → `under_review` (SRS hanya menyebut "dapat dibuka ulang dengan alasan").
2. **Status percakapan**: `open` / `closed`. **Status KB**: `processing` / `indexed` / `failed` (+ `errorCode` saat `failed`).
3. **Kategori laporan** diambil dari form KOPKAS: Pelecehan melalui pesan, Pelecehan fisik, Kekerasan berbasis gender, Informasi dan dukungan, Lainnya.
4. **Nama field percakapan** mengikuti `firestore.rules` dan `firestore.indexes.json` (`reporterId`, `assignedAdminId`), bukan ERD (`reporterUid`, `adminUid`). Pesan memakai `senderUid` (ERD).
5. **Field tambahan** di luar tabel minimum ERD, semuanya disebut di dokumen backend/AI: `reports.resolvedAt`; `knowledgeDocuments.version`, `errorCode`, `updatedAt`; `knowledgeChunks.documentId/documentVersion/chunkIndex/page/section/text`.
6. **Tidak di-seed**: riwayat SISKA AI (spesifikasi: localStorage/tidak dicampur dengan chat manusia), embedding/vektor (dihasilkan pipeline ingestion), koleksi `notifications` (hanya ada di rules KOPKAS lama).
7. Status memakai kode kanonis SRS (`submitted`…`rejected`), bukan label demo KOPKAS ("Menunggu verifikasi/Diproses/Selesai"); UI perlu pemetaan.

## Status verifikasi

| Bagian | Dicek dengan |
|---|---|
| Integritas dataset (transisi status, rantai history, referensi, batas panjang API, allowlist bukti, hash/ukuran berkas, chunkCount) | Validator bawaan; 10 mutasi sengaja dirusak, seluruhnya terdeteksi |
| Auth | **Auth Emulator sungguhan**: login 5 akun, claim `role` ada di ID token, seed ulang idempoten, reset bersih |
| Firestore | 95/95 dokumen diterima serializer Firestore SDK. **Belum dijalankan pada Firestore Emulator** (JAR emulator tidak dapat diunduh di lingkungan pembuatan) |
| Storage | Unggah 9 objek via Admin SDK terhadap stub HTTP (validasi md5/crc32c lolos). **Belum dijalankan pada Storage Emulator** |
| Rules | Tidak dijalankan. Setelah `npm run seed`, jalankan emulator test rules Anda terhadap data ini |

Jalankan `npm run seed` sekali di mesin Anda dan periksa Emulator UI (`localhost:4000`) sebagai konfirmasi akhir.
