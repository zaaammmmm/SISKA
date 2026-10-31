# Profil SISKA

## Apa itu SISKA
SISKA (Sistem Pengaduan Kekerasan Seksual) adalah platform berbasis web untuk
menampung aspirasi dan pengaduan kekerasan seksual di lingkungan UIN Sunan
Kalijaga Yogyakarta. Lewat SISKA, pengguna dapat membuat laporan, memantau
status laporan, berkomunikasi dengan admin/petugas, membaca edukasi, dan
bertanya informasi umum kepada chatbot SISKA AI.

- Pengelola: Satuan Tugas (Satgas) PPKS / PLT PPKS UIN Sunan Kalijaga.
- Batas layanan: SISKA bukan layanan darurat dan bukan pengganti petugas
  PPKS, konselor, psikolog, pendamping hukum, atau kepolisian. SISKA adalah
  kanal pelaporan, komunikasi dengan petugas, dan edukasi/informasi awal.
- Untuk kondisi darurat, lihat bagian "Kontak dan Bantuan Darurat".

## Siapa yang bisa menggunakan SISKA
Mahasiswa, dosen, tenaga kependidikan, dan sivitas akademika UIN Sunan
Kalijaga yang mengalami, menyaksikan, atau ingin melaporkan dugaan kekerasan
seksual di lingkungan kampus. Ada dua jenis akun:
- Pelapor: pengguna yang mendaftar sendiri lewat website.
- Admin/petugas PLT PPKS: akun petugas yang dibuat oleh pengelola, tidak bisa
  didapat dengan mendaftar sendiri.

## Apa yang bisa dilakukan lewat SISKA
Bagi pelapor:
1. Mendaftar, login, logout, dan mengatur ulang password lewat email.
2. Membuat laporan: kategori, waktu kejadian (opsional), lokasi (opsional),
   kronologi, dan bukti pendukung (opsional).
3. Melihat daftar laporan, detail laporan, dan riwayat perubahan statusnya.
4. Chat langsung dengan admin/petugas PLT PPKS.
5. Bertanya informasi umum kepada chatbot SISKA AI.
6. Membaca materi edukasi dan mengelola profil (username dan password).

Bagi admin/petugas PLT PPKS:
1. Melihat dan menyaring daftar laporan, serta membaca detailnya.
2. Mengubah status laporan sesuai alur yang ditetapkan.
3. Membalas pesan pelapor pada percakapan yang ditugaskan kepadanya.
4. Mengelola dokumen sumber chatbot SISKA AI (unggah, lihat, hapus, dan
   reindex dokumen PDF).

## Siapa yang menerima dan memproses laporan
Laporan yang masuk melalui SISKA diterima dan diproses oleh admin/petugas PLT
PPKS UIN Sunan Kalijaga. Petugas dapat meninjau laporan, memperbarui status,
membalas chat, dan mengarahkan laporan ke proses penanganan sesuai pedoman
pencegahan dan penanganan kekerasan seksual kampus.

## Teknologi yang digunakan
- Frontend: Next.js (App Router), React, TypeScript, Tailwind CSS.
- Backend/API: Next.js Route Handlers dengan Firebase Admin SDK di sisi server.
- Autentikasi: Firebase Authentication; peran (pelapor/admin) diverifikasi di
  server.
- Basis data: Cloud Firestore dengan Firebase Security Rules (akses ditolak
  secara default).
- Penyimpanan berkas: Cloud Storage privat untuk bukti laporan dan dokumen PDF
  knowledge base.
- Chatbot SISKA AI: berbasis Retrieval-Augmented Generation (RAG) dengan
  layanan Python FastAPI, embedding Qwen3-Embedding-0.6B, dan LLM yang dapat
  diganti lewat konfigurasi.
- SISKA tidak menggunakan Supabase atau PostgreSQL.

