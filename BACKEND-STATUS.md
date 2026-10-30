# SISKA — Laporan Kesiapan & Dokumentasi Teknis Backend

**Sistem:** SISKA (Sistem Pengaduan Kekerasan Seksual)  
**Fokus Dokumen:** Dokumentasi Informatif Status Pengerjaan & Kesiapan Layanan Backend  
**Dokumen Acuan:** [`docs/`](./docs) (`01-SRS.md` s/d `10-DEVELOPMENT-ROADMAP.md`)  
**Status Ekosistem:** Siap Digunakan & Teruji di Lingkungan Firebase Emulator Lokal  

---

## 1. Pengantar & Gambaran Umum

Dokumen ini disusun sebagai media informasi transparan mengenai status pengembangan sisi **Backend SISKA**. Tujuannya adalah memberikan gambaran menyeluruh mengenai fondasi yang telah dibangun, modul layanan yang telah aktif, ketersediaan data uji lokal, serta referensi endpoint API yang siap.

Seluruh arsitektur backend telah dimigrasikan secara penuh dari dependensi lama (Supabase/PostgreSQL) ke ekosistem terpadu **Next.js App Router (Route Handlers) + Firebase Admin SDK + Cloud Firestore + Cloud Storage**, dengan menerapkan prinsip *Clean Layered Architecture*, keamanan berbasis hak akses (*Role-Based Access Control*), dan integritas data atomik.

---

## 2. Status Lingkungan Emulator Lokal & Data Seed (Port 8085)

Untuk mendukung proses pengembangan dan pengujian lokal yang aman, Firebase Emulator Suite telah disiapkan dan dikonfigurasi secara penuh di mesin lokal:

### A. Konfigurasi Port Layanan Emulator
Layanan emulator berjalan pada port berikut (didefinisikan di [`firebase.json`](./firebase.json)):
* **Firebase Authentication:** `127.0.0.1:9099`
* **Cloud Firestore:** `127.0.0.1:8085` *(dipindahkan dari port default 8080 untuk menjamin kebebasan socket dari reservasi Windows NAT/Hyper-V)*
* **Cloud Storage:** `127.0.0.1:9199`
* **Emulator UI Dashboard:** `http://127.0.0.1:4000` *(dapat diakses via browser untuk memantau data secara visual)*

### B. Hasil Eksekusi Data Seeder (`npm run seed`)
Skrip seeder lokal ([`seed.mjs`](./seed.mjs) & [`seed-data.mjs`](./seed-data.mjs)) telah berhasil dieksekusi ke dalam emulator suite dengan rincian data sintetis yang terinjeksi:
* **Pengguna Auth:** 5 akun uji dengan penetapan Custom User Claims (`admin` / `reporter`).
* **Koleksi `users`:** 4 dokumen profil pengguna.
* **Koleksi `reports`:** 8 laporan kasus yang mencakup seluruh variasi status kanonis (`submitted`, `under_review`, `in_progress`, `resolved`, `rejected`, serta laporan yang dibuka kembali).
* **Subkoleksi `statusHistory`:** 23 riwayat perubahan status berantai.
* **Subkoleksi `evidence` & Berkas Storage:** 4 metadata bukti dan 8 file biner nyata (format PDF, PNG, JPEG) di Cloud Storage privat dengan verifikasi SHA-256 dan byte array.
* **Koleksi `conversations` & `messages`:** 4 ruang obrolan rahasia dan 12 pesan kronologis.
* **Koleksi `knowledgeDocuments` & `knowledgeChunks`:** 4 dokumen referensi KB dan 7 potongan teks semantik untuk asisten AI.
* **Koleksi `auditEvents`:** 23 log audit terstruktur tanpa PII.

### C. Akun Uji Coba Siap Pakai (Password: `SiskaDemo#2026`)
| Email | Peran / Custom Claim | UID | Keterangan Data |
| :--- | :--- | :--- | :--- |
| `admin.a@siska.test` | `admin` | `seed_admin_1` | Petugas admin utama yang menangani kasus & chat |
| `admin.b@siska.test` | `admin` | `seed_admin_2` | Petugas admin pendamping |
| `reporter.a@siska.test` | `reporter` | `seed_reporter_a` | Pelapor A (memiliki 5 laporan & riwayat chat) |
| `reporter.b@siska.test` | `reporter` | `seed_reporter_b` | Pelapor B (memiliki 3 laporan) |
| `outsider@siska.test` | *(tanpa peran)* | `seed_outsider` | Akun umum untuk simulasi penolakan akses |

---

## 3. Katalog Endpoint API Backend (`/api/v1/*`)

Seluruh endpoint backend telah aktif di [`src/app/api/v1/`](./src/app/api/v1) dan didaftarkan pada manifes kontrak [`src/server/contracts/backend-api.manifest.ts`](./src/server/contracts/backend-api.manifest.ts). Seluruh endpoint merespons dengan format envelope standard:
* **Berhasil:** `{ data: T, requestId: string }`
* **Gagal:** `{ code: ApiErrorCode, message: string, requestId: string, fields?: Record<string, string> }`

