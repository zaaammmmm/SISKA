# SISKA Frontend — Firebase baseline

Implementasi frontend awal yang mengikuti komposisi visual `Siska Pages.png`: palet teal, halaman auth dengan panel kiri, dashboard bersidebar, tabel laporan, detail laporan, chat, dan panel dokumen AI admin.

## Jalankan lokal
1. Pastikan Node.js 20+ terpasang.
2. `cd KOPKAS-main` (folder proyek dipertahankan untuk memudahkan perbandingan historis; nama package sudah SISKA).
3. `npm install`
4. Salin `.env.example` menjadi `.env.local`, lalu isi konfigurasi Firebase Web App.
5. `npm run dev` dan buka `http://localhost:3000`.

## Rute yang tersedia
- `/` beranda publik
- `/login`, `/register`, `/login/forget`, `/register/terms`
- `/user`, `/user/new-report`, `/user/reports`, `/user/reports/[id]`, `/user/chat`, `/user/ai`, `/user/profile`
- `/admin`, `/admin/reports`, `/admin/reports/[id]`, `/admin/chat`, `/admin/documents`

## Status implementasi
- UI dan navigasi: implementasi pratinjau responsif.
- Firebase Auth: login, registrasi, dan reset password telah dipasang pada halaman auth jika konfigurasi tersedia.
- Data dashboard/laporan/chat/dokumen: data demo, belum tersambung ke Firestore/Storage. Tombol yang belum terintegrasi memberi pemberitahuan demo.
- Tidak ada Supabase dependency atau import dalam package/source aktif.
- SISKA AI: UI demo; endpoint, RAG ingestion, vector retrieval, guardrails, dan model perlu implementasi backend terpisah.

## Keamanan sebelum produksi
1. Tinjau rules dengan Firebase Emulator Suite. Rules contoh harus disesuaikan dengan struktur dokumen sebenarnya.
2. Jangan mempercayai role admin dari client. Penetapan role harus dilakukan oleh proses administratif tepercaya (custom claims atau dokumen profil yang akses tulisnya dibatasi).
3. Aturan pesan saat ini sengaja perlu diperketat sebelum produksi: validasi keanggotaan percakapan harus ditegakkan pada dokumen parent dan pesan.
4. Upload bukti harus memakai metadata/ID laporan valid, batas ukuran, validasi tipe konten, dan akses privat.
5. Jangan mengirim kronologi atau identitas ke model AI tanpa dasar, persetujuan, minimisasi data, dan penilaian risiko.
6. Jangan deploy rules tanpa pengujian akses negatif lintas pengguna.

## Catatan desain
Tampilan mengikuti struktur dan nuansa `Siska Pages.png`, tetapi belum pixel-perfect karena gambar adalah overview banyak halaman dengan resolusi kecil. Gunakan screenshot tiap halaman resolusi penuh untuk penyetelan pixel-level.
