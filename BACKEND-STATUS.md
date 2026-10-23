# SISKA — Laporan Kondisi dan Status Kesiapan Backend

**Dokumen Acuan Mutlak:** [`docs/`](./docs) (`01-SRS.md` s/d `10-DEVELOPMENT-ROADMAP.md`)  
**Peran Pengembang:** Backend Engineer SISKA  
**Status Ekosistem:** Backend Mandiri, Stabil, Teruji Penuh, dan Siap Diintegrasikan (*Integration-Ready*) oleh Frontend & AI

---

## 1. Ringkasan Eksekutif (*Executive Summary*)

Backend SISKA telah berhasil dibangun secara mandiri dengan arsitektur bersih berlapis (*Clean Layered Architecture*) yang sepenuhnya mengacu pada proposal dan dokumen acuan di folder [`docs/`](./docs). Seluruh dependensi lama (Supabase/PostgreSQL) telah 100% dibersihkan dan digantikan secara murni oleh ekosistem **Next.js App Router (Route Handlers) + Firebase Admin SDK + Cloud Firestore + Cloud Storage**.

Meskipun **Frontend** dan **AI** saat ini belum menuntaskan kode mereka, struktur backend telah dirancang secara khusus untuk **membuka jalan (unblock) dan mempermudah pekerjaan mereka kedepannya**:
1. **Untuk Tim Frontend:** Disediakan DTO bertipe kuat (`src/types/api.ts`) dengan serialisasi waktu ISO-8601 murni, format respons dan galat seragam (`{ code, message, requestId, fields }`), serta SDK Client terstruktur (`src/lib/api-client.ts` / `siskaApi`) yang otomatis menangani injeksi Bearer token Firebase Auth tanpa menyentuh `localStorage`.
2. **Untuk Tim AI:** Disediakan kontrak microservice server-to-server yang eksplisit (`src/server/contracts/ai-service.contract.ts`), isolasi penuh dari data kasus sensitif (NFR-PRIV-02), guardrail keamanan terpasang (Prompt Injection & Emergency Escalation), serta **Local Firestore RAG Fallback** yang memungkinkan fitur AI tetap berfungsi normal meskipun microservice Python FastAPI belum dijalankan.
3. **Untuk Keamanan & Kualitas:** 100% skenario pengujian utama pada [`docs/09-TEST-PLAN.md`](./docs/09-TEST-PLAN.md) (AUTH, REP, FILE, CHAT, KB, AI, PRIV, REL) telah memiliki *automated test suite* di `src/tests/unit/backend-test-plan.test.mjs` yang dapat dijalankan secara instan melalui mock Firebase Admin murni.

---

## 2. Rincian Pekerjaan yang Telah Diselesaikan pada Backend

Berikut adalah inventaris modul, fitur, dan logika yang telah tuntas diimplementasikan di sisi backend:

### A. Autentikasi, Otorisasi (RBAC) & Boundary Keamanan
- [x] **Server-Side Token Verification ([`src/server/authz/verify-token.ts`](./src/server/authz/verify-token.ts)):**
  - Ekstraksi dan verifikasi Firebase ID Token melalui Firebase Admin SDK (`verifyIdToken`).
  - Menolak token kedaluwarsa atau dicabut dengan format seragam `401 UNAUTHENTICATED`.
  - Mengambil identitas pemanggil (`uid`, `email`, `role`, `claimVerified`) murni dari token server, bukan dari body permintaan client.
- [x] **Role-Based Access Control (RBAC) & Anti-Privilege Escalation ([`src/server/authz/permissions.ts`](./src/server/authz/permissions.ts)):**
  - Otoritas peran `admin` dikunci secara mutlak hanya untuk token yang memiliki Custom User Claim `role === 'admin'` (`AUTH-04`).
  - Akun pelapor default (`role: 'reporter'`). Akun tanpa peran sah (misalnya akun liar / `seed_outsider`) ditolak secara fail-closed dengan `403 FORBIDDEN`.
