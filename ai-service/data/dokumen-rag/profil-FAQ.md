# Profil SISKA

## Apa itu SISKA
SISKA (Sistem Pengaduan Kekerasan Seksual) adalah aplikasi web responsif untuk
menerima dan mengelola pengaduan kekerasan seksual, memantau status laporan,
berkomunikasi dengan petugas, dan mendapatkan informasi awal lewat asisten
SISKA AI. Organisasi sasarannya adalah UIN Sunan Kalijaga Yogyakarta.

- Status pengembangan: SISKA masih dalam tahap pengembangan (development).
  Sebagian fitur sudah memiliki backend, tetapi tampilan di website masih
  berupa demo dengan data ilustrasi (lihat bagian "Status fitur saat ini").
- Pengelola: unit pengelola resmi, kewenangan petugas, dan kontak resmi kampus
  belum ditetapkan di dalam sistem. Laporan ditangani oleh petugas/admin SISKA
  yang akunnya dibuat melalui proses administratif tepercaya.
- Batas layanan: SISKA bukan layanan darurat dan bukan pengganti petugas
  penanganan resmi, konselor, psikolog, pendamping hukum, atau kepolisian.
  SISKA membantu administrasi pelaporan, komunikasi dengan petugas, dan
  informasi awal.

## Siapa yang bisa menggunakan SISKA
SISKA ditujukan bagi sivitas akademika UIN Sunan Kalijaga (mahasiswa, dosen,
tenaga kependidikan) yang ingin melaporkan atau mencari informasi tentang
dugaan kekerasan seksual. Ada dua peran di sistem:
- Pelapor (reporter): pengguna yang mendaftar sendiri lewat website.
- Admin/petugas: akun yang dibuat oleh proses provisioning tepercaya, tidak
  bisa didapat dengan mendaftar sendiri atau mengubah peran sendiri.

Saat ini pendaftaran belum memverifikasi apakah pendaftar berasal dari sivitas
akademika UIN Sunan Kalijaga.

## Apa yang bisa dilakukan lewat SISKA
Bagi pelapor:
1. Mendaftar, login, logout, dan mengatur ulang password lewat email.
2. Membuat laporan: kategori, waktu kejadian (opsional), lokasi (opsional),
   kronologi, dan bukti pendukung (opsional).
3. Melihat daftar laporan miliknya, detail, dan riwayat perubahan status.
4. Chat dengan admin/petugas (terpisah dari SISKA AI).
5. Bertanya informasi umum ke SISKA AI.
6. Membaca halaman Edukasi, dan mengelola profil (username dan password).

Bagi admin/petugas:
1. Melihat dan menyaring daftar laporan, serta membaca detailnya.
2. Mengubah status laporan sesuai alur yang ditetapkan.
3. Membalas pesan pelapor pada percakapan yang ditugaskan kepadanya.
4. Mengelola dokumen sumber SISKA AI (unggah, lihat, hapus, reindex PDF).

## Status fitur saat ini (development)
- Sudah terpasang di website: halaman beranda, Syarat dan Ketentuan, dan
  login/registrasi/lupa password dengan Firebase Authentication (bila
  konfigurasi tersedia), serta ubah username dan password di halaman profil.
- Backend (API) sudah tersedia untuk laporan, bukti, riwayat status, chat,
  SISKA AI, dokumen knowledge base, dan audit. Pengujian masih dilakukan di
  lingkungan emulator dengan data sintetis.
- Halaman dashboard, buat laporan, riwayat laporan, detail laporan, chat,
  chatbot AI, edukasi, dan pengaturan admin di website masih menampilkan data
  demo/ilustrasi dan belum tersambung ke backend. Laporan, pesan, dan
  dokumen yang diisi di halaman tersebut belum benar-benar tersimpan atau
  terkirim.
- Teks Syarat dan Ketentuan masih berupa draf ilustrasi yang perlu ditinjau
  institusi. Kebijakan retensi data, kontak resmi, dan sumber dokumen resmi
  juga belum ditetapkan.

## Siapa yang menerima dan memproses laporan
Laporan yang masuk dapat dibaca dan diproses oleh admin/petugas SISKA, yang
dapat memperbarui status laporan dan membalas chat. Pada implementasi saat ini
semua akun admin dapat membaca laporan; apakah akses admin akan dibatasi per
petugas yang ditugaskan masih menunggu keputusan pemilik layanan. Alur
penanganan lanjutan di luar SISKA mengikuti prosedur resmi kampus.

## Teknologi yang digunakan
- Frontend: Next.js (App Router), React, TypeScript, Tailwind CSS.
- Backend/API: Next.js Route Handlers (`/api/v1/...`) dengan Firebase Admin SDK
  di sisi server.
- Autentikasi: Firebase Authentication. Peran (reporter/admin) disimpan sebagai
  custom claim dan diverifikasi di server.
