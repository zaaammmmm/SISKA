# Catatan redesign UI SISKA

## Sistem desain (v3)
- Font: Poppins (400/500/600/700) lewat `next/font/google`, untuk judul dan isi.
- Warna: latar netral dingin `#F4F7F7`, teal tegas `#0B6E71` (turunan warna logo), panel gelap `#0B3B3E`. Status laporan: ochre, biru, teal, hijau, plum (tanpa merah alarm).
- Bentuk: permukaan putih membulat (radius 18/28), elevasi halus satu tingkat, tombol dan chip membulat, tile ringkasan, komposisi bento di beranda.
- Ukuran teks minimum 13px. Kontras AA. axe-core: 0 pelanggaran di 19 halaman.
- Tidak ada gradasi, blur kaca, atau gerak dekoratif.

## Tambahan yang perlu kamu putuskan
1. **Keluar cepat** (`components/quick-exit.tsx`): tombol + Esc ×3 membuka google.com via `location.replace`. Tampil di halaman publik, auth, dan ruang pengguna. Ganti `SAFE_URL` atau hapus bila tidak diinginkan.
2. **Menu mobile publik**: sebelumnya navigasi hilang di layar < 960px; sekarang ada menu `<details>`.
3. **Skip link/ARIA**: `id="isi"` di semua `<main>`; panel notifikasi tidak lagi memakai `role="menu"`.

## Perbaikan bug tampilan di halaman live
`live-pages.tsx` memakai class yang tidak ada di CSS lama (`.pill.amber`, `.table-wrap`, `.detail-grid`, `<input>`/`<select>` tanpa class), jadi tabel, status, dan formulir tampil tanpa gaya. Semuanya kini ter-style; tabel menjadi kartu bertumpuk di mobile; pesan chat menjaga baris baru.

## Perubahan copy (cek kesesuaian dengan produk)
- Dihapus: "24h balasan" dan "3 tahap" (angka yang tidak ada di sistem), klaim "simpan draft" (fitur draft tidak ada di kode live).
- Beranda kini menampilkan "lembar laporan" yang mengikuti formulir asli: hanya kategori dan kronologi yang wajib.
- Label yang bocor dari nama frame desain dihapus: "User Pages / Ruang Pengguna", "User Pages / Login".
- Konsisten: Masuk/Daftar (bukan Login/Register), sentence case.
- Belum ada nomor kontak darurat di mana pun; footer masih menulis "kontak resmi akan ditambahkan institusi".

## Catatan teknis
- Logika bisnis tidak diubah. Satu penyesuaian perilaku kecil: panel tindak lanjut admin menampilkan pesan (bukan select kosong) bila laporan sudah berstatus akhir.
- Mapping warna status: `in_progress` → teal, `rejected` → plum (sebelumnya in_progress dan under_review sama-sama biru).
- File tidak terpakai oleh route mana pun, aman dihapus: `demo-pages.tsx`, `user-pages.tsx`, `admin-pages.tsx`, `chat.tsx`, `auth-page.tsx`, `report-parts.tsx` (tidak saya ubah).
- Diverifikasi dengan `next build` (Next 15.5, TypeScript strict) memakai stub untuk `lib/` dan `types/` karena tidak ada di zip. Build asli di proyekmu belum saya jalankan.
