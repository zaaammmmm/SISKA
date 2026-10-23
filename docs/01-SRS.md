# SISKA — Software Requirements Specification (SRS)

**Nama:** SISKA (Sistem Pengaduan Kekerasan Seksual)  
**Organisasi sasaran:** UIN Sunan Kalijaga Yogyakarta  
**Versi:** 1.0-draft | **Status:** Baseline engineering; perlu validasi pemilik proses dan unit resmi kampus

## 1. Tujuan dan ruang lingkup
SISKA adalah aplikasi web responsif untuk menerima dan mengelola pengaduan kekerasan seksual, memfasilitasi pemantauan status dan komunikasi pelapor–admin, serta menyediakan asisten informasi berbasis Retrieval-Augmented Generation (RAG) yang menjawab berdasarkan knowledge base terverifikasi. SISKA mendukung administrasi dan bukan pengganti unit resmi penanganan, konseling profesional, layanan darurat, atau proses hukum.

## 2. Prinsip desain
- Privacy-by-design, least privilege, secure-by-default, dan minimisasi data.
- Jangan menjanjikan anonim penuh jika akun, metadata, atau identitas masih diproses. Sebut layanan sebagai rahasia hanya setelah kontrol dan prosedur terbukti.
- AI hanya untuk informasi faktual umum; tidak mendiagnosis, memutuskan validitas laporan, menentukan sanksi, atau menggantikan manusia.
- Lampiran bukti selalu privat. Akses file melalui otorisasi dan URL bertanda tangan yang singkat masa berlakunya.
- Catat perubahan status dan akses administratif yang relevan tanpa menyalin isi sensitif secara berlebihan ke log.

## 3. Aktor
1. **Pelapor/pengguna terautentikasi:** mengelola profil, membuat laporan, melihat laporan miliknya, mengunggah bukti, berkomunikasi dengan admin, dan menggunakan SISKA AI.
2. **Admin/petugas berwenang:** meninjau laporan, memperbarui status, membaca dan membalas percakapan yang menjadi kewenangannya, serta mengelola dokumen knowledge base.
3. **AI service:** layanan mesin yang mengambil potongan dokumen terverifikasi dan menghasilkan jawaban; bukan aktor manusia dan tidak mempunyai akses langsung ke seluruh laporan.
4. **Penyedia identitas/storage/LLM:** layanan eksternal yang harus dibatasi melalui konfigurasi dan kontrak data yang disetujui.

## 4. Batas ruang lingkup
### Termasuk
Halaman publik; registrasi/login/logout; pemulihan kata sandi; persetujuan syarat dan privasi; dashboard pengguna/admin; formulir laporan; bukti opsional; daftar/detail/status laporan; chat pengguna–admin; SISKA AI dengan riwayat lokal atau penyimpanan server yang disetujui; unggah/daftar/hapus/reindex PDF knowledge base oleh admin; audit aktivitas penting; pengujian fungsional, akses, keamanan dasar, dan usability.

### Tidak termasuk tanpa persetujuan tambahan
Penetapan kebenaran laporan otomatis; diagnosis psikologis; penanganan kasus secara hukum; pengambilan keputusan sanksi; layanan darurat; penjadwalan konseling produksi; portal psikolog; anonimitas penuh; integrasi sistem kampus; AI yang membaca laporan/bukti pribadi; klaim ketersediaan 24/7 atau end-to-end encryption yang belum dibuktikan.

## 5. Kebutuhan fungsional
- **FR-001 Public pages:** pengunjung dapat membaca deskripsi layanan, batas layanan, kebijakan privasi, kontak resmi yang disahkan, dan navigasi autentikasi.
- **FR-002 Registration:** pengguna dapat membuat akun menggunakan field yang ditetapkan pemilik layanan; validasi server-side dan verifikasi email jika dikonfigurasi.
- **FR-003 Authentication:** login/logout dan pemulihan kata sandi bekerja; sesi divalidasi di server; pesan error tidak membocorkan keberadaan akun.
- **FR-004 Role assignment:** pengguna tidak dapat menaikkan role sendiri. Admin dibuat melalui proses provisioning tepercaya.
- **FR-005 User dashboard:** menampilkan ringkasan hanya dari laporan milik pengguna.
- **FR-006 Create report:** pengguna terautentikasi mengirim kategori, waktu kejadian bila diketahui, lokasi/deskripsi sesuai kebutuhan minimum, dan persetujuan yang relevan. Field sensitif yang tidak diperlukan tidak dikumpulkan.
- **FR-007 Evidence:** unggah bukti opsional dengan daftar tipe/ukuran yang diizinkan; file privat; akses download diperiksa pada setiap permintaan.
- **FR-008 Report list/detail:** pengguna hanya dapat melihat laporan miliknya; admin hanya melihat laporan sesuai mandat dan kebijakan akses.
- **FR-009 Status lifecycle:** admin berwenang mengubah status melalui transisi yang ditetapkan; setiap perubahan mencatat aktor, waktu, status lama/baru, dan catatan yang aman.
- **FR-010 Chat:** pengguna dan admin dapat mengirim/membaca pesan hanya pada percakapan yang sah; realtime tidak melewati aturan akses.
- **FR-011 SISKA AI:** pengguna mengajukan pertanyaan umum; service melakukan retrieval dari dokumen yang disetujui, menjawab dengan sumber/rujukan dokumen jika tersedia, dan abstain jika bukti tidak cukup.
- **FR-012 KB management:** admin berwenang mengunggah, melihat, menghapus, dan reindex PDF; setiap dokumen memiliki status pemrosesan dan asal/sumber.
- **FR-013 Audit:** aktivitas penting (perubahan status, perubahan dokumen KB, perubahan hak akses) dicatat dengan akses terbatas.
- **FR-014 Profile:** pengguna mengelola field profil yang diperbolehkan, tanpa dapat mengubah role atau ID internal.
- **FR-015 Admin dashboard:** statistik agregat tidak menampilkan data identitas jika tidak diperlukan.
- **FR-016 Error handling:** kegagalan transaksi, upload, indexing, dan AI disampaikan dengan pesan aman dan dapat ditindaklanjuti.

