# Catatan redesign UI SISKA

## Sistem desain baru ("ruang tenang")
- Font: Literata (judul, serif untuk suara yang manusiawi) + Atkinson Hyperlegible (UI, dirancang agar huruf mudah dibedakan). Keduanya via `next/font/google`.
- Warna: kertas abu-kehijauan `#F2F4F1`, tinta `#16292C`, aksi teal `#07686B` (warna logo `#0A7F82` tetap jadi identitas), teal gelap `#07484B`. Status laporan: ochre, biru-slate, teal, hijau, plum (tidak ada merah alarm).
- Ukuran teks minimum 13–14px (sebelumnya 8.5–12px). Semua pasangan warna lolos kontras AA. axe-core: 0 pelanggaran di 19 halaman.
- Tidak ada gradasi, bayangan kartu, blur kaca, hover yang mengangkat elemen, eyebrow kapital, atau penomoran dekoratif.

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