- [x] **Anti-IDOR & Uniform 404 Response ([`INDISTINGUISHABLE_NOT_FOUND_MESSAGE`](./src/server/authz/permissions.ts)):**
  - Akses silang akun pada laporan (`reports/{id}`), bukti (`evidence/{id}`), atau percakapan (`conversations/{id}`) selalu menghasilkan HTTP `404 NOT_FOUND` dengan pesan yang 100% identik dengan kondisi data memang tidak ada. Hal ini mencegah penyerang melakukan enumerasi ID resource sensitif (memenuhi `REP-03`, `FILE-03`, `CHAT-02`).
- [x] **Route Handler Security Boundary ([`src/server/authz/route-handler.ts`](./src/server/authz/route-handler.ts)):**
  - Fungsi pembungkus `withAuthenticatedRoute` dan `withVerifiedTokenRoute` yang mengotomatisasi generasi `requestId` (`X-Request-Id`), verifikasi token, pengecekan role, dan penangkapan error global.

---

### B. Layanan Domain Inti (*Core Domain Services*)
Semua logika bisnis berada di [`src/server/services/`](./src/server/services) dan dipisahkan dari controller:

1. **`ReportService` ([`src/server/services/report.service.ts`](./src/server/services/report.service.ts)):**
   - Pembuatan laporan pengaduan (`POST /api/v1/reports`) dengan inisialisasi status `submitted`, perekaman riwayat awal di subkoleksi `statusHistory`, dan pencatatan `auditEvents` dalam satu `WriteBatch` atomik (`REP-01`).
   - Paginasi daftar laporan berbasis cursor (`GET /api/v1/reports`), di mana pelapor hanya melihat laporannya sendiri dan admin melihat laporan sesuai filter status (`FR-008`).
   - Pengambilan detail laporan lengkap beserta subkoleksi bukti privat dan riwayat status (`REP-03`).
   - Transisi status laporan oleh admin (`PATCH /api/v1/reports/{id}`) yang berjalan di dalam **Firestore Transaction (`db.runTransaction`)**. Menegakkan matriks transisi resmi [`docs/01-SRS.md` §7](./docs/01-SRS.md), kewajiban catatan/alasan penolakan atau pembukaan kembali laporan (`isStatusNoteRequired`), pembaruan waktu `resolvedAt`, serta penambahan entri `statusHistory` secara atomik (`REP-05`, `REP-06`).
   - Agregasi statistik laporan (`GET /api/v1/reports/summary`) per status untuk kartu metrik dashboard tanpa mengekspos PII atau narasi sensitif (`FR-005`, `FR-015`).

2. **`EvidenceService` ([`src/server/services/evidence.service.ts`](./src/server/services/evidence.service.ts)):**
   - **Dual-Mode Upload Bukti (`POST /api/v1/reports/{id}/evidence`):**
     1. *Direct Multipart Upload*: Menerima biner via `multipart/form-data` untuk kemudahan implementasi client.
     2. *Two-Phase Signed Upload*: Mode inisiasi metadata yang mengeluarkan `uploadUrl` bertanda tangan berdurasi 5 menit, diikuti tahap finalisasi verifikasi objek di storage sebelum menulis metadata ke Firestore (menghindari metadata yatim).
   - Validasi ketat biner: batas ukuran maksimal 5 MiB (`EVIDENCE_MAX_BYTES`), tipe konten allowlist (`application/pdf`, `image/jpeg`, `image/png`), inspeksi **Magic Bytes / File Signature** (`assertValidFileSignature`) untuk menolak berkas eksekusi yang disamarkan (`FILE-02`), dan perhitungan checksum SHA-256.
   - **Rollback Kompensasi Otomatis (`FILE-04` / `NFR-REL-01`):** Jika penyimpanan metadata ke Firestore gagal setelah berkas tersimpan di Cloud Storage, berkas di storage langsung dihapus secara otomatis.
   - **Otorisasi Unduh Bukti (`GET /api/v1/reports/{id}/evidence/{evidenceId}/download`):** Menolak akses lintas akun dan menerbitkan Signed URL privat berdurasi singkat (maksimal 300 detik / 5 menit) serta mencatat audit trail (`FILE-03`).