## 6. Kebutuhan nonfungsional
- **NFR-SEC-01:** seluruh akses data sensitif ditolak secara default dan diuji lintas akun.
- **NFR-SEC-02:** tidak ada service-role key, LLM key, atau credential admin pada bundle/browser.
- **NFR-SEC-03:** validasi input, rate limit, proteksi upload, output encoding, CSRF sesuai pola sesi, dan mitigasi OWASP Top 10.
- **NFR-PRIV-01:** retensi, penghapusan, ekspor, tujuan pemrosesan, dan akses petugas harus ditetapkan pemilik layanan sebelum produksi.
- **NFR-PRIV-02:** data laporan/bukti tidak dikirim ke AI secara default.
- **NFR-PERF-01:** target awal pengujian: p95 endpoint CRUD non-upload < 1.5 detik pada dataset dan lingkungan uji yang disepakati; ini target uji, bukan klaim SLA.
- **NFR-UX-01:** tugas inti dapat diselesaikan pengguna uji tanpa hambatan kritis; ukur dengan skenario tugas dan SUS bila disetujui.
- **NFR-RESP-01:** halaman inti diuji pada viewport mobile 360px dan desktop 1280px ke atas.
- **NFR-REL-01:** proses multi-langkah memiliki rollback/kompensasi untuk menghindari laporan tanpa file metadata atau file yatim.
- **NFR-AI-01:** jawaban menyertakan rujukan yang relevan atau menyatakan tidak tahu; pengujian prompt injection dan pertanyaan di luar KB wajib.
- **NFR-OBS-01:** log terstruktur tidak memuat password, token, kronologi, isi pesan, signed URL, atau isi bukti.

## 7. Aturan bisnis dan status
Status kanonis yang disarankan: `submitted` → `under_review` → `in_progress` → `resolved`; `rejected` hanya setelah alasan administratif dan kewenangan disetujui. `submitted` dapat menjadi `under_review`; `under_review` dapat menjadi `in_progress`, `resolved`, atau `rejected`; `in_progress` dapat menjadi `resolved` atau kembali ke `under_review` dengan catatan; terminal `resolved/rejected` hanya dapat dibuka ulang oleh admin berwenang dengan alasan. Pemilik proses wajib menyetujui istilah/status sebelum implementasi.

## 8. Data utama
User profile, reports, evidence metadata, report status history, conversations, messages, knowledge-base documents, chunks/embeddings, and audit events. Model logis lengkap ada di `02-ERD.md`; Firebase/Firestore adalah pilihan kanonis sesuai proposal. `03-DATABASE-SCHEMA.sql` hanya menjelaskan bahwa Firestore tidak memakai SQL; SISKA tidak menggunakan PostgreSQL/Supabase.

## 9. Integrasi dan teknologi
- Web: Next.js App Router, React, TypeScript, Tailwind CSS.
- Backend: Next.js Route Handlers untuk domain API; Firebase Authentication, Firestore, Cloud Storage, Security Rules, dan Emulator Suite sesuai proposal.
- AI: service Python FastAPI terpisah (`/health`, `/chat`, endpoint admin KB); pipeline RAG, embedding Qwen3-Embedding-0.6B sesuai proposal, vector index dapat berupa FAISS/Chroma pada prototipe atau layanan terkelola setelah evaluasi.
- LLM: provider dapat diganti melalui konfigurasi server; provider/model final belum dipatok dan harus dipilih setelah uji privasi, biaya, latency, dan kualitas.
- Version control/manajemen: Git, GitHub Projects, Scrumban.

## 10. Acceptance criteria
Semua FR memiliki test case dan hasil; uji lintas pengguna tidak dapat membaca/mengubah data pihak lain; file bukti tidak dapat diakses tanpa otorisasi; alur login, submit, status, chat, dan KB bekerja; UI responsif; hasil uji usability dicatat; AI dinilai terhadap dataset pertanyaan terkurasi dan prompt injection; tidak ada temuan kritis/tinggi terbuka sebelum deployment publik.

## 11. Asumsi, keputusan terbuka
1. Firebase adalah satu-satunya platform backend SISKA. Repository KOPKAS lama memakai Supabase, tetapi seluruh auth/data/storage adapter terkait harus diganti, bukan dipertahankan.
2. Tipe role awal `reporter` dan `admin`; peran pendamping/psikolog tidak masuk sampai ada mandat.
3. Tentukan apakah AI history hanya localStorage atau server; proposal menyebut riwayat localStorage.
4. Tentukan kebijakan retensi/penghapusan, daftar kontak resmi, sumber KB, dan persetujuan pemilik layanan.
5. Jangan memasukkan laporan atau bukti pribadi ke embedding/vector store.
