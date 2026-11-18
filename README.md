# SISKA

SISKA adalah sistem pengaduan kekerasan seksual berbasis web yang dibangun dengan Next.js, Firebase, dan layanan AI terpisah untuk dukungan informasi berbasis knowledge base. Proyek ini dirancang untuk memfasilitasi pelaporan, komunikasi antar pelapor dan admin, pengelolaan dokumen, serta respon AI yang berbasis sumber (grounded RAG) dan aman.

## Ringkasan proyek

- Aplikasi web utama: Next.js App Router + React + TypeScript + Tailwind CSS
- Autentikasi & data: Firebase Authentication, Firestore, Cloud Storage
- Layanan AI: service terpisah di folder `ai-service/` untuk RAG / chat knowledge base
- Keamanan: role-based access, custom claims, validation layer, rules, audit trail
- Fokus domain: laporan kekerasan seksual, komunikasi, dokumen pendukung, knowledge base, admin operations

## Tujuan

- Memungkinkan pengguna membuat dan memantau laporan keamanan/pelecehan seksual
- Menyediakan saluran komunikasi aman antara pelapor dan petugas/admin
- Mengelola bukti dan dokumen pendukung dengan akses terbatas
- Menyediakan portal AI untuk menjawab pertanyaan umum berdasarkan dokumen yang telah disetujui
- Mengadopsi arsitektur yang aman dan dapat diujikan dengan emulator Firebase

## Fitur utama

- Autentikasi login/register pada aplikasi web
- Dashboard pengguna dan admin
- Form pelaporan dengan metadata dan status transisi
- Chat internal antar reporter/admin
- Manajemen dokumen knowledge base/admin
- AI chat berbasis retrieval (RAG)
- Audit event dan traceability untuk aktivitas administratif
- Server-side validation dan authorization layer
- Setup local dengan Firebase Emulator Suite

## Stack teknologi

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- Firebase Web SDK
- Firebase Admin SDK
- Firestore + Storage Rules
- Node.js runtime untuk AI service
- Ollama / model embedding dan chat lokal (dalam arsitektur AI service)

## Struktur repository

```text
.
├─ ai-service/                  # layanan AI/RAG terpisah
│  ├─ data/                     # dokumen sumber dan export indeks
│  ├─ src/                     # server AI / endpoint / rag logic
│  ├─ tests/                   # pengujian AI-service
│  ├─ .env.example             # contoh env AI service
│  └─ package.json
├─ docs/                       # dokumen SRS, ERD, arsitektur, test plan
├─ public/                     # asset publik
├─ scripts/                    # utility operasional seperti IDOR checker
├─ src/                        # aplikasi Next.js utama
│  ├─ app/                     # routing App Router
│  ├─ components/              # UI komponen frontend
│  ├─ lib/                    # konfigurasi dan helper
│  ├─ server/                 # authz, validators, services, rate limit
│  ├─ tests/                  # unit test frontend/backend
│  ├─ types/                  # tipe domain/API
│  └─ utils/
├─ .env.example                # contoh env frontend/server
├─ firebase.json.example       # contoh konfigurasi emulator Firebase
├─ firestore.rules             # aturan Firestore
├─ firestore.indexes.json      # indeks Firestore
├─ package.json                # script aplikasi utama
├─ seed-data.mjs               # dataset uji semu untuk emulator
├─ seed.mjs                    # runner seed Firebase
├─ storage.rules               # aturan Cloud Storage
├─ tsconfig.json               # konfigurasi TypeScript
├─ next.config.ts              # konfigurasi Next.js
├─ README.md                   # dokumentasi utama
└─ LICENSE
```

## Prasyarat

Pastikan perangkat lunak berikut sudah tersedia:

- Node.js >= 18
- npm
- Firebase CLI
- Git
- Optional: Ollama untuk AI service lokal

Untuk pengembangan AI local, layanan AI menggunakan `qwen25c3b-8k:latest` sebagai model chat dan `qwen3-embedding:0.6b` sebagai model embedding (indeks RAG sudah dibangun dengan embedding ini) yang di-host melalui Ollama.