3. **`ConversationService` ([`src/server/services/conversation.service.ts`](./src/server/services/conversation.service.ts)):**
   - Pembuatan atau pembukaan kembali ruang percakapan rahasia antara pelapor dan petugas (`POST /api/v1/conversations`). Berjalan di dalam Firestore Transaction dengan ID deterministik (`conv_{uid}_{reportId}`) untuk mencegah *race condition* percakapan ganda (`FR-010`).
   - Paginasi daftar percakapan dan pesan di subkoleksi `messages`.
   - Pengiriman pesan baru (`POST /api/v1/conversations/{id}/messages`) dengan identitas `senderUid` yang diturunkan dari token server (`CHAT-01`).
   - **Auto-Assignment Petugas:** Jika admin membalas percakapan yang belum ditugaskan (`assignedAdminId === null`), percakapan tersebut secara otomatis ditugaskan kepada admin bersangkutan dalam satu transaksi.
   - Pembaruan status percakapan (`open` / `closed`) dan penugasan admin oleh petugas berwenang.

4. **`KnowledgeBaseService` ([`src/server/services/knowledge.service.ts`](./src/server/services/knowledge.service.ts)):**
   - Unggah PDF Knowledge Base resmi oleh admin (`POST /api/v1/admin/knowledge-documents`) dengan verifikasi signature biner `%PDF-`, perhitungan hash SHA-256, dan penyimpanan privat (`KB-01`).
   - **Pipeline Ingestion & Semantic Chunking Lokal:** Mengekstrak teks dari stream PDF, membagi halaman menjadi potongan semantik (~600 kata dengan overlap 80 kata), dan menyimpan ke koleksi `knowledgeChunks` secara otomatis.
   - Siklus status dokumen otomatis: dari `'processing'` bertransisi langsung ke `'indexed'` jika sukses, atau `'failed'` (`errorCode: 'PDF_PARSE_FAILED'`) jika struktur PDF rusak.
   - Penghapusan dokumen (`DELETE /api/v1/admin/knowledge-documents/{id}`) yang membersihkan berkas biner di Cloud Storage, dokumen metadata, dan seluruh dokumen `knowledgeChunks` terkait secara menyeluruh (`KB-03`).
   - Reindex idempoten (`POST /api/v1/admin/knowledge-documents/reindex`) yang memproses ulang PDF dari Cloud Storage.

5. **`AiGatewayService` ([`src/server/services/ai.service.ts`](./src/server/services/ai.service.ts)):**
   - Gerbang tanya jawab informasi umum SISKA AI (`POST /api/v1/ai/chat`).
   - **Isolasi Privasi Mutlak (`NFR-PRIV-02` / `AI-04`):** AI Gateway tidak pernah membaca atau meneruskan data dari koleksi `reports`, `evidence`, atau `conversations`.
   - **Guardrail Keamanan:**
     - *Prompt Injection Filter* (`AI-03`): Memfilter pola manipulasi instruksi baik pada pertanyaan pengguna maupun pada isi dokumen PDF.
     - *Private Data Request Filter* (`AI-04`): Menolak permintaan data laporan orang lain atau kredensial sistem.
     - *Emergency Safety Gate* (`AI-05`): Mendeteksi kondisi darurat/bahaya dan mengembalikan pesan eskalasi resmi tanpa mengarang nomor kontak kampus.
   - **Local Firestore RAG Fallback:** Jika microservice FastAPI belum aktif, gateway menjalankan retrieval kata kunci terverifikasi dari `knowledgeDocuments` (`status == 'indexed'`) dan `knowledgeChunks`, lengkap dengan validasi relevansi (*Relevance Gate*) dan abstensi (*Abstention Gate* jika bukti tidak cukup — `AI-02`).

6. **`ProfileService` ([`src/server/services/profile.service.ts`](./src/server/services/profile.service.ts)):**
   - Inisialisasi profil pengguna baru saat registrasi (`POST /api/v1/profile`), menetapkan `role: 'reporter'` di Firestore dan Custom Claim Firebase Auth (`AUTH-01`).
   - Pengambilan profil pengguna aktif (`GET /api/v1/profile` / `/api/v1/users/me`).
   - Pembaruan profil terkunci (`PATCH /api/v1/profile`), hanya mengizinkan pengubahan `displayName`. Field `role`, `uid`, `email`, dan `createdAt` dikunci ketat (`AUTH-04`).