Berikut adalah rincian endpoint yang dipaparkan terpisah sesuai kebutuhan integrasi:

---

### A. Endpoint untuk Integrasi Aplikasi Web (Frontend)

Endpoint berikut siap dipanggil oleh antarmuka pengguna web menggunakan Firebase ID Token (`Authorization: Bearer <token>`):

#### 1. Modul Profil Pengguna (`/api/v1/profile` & `/api/v1/users`)
* **`GET /api/v1/profile`** (atau `/api/v1/users/me`): Mengambil data profil pengguna yang sedang login (`uid`, `displayName`, `email`, `role`).
* **`POST /api/v1/profile`**: Menginisialisasi dokumen profil awal saat registrasi baru (otomatis menetapkan `role: 'reporter'`).
* **`PATCH /api/v1/profile`**: Memperbarui field profil yang diizinkan (`displayName`). Field sensitif seperti `role`, `uid`, dan `email` terkunci dari pengubahan langsung.

#### 2. Modul Pelaporan & Dashboard Kasus (`/api/v1/reports`)
* **`GET /api/v1/reports`**: Mengambil daftar laporan berpaginasi cursor (`limit`, `cursor`, `status`).  
  * *Pelapor:* Hanya melihat daftar laporan miliknya sendiri.  
  * *Admin:* Melihat seluruh laporan kampus sesuai filter status.
* **`POST /api/v1/reports`**: Membuat laporan pengaduan baru. Menginisialisasi status awal `submitted`, mencatat riwayat pertama di `statusHistory`, dan merekam log audit secara atomik.
* **`GET /api/v1/reports/summary`**: Mengambil ringkasan jumlah laporan per status (`submitted`, `under_review`, `in_progress`, `resolved`, `rejected`) untuk statistik kartu dashboard.
* **`GET /api/v1/reports/{id}`**: Mengambil detail lengkap satu laporan, mencakup data kasus, daftar metadata bukti privat, dan riwayat status berantai. Dilengkapi proteksi Anti-IDOR (uniform 404 jika diakses pihak tidak berwenang).
* **`PATCH /api/v1/reports/{id}`** (atau `/api/v1/reports/{id}/status`): Memperbarui status laporan oleh Admin via transaksi database atomik. Menegakkan matriks transisi resmi [`docs/01-SRS.md` §7](./docs/01-SRS.md) dan kewajiban catatan alasan saat penolakan atau pembukaan kembali kasus.

#### 3. Modul Bukti Kasus Privat (`/api/v1/reports/{id}/evidence`)
* **`POST /api/v1/reports/{id}/evidence`**: Mengunggah berkas bukti pendukung (mendukung direct upload `multipart/form-data` maupun 2-phase signed upload JSON). Dilengkapi validasi Magic Bytes berkas (PDF, PNG, JPEG), batas maksimal 5 MiB, dan rollback otomatis jika database gagal mencatat metadata.
* **`GET /api/v1/reports/{id}/evidence/{evidenceId}/download`**: Mengajukan tautan unduh bukti. Memeriksa kepemilikan kasus dan menerbitkan Signed URL Cloud Storage berdurasi singkat (maksimal 5 menit / 300 detik).

#### 4. Modul Obrolan Rahasia Pelapor–Petugas (`/api/v1/conversations`)
* **`GET /api/v1/conversations`**: Mengambil daftar ruang percakapan yang diikuti oleh pengguna atau yang ditugaskan kepada petugas.
* **`POST /api/v1/conversations`**: Membuat atau membuka ruang percakapan rahasia terkait laporan kasus (menggunakan ID transaksi deterministik `conv_{uid}_{reportId}` untuk mencegah percakapan ganda).
* **`GET /api/v1/conversations/{id}`**: Mengambil metadata ruang percakapan.
* **`PATCH /api/v1/conversations/{id}`**: Memperbarui status percakapan (`open`/`closed`) atau mengubah penugasan admin.
* **`GET /api/v1/conversations/{id}/messages`**: Mengambil riwayat pesan obrolan berpaginasi kronologis.
* **`POST /api/v1/conversations/{id}/messages`**: Mengirim pesan obrolan baru. Identitas pengirim (`senderUid`) diturunkan langsung dari token server (mencegah pemalsuan identitas) dan otomatis menugaskan admin jika pesan dibalas oleh petugas.

#### 5. Modul Asisten Informasi SISKA AI (`/api/v1/ai/chat`)
* **`POST /api/v1/ai/chat`**: Mengajukan pertanyaan seputar informasi umum/SOP penanganan kekerasan seksual kampus. Backend otomatis menyaring potensi manipulasi prompt (*Prompt Injection Filter*), mengarahkan ke kontak resmi jika terdeteksi situasi genting (*Emergency Escalation Gate*), dan mengisolasi penuh agar AI tidak pernah menyentuh data kasus pribadi (*Privacy Boundary*).