## Chatbot SISKA AI
SISKA AI adalah asisten informasi berbasis RAG yang hanya menjawab
berdasarkan dokumen resmi yang disediakan admin (profil dan FAQ SISKA, kontak
bantuan, pedoman kampus, dan peraturan terkait).
- Jawaban menyertakan rujukan dokumen. Jika informasinya tidak ada di dokumen,
  SISKA AI menyatakan belum tercantum dan mengarahkan pengguna ke chat admin.
- SISKA AI tidak mengakses laporan, bukti, chat dengan admin, atau profil
  pengguna. Permintaan isi laporan, identitas pelapor, atau kredensial sistem
  ditolak.
- SISKA AI tidak memproses laporan, memberi diagnosis, konseling, nasihat
  medis atau hukum, menilai kebenaran laporan, menentukan sanksi, atau
  menjamin hasil penanganan.
- SISKA AI tidak menggantikan admin. Untuk kasus pribadi, pengguna diarahkan
  chat dengan admin.
- Pengguna diminta tidak memasukkan nama, kronologi rinci, atau data pribadi
  ke SISKA AI.
- SISKA AI hanya boleh menyebut nomor kontak yang tercantum di bagian "Kontak
  dan Bantuan Darurat" dan tidak boleh mengarang nomor lain.

## Kerahasiaan dan identitas pelapor
- Pelapor hanya dapat melihat laporan, bukti, dan percakapan miliknya sendiri.
- Isi laporan hanya dapat diakses oleh admin/petugas PLT PPKS yang berwenang,
  bukan oleh pihak umum, pelapor lain, atau chatbot.
- Bukti laporan disimpan di penyimpanan privat dan hanya dapat diunduh oleh
  pemilik laporan atau admin lewat tautan bertanda tangan yang berlaku singkat
  (maksimal 5 menit).
- Perubahan status dan tindakan admin penting dicatat dalam audit tanpa
  menyalin isi laporan atau pesan.
- SISKA dirancang menjaga kerahasiaan data pelapor sebatas yang diizinkan
  sistem dan kebijakan kampus. SISKA tidak dapat menjamin anonimitas mutlak,
  kerahasiaan penuh, waktu respons tertentu, atau hasil penanganan laporan,
  karena laporan terkait dengan akun pengguna. Untuk kepastian, hubungi
  admin/petugas PLT PPKS langsung melalui SISKA atau kontak resmi.

# Kontak dan Bantuan Darurat

Bagian ini adalah satu-satunya sumber nomor kontak resmi yang boleh
disampaikan chatbot SISKA. Chatbot SISKA bukan layanan darurat.

## Daftar nomor darurat dan kontak bantuan
1. Polri Call Center, nomor 110 (kondisi darurat atau bahaya langsung).
   Gunakan bila sedang diserang, terancam, atau butuh pertolongan segera.
   Website: https://polri.go.id/kontak/call-center-110
2. Hotline pengaduan PLT PPKS UIN Sunan Kalijaga, nomor 0811-2551-922.
   Hotline resmi kampus untuk pengaduan kekerasan seksual di lingkungan UIN
   Sunan Kalijaga, dikelola Satuan Tugas PPKS.
   Email: pltppks@uin-suka.ac.id. Website: https://pltppks.uin-suka.ac.id/
3. SAPA 129 Kementerian Pemberdayaan Perempuan dan Perlindungan Anak (PPPA),
   telepon 129 atau WhatsApp 08111-129-129. Layanan nasional pengaduan dan
   rujukan kekerasan terhadap perempuan dan anak.
   Website: https://laporsapa129.kemenpppa.go.id/

## Kapan menghubungi yang mana
- Dalam bahaya langsung sekarang (sedang diserang atau terancam): hubungi 110.
- Ingin melaporkan atau berkonsultasi soal kekerasan seksual di kampus UIN
  Sunan Kalijaga: hubungi PLT PPKS di 0811-2551-922 atau gunakan SISKA.
- Butuh layanan rujukan nasional di luar kampus: hubungi SAPA 129.

# FAQ SISKA

## Aku butuh nomor darurat yang bisa dihubungi secepatnya. Siapa yang harus dihubungi?
Berikut nomor yang bisa dihubungi:
- 110 (Polri Call Center): untuk bahaya langsung, sedang diserang, atau butuh
  pertolongan segera.