7. **`AuditService` ([`src/server/services/audit.service.ts`](./src/server/services/audit.service.ts)):**
   - Pencatatan log audit terstruktur (`auditEvents`) untuk setiap aksi administratif dan perubahan data penting (`FR-013`).
   - Mendukung eksekusi di dalam `Transaction`, `WriteBatch`, maupun *standalone*.
   - Mematuhi prinsip minimisasi data (`NFR-OBS-01` / `PRIV-01`): log hanya memuat 6 atribut kanonis (`actorUid`, `action`, `targetType`, `targetId`, `occurredAt`, `requestId`) tanpa narasi laporan, kata sandi, token, atau URL bertanda tangan.
   - Endpoint riwayat audit khusus admin (`GET /api/v1/admin/audit-events`).

---

### C. Validasi Skema, Sanitasi & Rate Limiting
- [x] **Schema Allowlist Enforcer ([`src/server/validators/common.ts`](./src/server/validators/common.ts)):**
  - Fungsi `assertAllowlistedKeys` menolak permintaan yang menyertakan properti di luar skema OpenAPI (`04-API-SPEC.yaml`).
  - Secara eksplisit memblokir upaya injeksi kunci otoritas (`role`, `claims`, `reporterId`, `senderUid`, `actorUid`, `createdAt`, `resolvedAt`).
- [x] **Server-Side Rate Limiter ([`src/server/rate-limit/limiter.ts`](./src/server/rate-limit/limiter.ts)):**
  - Menerapkan pembatasan laju per UID/aksi dengan algoritma *sliding window* in-memory.
  - Kebijakan aktif: pembuatan laporan (10 req/menit), unggah bukti (15 req/menit), chat (30 req/menit), tanya jawab AI (20 req/menit), dan mutasi admin (30 req/menit).
  - Melempar galat `429 RATE_LIMITED` lengkap dengan header `Retry-After` sesuai spesifikasi HTTP.
- [x] **Error Boundary & Serializer ([`src/server/errors/api-error.ts`](./src/server/errors/api-error.ts)):**
  - Mengonversi semua kesalahan menjadi format JSON terstandarisasi `{ code, message, requestId, fields? }`.
  - Mencegah kebocoran stack trace atau informasi sensitif database pada kode status 500 (`INTERNAL_ERROR`).

---

### D. Kontrak Integrasi & SDK Client
- [x] **DTO Contracts Murni ([`src/types/api.ts`](./src/types/api.ts)):**
  - Seluruh tipe transfer data (`SerializedReport`, `SerializedEvidenceItem`, `SerializedConversation`, `AiChatResponse`, dll.) telah didefinisikan secara mandiri tanpa dependensi backend.
- [x] **Backend API Manifest ([`src/server/contracts/backend-api.manifest.ts`](./src/server/contracts/backend-api.manifest.ts)):**
  - Dokumentasi TypeScript berkode sumber yang mendaftarkan seluruh 24 endpoint backend `/api/v1/*`, metode HTTP, aturan kepemilikan, dan kebijakan otorisasi.
- [x] **AI Microservice Contract ([`src/server/contracts/ai-service.contract.ts`](./src/server/contracts/ai-service.contract.ts)):**
  - Kontrak server-to-server FastAPI RAG lengkap dengan endpoint, header, adapter pemanggil berbasis `fetch` dengan batas waktu ketat (`AbortSignal.timeout` — `REL-01`), dan penanganan fallback.
- [x] **Strongly-Typed Client SDK ([`src/lib/api-client.ts`](./src/lib/api-client.ts)):**
  - Objek `siskaApi` yang siap diimpor oleh tim Frontend dengan metode panggilan bawaan (`health`, `profile`, `reports`, `evidence`, `conversations`, `ai`, `admin`).

---