#### 6. Modul Administrasi Dokumen KB & Audit (`/api/v1/admin/*`)
* **`GET /api/v1/admin/knowledge-documents`**: Mengambil daftar berkas panduan/SOP resmi yang diunggah ke Knowledge Base.
* **`POST /api/v1/admin/knowledge-documents`**: Mengunggah dokumen PDF resmi baru untuk diproses ke dalam potongan teks (*semantic chunking*).
* **`DELETE /api/v1/admin/knowledge-documents/{documentId}`**: Menghapus dokumen PDF beserta seluruh potongan chunk dan index terkait secara bersih.
* **`POST /api/v1/admin/knowledge-documents/reindex`**: Memproses ulang pengindeksan dokumen dari Cloud Storage.
* **`GET /api/v1/admin/audit-events`** (atau `/api/v1/admin/audit`): Mengambil daftar log riwayat audit aktivitas sensitif sistem (khusus admin).

---

### B. Spesifikasi Kontrak untuk Layanan Microservice AI (Python FastAPI)

Untuk integrasi antara Next.js Backend dengan Microservice RAG Python FastAPI, backend telah menyiapkan adapter pemanggil berbasis server-to-server di [`src/server/contracts/ai-service.contract.ts`](./src/server/contracts/ai-service.contract.ts).

Spesifikasi endpoint FastAPI yang dihubungkan melalui variabel lingkungan `AI_SERVICE_URL`:

| Endpoint FastAPI | Metode | Payload Masuk | Respons Diharapkan | Keterangan & Batas Keamanan |
| :--- | :---: | :--- | :--- | :--- |
| `/health` | `GET` | — | `{"status": "ok"}` | Pengecekan kesiapan layanan RAG |
| `/chat` | `POST` | `{"message": string, "conversationId"?: string}` | `{"answer": string, "grounded": boolean, "sources": Array<{title, page, textSnippet}>, "escalationMessage"?: string}` | Menjawab hanya berbasis dokumen terverifikasi; wajib abstain jika bukti kurang (`AI-02`) |
| `/admin/documents` | `POST` | `{"documentId": string, "title": string, "storagePath": string}` | `{"status": "queued", "documentId": string}` | Antrean pemrosesan embedding biner PDF |
| `/admin/documents/{id}` | `DELETE` | Path parameter `id` | `{"status": "deleted", "documentId": string}` | Penghapusan entri vektor dokumen |
| `/admin/reindex` | `POST` | — | `{"status": "completed", "indexedCount": number}` | Reindex vektor idempoten |

#### Karakteristik & Mekanisme Pengaman pada AI Gateway:
1. **Keamanan Server-to-Server:** Setiap panggilan dari Next.js backend ke FastAPI menyertakan header proteksi `X-Service-Authorization: Bearer <AI_SERVICE_SECRET>`.
2. **Batas Waktu Ketat (*Timeout Resilience* — `REL-01`):** Permintaan ke FastAPI dibatasi timeout maksimal 5000 ms (5 detik) via `AbortSignal.timeout`.
3. **Local Firestore RAG Fallback:** Jika microservice FastAPI belum aktif atau mengalami gangguan koneksi, backend Next.js otomatis menjalankan pencarian kata kunci terverifikasi langsung pada koleksi `knowledgeDocuments` dan `knowledgeChunks` di Firestore, sehingga fitur tanya jawab tetap merespons dengan aman.
4. **Isolasi Privasi Kasus Mutlak (`NFR-PRIV-02`):** Microservice AI tidak diberikan akses atau koneksi apa pun ke koleksi laporan kasus (`reports`), berkas bukti (`evidence`), maupun percakapan warga (`conversations`).

---

## 4. Rangkuman Pilar Arsitektur & Logika Bisnis yang Telah Aktif

Berikut adalah ikhtisar teknis mengenai apa saja yang telah dibangun di lapisan backend:

1. **Clean Layered Architecture:**
   * Pemisahan tegas antara Route Handlers (`src/app/api/v1/`), Lapisan Otorisasi (`src/server/authz/`), Layanan Domain Inti (`src/server/services/`), Validator Skema (`src/server/validators/`), dan Model Data (`src/types/`).
2. **Integritas Transaksi Atomik:**
   * Penggunaan Firestore `WriteBatch` dan `db.runTransaction` memastikan tidak ada data setengah tersimpan pada mutasi laporan, riwayat status, dan ruang obrolan.
3. **Perlindungan Berkas Privat & Rollback Kompensasi:**
   * Verifikasi Magic Bytes biner mencegah penyamaran ekstensi berkas.
   * Mekanisme pembatalan otomatis (*compensating cleanup*): jika metadata gagal dicatat ke Firestore setelah biner terunggah ke Storage, file di Storage langsung dihapus otomatis guna mencegah file sampah tak bertuan.
4. **Minimasi Data pada Log Audit (`auditEvents`):**
   * Log audit keamanan hanya mencatat 6 field kanonis (`actorUid`, `action`, `targetType`, `targetId`, `occurredAt`, `requestId`) tanpa menyertakan narasi laporan atau data sensitif korban (`NFR-OBS-01`).
5. **Rate Limiting Server-Side:**
   * Algoritma *sliding window* in-memory membatasi laju request per UID/IP untuk pembuatan laporan (10/menit), unggah bukti (15/menit), chat (30/menit), dan tanya jawab AI (20/menit).