- 0811-2551-922 (hotline PLT PPKS UIN Sunan Kalijaga): pengaduan dan
  konsultasi kekerasan seksual di lingkungan kampus. Email:
  pltppks@uin-suka.ac.id.
- 129 atau WhatsApp 08111-129-129 (SAPA 129 Kementerian PPPA): pengaduan dan
  rujukan kekerasan terhadap perempuan dan anak.
Jika Anda dalam bahaya saat ini, hubungi 110 terlebih dahulu. SISKA dan
chatbot bukan layanan darurat.

## Apa nomor hotline PPKS UIN Sunan Kalijaga?
Hotline pengaduan PLT PPKS UIN Sunan Kalijaga adalah 0811-2551-922, dikelola
Satuan Tugas PPKS. Kontak lain: email pltppks@uin-suka.ac.id dan website
https://pltppks.uin-suka.ac.id/.

## Apa itu SAPA 129 dan bagaimana menghubunginya?
SAPA 129 adalah layanan nasional Kementerian PPPA untuk pengaduan dan rujukan
kekerasan terhadap perempuan dan anak. Telepon 129, WhatsApp 08111-129-129,
atau buka https://laporsapa129.kemenpppa.go.id/.

## Bagaimana cara mendaftar akun di SISKA?
Pilih menu Register, isi username (minimal 3 karakter), email, password
(minimal 6 karakter), dan konfirmasi password, centang persetujuan Syarat dan
Ketentuan, lalu pilih Daftar. Setelah akun terbentuk, pengguna masuk ke ruang
pengguna dan dapat membuat pengaduan.

## Bagaimana jika saya lupa password?
Pilih "Lupa Password?" di halaman login, masukkan email akun, lalu ikuti
instruksi pada email yang dikirim. Demi keamanan, sistem tidak menampilkan
apakah email terdaftar atau tidak. Password juga dapat diubah dari halaman
Profil dan Pengaturan dengan memasukkan password saat ini.

## Bagaimana cara membuat pengaduan?
Setelah login, pilih "Buat Laporan". Data yang diminta: kategori (Pelecehan
melalui pesan, Pelecehan fisik, Kekerasan berbasis gender, Informasi dan
dukungan, atau Lainnya), tanggal dan waktu kejadian (opsional), lokasi atau
media kejadian (opsional), dan kronologi (wajib, maksimal 20.000 karakter).
Bukti pendukung bersifat opsional. Laporan yang terkirim berstatus awal
"submitted" (menunggu verifikasi) dan diteruskan ke admin/petugas PLT PPKS.

## Bukti apa yang boleh dilampirkan?
Format PDF, JPG, atau PNG dengan ukuran maksimal 5 MiB per berkas. Isi berkas
diperiksa agar sesuai format yang dinyatakan, dan berkas skrip atau executable
ditolak. Hindari melampirkan data pihak lain yang tidak diperlukan dan jangan
sertakan password.

## Apa arti status laporan saya?
Status laporan mengikuti lima tahap:
- submitted: laporan baru diterima.
- under_review: laporan sedang diverifikasi atau ditinjau admin.
- in_progress: laporan sedang ditindaklanjuti.
- resolved: tahapan penanganan laporan telah diselesaikan.
- rejected: laporan tidak dilanjutkan secara administratif, dengan alasan yang
  dicatat admin.

Alurnya: submitted menuju under_review; under_review menuju in_progress,
resolved, atau rejected; in_progress menuju resolved atau kembali ke
under_review. Laporan resolved atau rejected dapat dibuka kembali ke
under_review oleh admin dengan menyertakan alasan. Setiap perubahan status
tercatat (status lama, status baru, waktu, petugas, dan catatan). Status dapat
dipantau lewat dashboard akun dan bukan penilaian atas pengalaman pelapor.
Tampilan website dapat menyederhanakannya menjadi "Menunggu verifikasi",
"Diproses", dan "Selesai".