- Data: Cloud Firestore dengan Firebase Security Rules (akses ditolak secara
  default).
- Berkas: Cloud Storage privat untuk bukti laporan dan dokumen PDF knowledge
  base.
- SISKA AI: gateway di backend Next.js dengan penyaringan keamanan. Rancangan
  utamanya adalah layanan Python FastAPI terpisah (RAG dengan embedding
  Qwen3-Embedding-0.6B dan LLM yang dapat diganti lewat konfigurasi). Layanan
  ini belum aktif secara default; saat nonaktif atau tidak terjangkau,
  backend memakai pencarian kata kunci pada dokumen yang sudah terindeks.
- Pengembangan lokal: Firebase Emulator Suite.
- SISKA tidak menggunakan Supabase/PostgreSQL.

## SISKA AI (chatbot)
SISKA AI adalah asisten informasi umum yang menjawab berdasarkan dokumen PDF
terverifikasi yang diunggah admin dan sudah berstatus terindeks.
- Jawaban menyertakan rujukan dokumen dan halaman. Jika tidak ada bagian
  dokumen yang cukup relevan, SISKA AI menyatakan informasinya belum tercantum
  dan mengarahkan pengguna ke chat admin.
- SISKA AI tidak mengakses laporan, bukti, chat dengan admin, atau profil
  pengguna. Pertanyaan yang meminta isi laporan, identitas pelapor, atau
  kredensial sistem, serta upaya prompt injection, ditolak.
- SISKA AI tidak memberi diagnosis, konseling, nasihat medis atau hukum,
  penilaian kebenaran laporan, atau keputusan sanksi, dan tidak menjamin hasil
  penanganan.
- Untuk kondisi darurat, SISKA AI hanya menjelaskan bahwa ia bukan kanal
  darurat dan mengarahkan ke Chat SISKA atau kontak resmi kampus. Kontak resmi
  tersebut belum ditetapkan, sehingga SISKA AI tidak akan menyebut nomor
  telepon.
- Pengguna diminta tidak memasukkan nama, kronologi rinci, atau data pribadi
  ke SISKA AI. Untuk kasus pribadi, gunakan chat dengan admin.
- Riwayat chat AI direncanakan disimpan di perangkat pengguna (localStorage);
  keputusan akhirnya belum ditetapkan.

## Kerahasiaan dan identitas pelapor
- Setiap pelapor hanya dapat melihat laporan, bukti, dan percakapan miliknya
  sendiri. Pelapor lain tidak bisa mengaksesnya.
- Bukti laporan disimpan di penyimpanan privat dan hanya dapat diunduh oleh
  pemilik laporan atau admin lewat tautan bertanda tangan yang berlaku singkat
  (maksimal 5 menit).
- Perubahan status dan tindakan admin penting dicatat dalam audit tanpa
  menyalin isi laporan atau pesan.
- SISKA tidak menjanjikan anonimitas penuh. Pendaftaran memakai akun (email dan
  username), sehingga identitas akun diproses oleh sistem. SISKA juga tidak
  mengklaim enkripsi end-to-end.
- Masa penyimpanan data, penghapusan, dan ekspor data belum ditetapkan.
  Untuk kepastian, hubungi admin lewat fitur chat.

# FAQ SISKA

## Bagaimana cara mendaftar akun di SISKA?
Pilih menu Register, isi username (minimal 3 karakter), email, password
(minimal 6 karakter), dan konfirmasi password, lalu centang persetujuan Syarat
dan Ketentuan dan pilih Daftar. Setelah akun terbentuk, pengguna masuk ke
ruang pengguna. Saat ini belum ada langkah verifikasi email pada alur
pendaftaran.

## Bagaimana jika saya lupa password?
Pilih "Lupa Password?" di halaman login, masukkan email akun, lalu ikuti
instruksi pada email yang dikirim. Demi keamanan, sistem tidak menampilkan
apakah email tersebut terdaftar atau tidak. Password juga dapat diubah dari
halaman Profil dan Pengaturan dengan memasukkan password saat ini.

## Bagaimana cara membuat pengaduan?
Setelah login, pilih "Buat Laporan". Data yang diminta: kategori (Pelecehan
melalui pesan, Pelecehan fisik, Kekerasan berbasis gender, Informasi dan
dukungan, atau Lainnya), tanggal dan waktu kejadian (opsional), lokasi atau
media kejadian (opsional), dan kronologi (wajib, maksimal 20.000 karakter).
Bukti pendukung bersifat opsional. Laporan yang terkirim berstatus awal
"submitted" (menunggu verifikasi). Catatan: pada versi development saat ini,
halaman Buat Laporan masih simulasi dan belum menyimpan laporan sungguhan.

## Bukti apa yang boleh dilampirkan?
Format PDF, JPG, atau PNG dengan ukuran maksimal 5 MiB per berkas. Isi berkas
diperiksa agar sesuai dengan format yang dinyatakan, dan berkas skrip atau
executable ditolak. Hindari melampirkan data pihak lain yang tidak diperlukan
dan jangan sertakan password.