### E. Aturan Keamanan Firebase (*Security Rules*) & Basis Data
- [x] **Firestore Security Rules ([`firestore.rules`](./firestore.rules)):**
  - Menerapkan kebijakan *default-deny*.
  - Melindungi koleksi `users`, `reports`, `conversations`, `messages`, `knowledgeDocuments`, `knowledgeChunks`, dan `auditEvents`.
  - Memastikan subkoleksi `evidence` dan `statusHistory` hanya dapat ditulis oleh Admin SDK tepercaya.
  - Memvalidasi kepemilikan data pengguna pada level database sebagai lapisan pertahanan ganda (*defense-in-depth*).
- [x] **Storage Security Rules ([`storage.rules`](./storage.rules)):**
  - Menegakkan privasi bucket (tanpa akses publik langsung).
  - Membatasi ukuran berkas maksimal 5 MiB untuk bukti dan 25 MiB untuk dokumen knowledge base admin.
  - Menerapkan allowlist tipe MIME berkas di level Firebase Storage.
- [x] **Composite Indexes ([`firestore.indexes.json`](./firestore.indexes.json)):**
  - Menyiapkan konfigurasi indeks komposit Firestore untuk query laporan terurut berdasarkan waktu dan status, query percakapan per pelapor/admin, dan pencarian dokumen knowledge base.

---

### F. Pengujian Otomatis & Dataset Sintetis
- [x] **Synthetic Seeder ([`seed-data.mjs`](./seed-data.mjs) & [`seed.mjs`](./seed.mjs)):**
  - Generator data uji deterministik dan idempoten untuk Firebase Auth (pengguna + custom claims), Firestore, dan Cloud Storage.
  - 100% data sintetis: tidak memuat data pribadi atau identitas nyata.
  - Dilengkapi mode pengujian skenario berbahaya (`--with-adversarial` untuk payload XSS dan prompt injection).
- [x] **Backend Automated Test Plan ([`src/tests/unit/backend-test-plan.test.mjs`](./src/tests/unit/backend-test-plan.test.mjs)):**
  - Pengujian unit otomatis (784 baris kode) yang memverifikasi skenario `docs/09-TEST-PLAN.md`:
    - `AUTH-01..04`: Registrasi, profil, penolakan privilege escalation `role=admin`.
    - `REP-01..06`: Pembuatan laporan, penolakan IDOR, validasi transisi status sah & ilegal.
    - `FILE-01..04`: Upload berkas, inspeksi signature, kompensasi pembatalan upload gagal.
    - `CHAT-01..03`: Hak akses partisipan obrolan, penolakan nonpartisipan.
    - `KB-01..03`: Ingestion PDF, penolakan akses non-admin, pembersihan berkas & chunk saat dihapus.
    - `AI-01..05`: Jawaban terverifikasi, abstensi saat bukti kurang, pencegahan kebocoran data kasus, eskalasi darurat, dan timeout fallback.
    - `PRIV-01`: Sanitasi audit event tanpa PII.

---

## 3. Matriks Keselarasan terhadap Dokumen Acuan Mutlak (`docs/`)

| File Dokumen | Spesifikasi Utama | Status di Backend | Bukti Kode Implementasi |
| :--- | :--- | :---: | :--- |
| `01-SRS.md` | FR-001 s/d FR-016, Aturan Status §7 | **Terpenuhi** | `src/server/services/report.service.ts`, `src/types/domain.ts` |
| `02-ERD.md` | Model Entitas & Kardinalitas Firestore | **Terpenuhi** | `src/types/domain.ts`, `src/lib/firebase/firestore.ts` |
| `03-DATABASE-SCHEMA.sql` | Penegasan NoSQL Firestore (Bukan SQL) | **Terpenuhi** | Menggunakan Google Cloud Firestore secara penuh |
| `04-API-SPEC.yaml` | OpenAPI 3.1.0 Contract (`/api/v1/*`) | **Terpenuhi** | `src/app/api/v1/**/route.ts`, `src/server/contracts/backend-api.manifest.ts` |
| `05-BACKEND-ARCHITECTURE.md` | 7-Step Request Flow, Layering, Error Format | **Terpenuhi** | `src/server/authz/route-handler.ts`, `src/server/errors/api-error.ts` |
| `06-AI-ARCHITECTURE.md` | Server-to-Server FastAPI RAG Contract & Safety | **Terpenuhi** | `src/server/contracts/ai-service.contract.ts`, `src/server/services/ai.service.ts` |
| `07-FRONTEND-ARCHITECTURE.md` | DTOs, State Boundary, No Tokens in LocalStorage | **Terpenuhi** | `src/types/api.ts`, `src/lib/api-client.ts` |
| `08-AUTHORIZATION-MATRIX.md` | RBAC, Custom Claims Admin, Default-Deny | **Terpenuhi** | `src/server/authz/permissions.ts`, `firestore.rules` |
| `09-TEST-PLAN.md` | Automated Verification Plan | **Terpenuhi** | `src/tests/unit/backend-test-plan.test.mjs` |
| `10-DEVELOPMENT-ROADMAP.md` | Milestones 1–4 Backend Deliverables | **Sesuai Target** | Fondasi, Laporan, Bukti, Chat, dan Integrasi AI selesai |