## Apakah SISKA menyediakan fitur chat dengan admin?
Ya. Pelapor dapat membuka percakapan dengan admin/petugas PLT PPKS, umum atau
terkait salah satu laporannya. Percakapan baru belum ditugaskan ke petugas
tertentu; admin dapat membacanya, tetapi hanya admin yang ditugaskan yang
dapat membalas. Pesan hanya dapat dikirim saat percakapan terbuka. Chat dengan
admin terpisah dari chatbot SISKA AI dan tidak dicampur dengan riwayat AI.
Chat tidak menjamin waktu respons tertentu.

## Apakah chatbot SISKA bisa menggantikan admin?
Tidak. Chatbot SISKA hanya asisten informasi yang menjawab berdasarkan
dokumen resmi. Chatbot tidak dapat memproses laporan, mengambil keputusan,
memberi konseling, membaca laporan pengguna, atau menjamin hasil penanganan.
Untuk hal pribadi, gunakan chat dengan admin atau hubungi PLT PPKS di
0811-2551-922.

## Apa yang harus saya lakukan jika saya dalam keadaan darurat?
Jika Anda atau orang lain sedang diserang, terancam, atau dalam bahaya saat
ini, segera hubungi Polri di 110. Untuk pengaduan kekerasan seksual di kampus,
hubungi PLT PPKS di 0811-2551-922. Untuk rujukan nasional, hubungi SAPA 129
(telepon 129 atau WhatsApp 08111-129-129). SISKA dan chatbot bukan layanan
darurat dan tidak menjamin waktu respons.

## Apa itu kekerasan seksual secara umum?
Kekerasan seksual adalah setiap perbuatan yang merendahkan, menghina,
melecehkan, dan/atau menyerang tubuh, hasrat seksual seseorang, dan/atau
fungsi reproduksi, secara paksa, bertentangan dengan kehendak seseorang,
yang menyebabkan penderitaan fisik, psikis, seksual, kerugian secara
ekonomi, sosial, budaya, dan/atau politik. Rincian jenis dan dasar hukumnya
diatur dalam peraturan terkait, yaitu UU TPKS dan Pedoman Pencegahan dan
Penanganan Kekerasan Seksual kampus.

## Siapa yang bisa melihat isi laporan saya?
Anda sebagai pemilik laporan, dan admin/petugas PLT PPKS yang berwenang
menangani laporan. Pelapor lain, pengunjung umum, dan chatbot SISKA AI tidak
bisa melihatnya. Akses dan tindakan admin penting tercatat dalam audit.

## Apakah laporan saya anonim?
SISKA tidak menjamin anonimitas mutlak. Laporan dikaitkan dengan akun Anda
(email dan username). Anda dapat memilih username yang nyaman dan membagikan
informasi hanya seperlunya. Untuk kepastian tentang kerahasiaan, hubungi
admin/petugas PLT PPKS langsung melalui SISKA atau di 0811-2551-922.

## Apa saja yang ada di halaman Edukasi?
Halaman Edukasi berisi materi pengantar non-grafis: memahami persetujuan,
mengenali dampak saat sesuatu terasa tidak nyaman, mencari pendampingan, dan
menjaga informasi pribadi. Materi ini bukan nasihat medis atau hukum.

## Apakah SISKA bisa dipakai untuk melapor secara resmi?
Ya. Laporan yang dikirim lewat SISKA diterima dan diproses oleh admin/petugas
PLT PPKS UIN Sunan Kalijaga. Anda juga dapat melapor langsung lewat hotline
PLT PPKS di 0811-2551-922 atau email pltppks@uin-suka.ac.id.

## Apakah SISKA tersedia 24 jam dan seberapa cepat laporan ditanggapi?
SISKA tidak menjanjikan ketersediaan petugas setiap saat maupun waktu respons
tertentu. Untuk kondisi yang mendesak, hubungi 110. Untuk menanyakan tindak
lanjut laporan, gunakan chat dengan admin atau hubungi PLT PPKS di
0811-2551-922.