## Quick start

### 1. Clone dan install dependencies

```bash
git clone <repo-url>
cd SISKA
npm install
```

### 2. Siapkan environment

Salin contoh environment yang ada:

```bash
cp .env.example .env.local
```

Isi sesuai project Firebase Anda. Contoh variabel yang umum dibutuhkan:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true

FIREBASE_PROJECT_ID=...
FIREBASE_STORAGE_BUCKET=...
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199

AI_SERVICE_ENABLE_REMOTE=true
AI_SERVICE_URL=http://127.0.0.1:8000
AI_SERVICE_SHARED_SECRET=secret-acak
```

### 3. Jalankan Firebase Emulator Suite

```bash
cp firebase.json.example firebase.json
firebase emulators:start --project demo-siska --only auth,firestore,storage
```

Untuk area emulator UI dapat dibuka di:

- Auth: http://localhost:9099
- Firestore: http://localhost:8085
- Storage: http://localhost:9199
- Emulator UI: http://localhost:4000

### 4. Jalankan aplikasi utama

```bash
npm run dev
```

Buka browser ke:

```text
http://localhost:3000
```

### 5. Jalankan AI service (opsional bila ingin menggunakan RAG/AI)

```bash
cp ai-service/.env.example ai-service/.env
npm --prefix ai-service run dev
```

Atau, bila service AI dijalankan di server remote, pastikan `AI_SERVICE_URL` dan `AI_SERVICE_SHARED_SECRET` sesuai.

## Perintah penting

Di root project:

```bash
npm run dev          # menjalankan aplikasi Next.js
npm run build        # build produksi
npm run start        # menjalankan build produksi
npm run lint         # type-check / validasi TypeScript
npm test             # menjalankan test unit proyek
npm run seed         # seed data emulator via Firebase
npm run seed:dry     # validasi data seed tanpa menulis DB
npm run seed:reset   # reset dan isi ulang data seed
npm run test:rules   # Firestore + Storage rules testing
npm run test:idor    # pengecekan celah IDOR / akses tidak sah
```

Untuk AI service:

```bash
npm --prefix ai-service run dev
npm --prefix ai-service run test
npm --prefix ai-service start
```

## Rute utama aplikasi

Aplikasi web memiliki struktur route yang mencakup public, auth, reporter, dan admin. Beberapa rute yang tersedia di repo antara lain:

- `/` : halaman publik / beranda
- `/login` : login
- `/register` : registrasi
- `/user` : area pengguna umum
- `/user/reports` : daftar laporan
- `/user/reports/[id]` : detail laporan
- `/user/chat` : chat dengan admin
- `/user/ai` : chat AI/SISKA AI
- `/admin` : dashboard admin
- `/admin/reports` : daftar laporan admin
- `/admin/chat` : chat admin
- `/admin/documents` atau `/admin/knowledge-base` : dokumen knowledge base (tergantung implementasi frontend)

## Arsitektur aplikasi

### Frontend

Aplikasi utama merupakan Next.js App Router dengan komponen modular di `src/components`. UI dibangun agar responsif dan terpisah berdasarkan domain:

- auth UI
- dashboard pengguna
- dashboard admin
- report detail
- chat interface
- AI chat interface
- knowledge-base management

### Backend/API

Backend dan boundary akses ada di `src/server` dan `src/app/api`. Struktur yang disasar adalah:

- validasi request
- autentikasi token Firebase
- pemeriksaan role/ownership
- rate limiting
- audit trail
- service domain untuk report, evidence, conversations, AI, knowledge documents

### AI service

Folder `ai-service/` berisi layanan terpisah untuk retrieval augmented generation. Fokusnya adalah:

- retrieve dokumen knowledge base
- chunking dan indexing dokumen
- pemodelan embedding
- prompt grounding dan citation validation
- jawaban yang bersifat grounded dan aman

Layanan ini tidak boleh menjadi satu-satunya sumber otoritas dalam keputusan akses data. Ia hanya membantu menjawab pertanyaan berbasis sumber yang telah disetujui.

## Keamanan dan privasi

Proyek ini menekankan pendekatan keamanan yang kuat:

- Firebase Auth untuk identitas
- Firestore rules dan Storage rules untuk kontrol akses
- custom claims untuk role admin/reporter
- validasi request pada server side
- audit event untuk aktivitas penting
- pembatasan akses file dan evidence
- pemisahan AI service dari aplikasi utama
- tidak memasukkan secret ke repo

> CATATAN: proyek ini masih dalam fase pengembangan dan perlu pengujian keamanan lintas peran sebelum deployment ke lingkungan produksi.

## Pengujian

Skrip testing yang tersedia:

```bash
npm test
npm run test:rules
npm run test:idor
npm run test:backend
```

Direktori uji mencakup:

- `src/tests/unit/`
- `src/tests/rules/`
- `scripts/idor-check.mjs`
- `ai-service/tests/`

## Dokumentasi pendukung

Dokumen utama terletak di folder `docs/` dan mencakup:

- `docs/01-SRS.md` : kebutuhan sistem
- `docs/02-ERD.md` : struktur data entitas
- `docs/03-DATABASE-SCHEMA.sql` : skema database
- `docs/04-API-SPEC.yaml` : spesifikasi API
- `docs/05-BACKEND-ARCHITECTURE.md` : arsitektur backend
- `docs/06-AI-ARCHITECTURE.md` : arsitektur AI/RAG
- `docs/07-FRONTEND-ARCHITECTURE.md` : arsitektur frontend
- `docs/08-AUTHORIZATION-MATRIX.md` : matrix otorisasi
- `docs/09-TEST-PLAN.md` : rencana uji
- `docs/10-DEVELOPMENT-ROADMAP.md` : roadmap pengembangan
- `docs/11-SECURITY-RULES-TEST-RESULTS.md` : hasil uji keamanan rules
- `docs/12-DATA-CLASSIFICATION.md` : klasifikasi data
- `docs/13-SECURITY-REVIEW-FINDINGS.md` : temuan keamanan
- `docs/14-FIREBASE-SECURITY-DEPLOYMENT.md` : deployment keamanan Firebase
- `docs/15-SECURITY-INTEGRATION-CHANGELOG.md` : changelog keamanan
- `docs/16-SECURITY-CHANGE-REVIEW.md` : review perubahan keamanan
- `docs/17-SECURITY-JOBDESK-TRACEABILITY.md` : traceability & jobdesk

## Tips pengembangan lokal

- Gunakan Firebase Emulator saat mengembangkan fitur access control
- Simpan secret pada `.env.local` atau environment secret, bukan di repo
- Gunakan generasi data seed untuk validasi pola otorisasi
- Uji role dan permission secara eksplisit sebelum menutup fitur admin
- Pastikan tidak ada data sensitif ikut masuk ke log atau prompt AI

## Kontribusi

Kontribusi dipersilakan jika Anda ingin membantu:

- pengembangan feature admin dan reporter
- integrasi backend API Firebase
- penguatan security rules
- pengujian unit/integrasi
- pengembangan AI service dan knowledge base
- dokumentasi dan pemeliharaan

## Lisensi

Proyek ini dilisensikan di bawah lisensi yang tercantum pada file `LICENSE`.

## Catatan penting

SISKA sudah memiliki landasan arsitektur, dokumen keamanan, serta referensi AI/backend yang cukup lengkap. Untuk memulai pengembangan secara konsisten, sebaiknya selalu merujuk ke folder `docs/` dan menghindari perubahan yang bertentangan dengan kebijakan otorisasi yang tercantum dalam `docs/08-AUTHORIZATION-MATRIX.md` serta aturan Firebase di `firestore.rules` dan `storage.rules`.

---

Version: 1.0
Project: SISKA
Status: Development / Architecture-Driven Implementation