## Apa arti status laporan saya?
Status laporan mengikuti lima tahap:
- submitted: laporan baru diterima.
- under_review: laporan sedang ditinjau admin.
- in_progress: laporan sedang ditindaklanjuti.
- resolved: tahapan layanan untuk laporan telah diselesaikan.
- rejected: laporan tidak dilanjutkan secara administratif, dengan alasan yang
  dicatat admin.

Alurnya: submitted menuju under_review; under_review menuju in_progress,
resolved, atau rejected; in_progress menuju resolved atau kembali ke
under_review. Laporan resolved atau rejected dapat dibuka kembali ke
under_review oleh admin dengan menyertakan alasan. Setiap perubahan status
tercatat (status lama, status baru, waktu, petugas, dan catatan). Pada tampilan
demo saat ini, status disederhanakan menjadi "Menunggu verifikasi", "Diproses",
dan "Selesai"; istilah final masih menunggu persetujuan pemilik layanan.
Status bukan penilaian atas pengalaman pelapor.

## Apakah SISKA menyediakan fitur chat dengan admin?
Ya. Pelapor dapat membuka percakapan dengan petugas, umum atau terkait salah
satu laporannya. Percakapan baru belum ditugaskan ke petugas tertentu; admin dapat
membacanya, tetapi hanya admin yang ditugaskan yang dapat membalas. Pesan
hanya dapat dikirim saat percakapan berstatus terbuka (percakapan yang sudah
ditutup tidak menerima pesan baru). Chat dengan admin terpisah dari SISKA AI, dan percakapan
manusia tidak dicampur dengan riwayat AI. Pada versi development saat ini,
halaman chat masih simulasi.

## Apakah chatbot SISKA bisa menggantikan admin?
Tidak. SISKA AI hanya asisten informasi umum yang menjawab dari dokumen resmi
yang tersedia di knowledge base. SISKA AI tidak dapat memproses laporan,
mengambil keputusan, memberi konseling, atau menjamin hasil penanganan, dan
tidak dapat membaca laporan pengguna. Untuk hal pribadi, gunakan chat dengan
admin.

## Apa yang harus saya lakukan jika saya dalam keadaan darurat?
SISKA bukan layanan darurat dan admin tidak dijamin tersedia setiap saat.
Jika Anda atau orang lain berada dalam bahaya sekarang, segera hubungi layanan
darurat setempat atau orang tepercaya di sekitar Anda. Kontak resmi kampus
belum ditetapkan di SISKA, sehingga chatbot tidak akan menyebutkan nomor
tertentu.

## Apa itu kekerasan seksual secara umum?
Kekerasan seksual adalah setiap perbuatan yang merendahkan, menghina,
melecehkan, dan/atau menyerang tubuh, hasrat seksual seseorang, dan/atau
fungsi reproduksi, secara paksa, bertentangan dengan kehendak seseorang,
yang menyebabkan penderitaan fisik, psikis, seksual, kerugian secara
ekonomi, sosial, budaya, dan/atau politik. Rincian jenis dan dasar hukumnya
mengikuti dokumen resmi yang diunggah admin ke knowledge base SISKA.

## Siapa yang bisa melihat isi laporan saya?
Anda sebagai pemilik laporan, dan admin/petugas SISKA. Pelapor lain, pengunjung
umum, dan SISKA AI tidak bisa melihatnya. Pada implementasi saat ini semua
akun admin dapat membaca laporan; pembatasan hanya untuk petugas yang
ditugaskan masih menunggu keputusan institusi. Akses dan tindakan admin
penting tercatat dalam audit.

## Apakah laporan saya anonim?
Tidak sepenuhnya. Laporan dikaitkan dengan akun Anda (email dan username)
sehingga SISKA tidak menjanjikan anonimitas penuh. Anda dapat memilih
username yang nyaman dan membagikan informasi hanya seperlunya. Kebijakan
retensi dan penghapusan data belum ditetapkan; tanyakan kepada admin untuk
kepastian.

## Apa saja yang ada di halaman Edukasi?
Halaman Edukasi berisi materi pengantar non-grafis, yaitu memahami
persetujuan, mengenali dampak saat sesuatu terasa tidak nyaman, mencari
pendampingan, dan menjaga informasi pribadi. Materi saat ini masih contoh
ilustrasi dan bukan nasihat medis atau hukum.

## Apakah SISKA sudah bisa dipakai untuk melapor secara resmi?
Belum. SISKA masih dalam tahap pengembangan: tampilan masih memakai data
demo, dan kontak resmi, Syarat dan Ketentuan, serta kebijakan privasi masih
menunggu pengesahan institusi. Untuk melapor saat ini, gunakan kanal resmi
kampus yang berlaku.