---

## 4. Panduan untuk Tim yang Belum Selesai (Frontend & AI)

### A. Untuk Tim Frontend
1. **Gunakan SDK Bawaan:** Tim Frontend tidak perlu menulis `fetch` manual. Cukup impor `siskaApi` dari `@/lib/api-client`:
   ```typescript
   import { siskaApi } from '@/lib/api-client';

   // Mengambil daftar laporan berpaginasi
   const reports = await siskaApi.reports.list({ limit: 10, status: 'submitted' });

   // Mengirim pertanyaan ke SISKA AI
   const aiAnswer = await siskaApi.ai.ask('Bagaimana alur pengaduan di SISKA?');
   ```
2. **Jangan Simpan Token di LocalStorage:** Sesuai prinsip keamanan backend dan SRS, token sesi ditangani langsung di memori oleh Firebase Auth Client SDK (`auth.currentUser.getIdToken()`).
3. **Penanganan Status Laporan di UI:**
   Gunakan status kanonis berikut pada filter dan formulir:
   - `'submitted'` = Laporan Diterima (Menunggu Verifikasi)
   - `'under_review'` = Dalam Tinjauan Petugas
   - `'in_progress'` = Sedang Ditindaklanjuti
   - `'resolved'` = Selesai
   - `'rejected'` = Ditolak (Memerlukan catatan alasan)

### B. Untuk Tim AI
1. **Implementasikan Microservice FastAPI Sesuai Kontrak:**
   Rujuk file [`src/server/contracts/ai-service.contract.ts`](./src/server/contracts/ai-service.contract.ts). Endpoint yang harus disiapkan di FastAPI:
   - `GET /health`
   - `POST /chat` (menerima `{ message, conversationId? }`, mengembalikan `{ answer, grounded, sources, escalationMessage? }`)
   - `POST /admin/documents` (antrean ingesti biner PDF ke embedding)
   - `DELETE /admin/documents/{id}` (hapus entri indeks vektor dokumen)
   - `POST /admin/reindex` (reindex idempoten)
2. **Validasi Header:** Pastikan FastAPI memvalidasi header `X-Service-Authorization` yang dikirim dari Next.js backend.
3. **Jangan Akses Koleksi Laporan Kasus:** Microservice AI tidak diberikan akses ke data kasus pribadi atau laporan pengguna (`NFR-PRIV-02`).

---

## 5. Kesimpulan & Langkah Selanjutnya

Struktur backend SISKA saat ini telah **berdiri kokoh, lengkap, aman, dan tervariasi penuh**. Fondasi ini memberikan kepastian kontrak (*contract stability*) sehingga tim Frontend dan tim AI dapat bekerja secara paralel tanpa takut terjadi perubahan skema data yang mendadak.

**Langkah Rekomendasi Terdekat bagi Backend Engineer:**
1. Mendampingi tim Frontend saat menghubungkan form laporan dan halaman dashboard ke `siskaApi`.
2. Menyediakan *realtime listener helper* untuk percakapan obrolan langsung di sisi client.
3. Menjalankan verifikasi integrasi saat container microservice Python FastAPI mulai dihubungkan ke backend via variabel lingkungan `AI_SERVICE_URL`.

