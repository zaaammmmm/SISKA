# SISKA AI Service (backend chatbot RAG)

Backend chatbot SISKA. **Node.js murni, tanpa dependensi npm → tidak ada `node_modules`**
(cukup Node ≥ 18, tidak perlu `npm install`). Frontend-nya adalah halaman `/user/ai` di aplikasi SISKA
(`src/components/ai-chat.tsx`, `src/components/user-pages.tsx`); frontend dan service hanya bertemu lewat kontrak HTTP
`src/server/contracts/ai-service.contract.ts`.

```
Browser ──► SISKA Next.js  /api/v1/ai/chat ──► ai-service  POST /chat ──► Ollama (lokal / Colab)
 (frontend)  (auth, rate limit, guardrail)      (RAG: retrieval + guard)
```

## Menjalankan
```bash
cd ai-service
cp .env.example .env        # isi AI_SERVICE_SHARED_SECRET (sama dengan di SISKA)
npm start                   # http://127.0.0.1:8000   (npm test untuk uji otomatis)
```
Di `.env.local` SISKA:
```
AI_SERVICE_ENABLE_REMOTE="true"
AI_SERVICE_URL="http://127.0.0.1:8000"
AI_SERVICE_SHARED_SECRET="<sama dengan ai-service/.env>"
AI_SERVICE_TIMEOUT_MS="90000"
```
Ollama harus berjalan dan model `OLLAMA_EMBED_MODEL` / `OLLAMA_CHAT_MODEL` sudah di-`pull`.
Bila ai-service/Ollama mati, SISKA otomatis memakai fallback Firestore (REL-01) — chat tidak error.

## Struktur
| Path | Isi |
|---|---|
| `src/index.js`, `src/server.js` | Entry & server HTTP, autentikasi secret, kontrak |
| `src/contract.js` | Hasil RAG → `{answer, grounded, sources, escalationMessage}` (tanpa rute/backend/latensi) |
| `src/rag/` | Pipeline RAG (guard, retrieval hibrida, BM25, LLM, sesi, pembersih sitasi) |
| `data/export/` | Artefak dari notebook (chunks, embeddings, policy, router) — ikut di-commit (±4 MB) |
| `data/dokumen-rag/` | Salinan sumber `.md` yang membantu penyuntingan; tidak dibaca langsung oleh server saat runtime |
| `docs/` | Direktori sumber notebook di Google Drive (`MyDrive/capstone/docs`); bukan direktori runtime lokal |
| `data/runtime/` | Perubahan admin (dokumen tambahan, dokumen dasar yang dihapus); dibuat otomatis, diabaikan git |
| `notebook/RAG_v4.ipynb` | Notebook ingest, uji otomatis 2 model, pemilihan model, uji manual |
| `notebook/data_uji/data_uji_siska.csv` | Data uji sintetis (785 pertanyaan, 23 topik) |

## Yang tidak lagi tampil ke pengguna
- penanda sumber `[1]`: dibuang setelah verifikasi guard (`src/rag/cleanAnswer.js`), plus lapisan kedua di frontend (`src/lib/ai-reply.ts`)
- label rute (`smalltalk`, `answered`, …), `local · 45s`: tidak ada di respons API sama sekali; hanya di log server

## Menambah dan menghapus sumber dari SISKA

Admin masuk ke SISKA, buka **Dokumen SISKA AI**, lalu unggah file `.md`, `.txt`, atau PDF berteks, atau isi teks langsung.
Backend memeriksa sesi dan role admin, AI service memecah teks dengan aturan yang sama seperti notebook
(BAB/Pasal/judul, perbaikan salah-OCR angka, pembuangan header/footer halaman), membuat embedding, lalu
memperbarui indeks. Dokumen langsung tersedia untuk pertanyaan berikutnya.

- Semua dokumen, termasuk dokumen dasar dari notebook, dapat dihapus satu per satu. Jika `kontak-bantuan.md`
  dihapus, chatbot menjawab bahwa kontak belum tersedia dan mengarahkan ke admin.
- Tombol **Kembalikan ke bawaan** membuang semua perubahan admin sehingga indeks kembali sama dengan export notebook.
- PDF maksimal 25 MiB diekstrak per halaman di backend (baris dan nomor halaman dipertahankan). PDF hasil scan
  tanpa lapisan teks belum didukung OCR. Maksimum teks hasil ekstraksi 300.000 karakter. Dokumen besar butuh
  waktu embedding; naikkan `AI_SERVICE_TIMEOUT_MS` (maks. 90000) di environment SISKA bila unggahan terputus.
- Jangan memasukkan kronologi laporan, nama, atau data pribadi pengguna sebagai dokumen knowledge base.

Perubahan admin disimpan di `data/runtime/` (`state.json`, `added-chunks.json`, `added-embeddings.f32`), bukan di
`data/export/`. Mengganti isi `data/export/` dengan hasil notebook baru atau deploy ulang tidak menghapus unggahan
admin selama folder `data/runtime/` dipertahankan. Cadangkan folder itu bila server dipindahkan. Bila model embedding
di export diganti sehingga dimensi vektor berubah, dokumen tambahan diabaikan dan perlu **Kembalikan ke bawaan**.

### Peran notebook
Notebook `RAG_v4.ipynb` membaca sumber dari `MyDrive/capstone/docs`, membangun export (chunks, embeddings, policy, router),
menguji ai-service asli dengan data uji, memilih model terbaik, dan menyimpan hasilnya di `hasil_terbaik/`. Salin isi
`hasil_terbaik/export/` ke `data/export/` lalu restart ai-service. Salinan `.md` di `data/dokumen-rag/` adalah arsip sumber
yang sama dengan yang dipakai notebook; server tidak membacanya saat runtime.

## Setup lokal SISKA

Jalankan Firebase Emulator, AI service, dan SISKA di terminal terpisah. Gunakan Node.js 22+ untuk
menjalankan test loader repo SISKA dan Java JDK 11+ untuk Firebase Emulator.

1. Di root `SISKA-Imp`, salin `.env.example` menjadi `.env.local` dan
   `ai-service/.env.example` menjadi `ai-service/.env`.
2. Buat nilai acak untuk `AI_SERVICE_SHARED_SECRET`, lalu isi nilai yang sama di kedua file tersebut.
   Jangan gunakan secret contoh untuk server online.
3. Siapkan Ollama dan model `qwen3-embedding:0.6b` (embedding, wajib sama dengan notebook) serta `qwen25c3b-8k:latest` (chat).
4. Jalankan `firebase emulators:start --project demo-siska`, lalu `npm run seed`.
5. Jalankan `npm start --prefix ai-service`.
6. Di terminal lain jalankan `npm ci` (sekali) dan `npm run dev` dari root SISKA.
7. Login sebagai admin untuk mengelola dokumen; login sebagai reporter untuk menguji jawaban di
   `/user/ai`. Akun emulator tercantum di README root SISKA. Periksa `http://127.0.0.1:8000/health`
   jika AI belum bisa menjawab.

## Memakai laptop admin sebagai AI provider untuk aplikasi online

Untuk demo terkontrol, aplikasi online dapat mengirim request server-to-server ke AI service di laptop
admin. Jalurnya adalah **browser pengguna → server SISKA online → koneksi privat/HTTPS → AI service di
laptop → Ollama yang berjalan di laptop**. Browser pengguna tidak perlu dan tidak boleh mengakses
Ollama langsung.

1. Jalankan Ollama dan kedua model di laptop provider; laptop harus tetap menyala dan terhubung internet.
2. Jalankan AI service dengan `AI_SERVICE_SHARED_SECRET` kuat dan `OLLAMA_BACKEND=local`.
   Ollama tetap memakai `http://localhost:11434` karena prosesnya ada di laptop yang sama.
3. Sediakan alamat **stabil dan privat** dari server SISKA online ke port `8000`, misalnya VPN antar
   server atau tunnel HTTPS yang aksesnya dibatasi. Konfigurasikan tunnel agar meneruskan ke
   `http://127.0.0.1:8000` di laptop yang sama.
4. Di environment server SISKA (bukan environment browser), set `AI_SERVICE_ENABLE_REMOTE=true`,
   `AI_SERVICE_URL` ke alamat tunnel/VPN, `AI_SERVICE_SHARED_SECRET` ke secret yang sama, dan
   `AI_SERVICE_TIMEOUT_MS=90000`. Restart/redeploy backend SISKA setelah mengubah environment.
5. Uji dari aplikasi online dan pantau `/health` serta log service.

Jangan melakukan port-forward router atau mengekspos Ollama/port `11434` ke internet. Jangan membuka
AI service ke publik tanpa TLS, kontrol akses jaringan, dan secret unik; secret tersebut memberi
akses ke endpoint admin dokumen juga. Tunnel sementara dapat berganti URL sehingga harus diperbarui
pada environment backend SISKA. Jika laptop atau koneksi tunnel mati, pertanyaan akan jatuh ke fallback
Firestore dan tidak lagi menggunakan RAG/model di laptop. Karena laptop tidak menjamin uptime maupun
ketersediaan jaringan, pola ini cocok untuk demo/pilot, bukan hosting produksi yang membutuhkan SLA;
untuk produksi gunakan provider AI/service yang dikelola dan selalu tersedia.

## Endpoint
`GET /health` (publik) · `POST /chat` · admin (header `X-Service-Authorization`):
`GET/POST/DELETE /admin/rag-docs` (.md/.txt/PDF dengan teks hasil ekstraksi; `DELETE ?file=` menghapus satu dokumen, `DELETE ?reset=1` mengembalikan ke bawaan), `GET/POST /admin/settings` (ganti `local`/`colab` & URL tunnel tanpa restart), `POST /admin/reindex`.
```bash
curl -X POST localhost:8000/admin/settings -H "X-Service-Authorization: $SECRET" \
  -d '{"backend":"colab","colabUrl":"https://xxxx.trycloudflare.com"}'
```

## Catatan operasional
- Riwayat percakapan & rate limit ada di memori proses (hilang saat restart; untuk multi-instance pindahkan ke Redis).
- Cek kesamaan dengan hasil notebook lewat `GET /health`: `index.policyVersion` harus `4`, `chatModel` harus sama dengan `PAKAI_MODEL_INI.txt`, dan `index.exportId` sama setelah export disalin.
- PDF yang diunggah admin SISKA tetap diindeks oleh SISKA sendiri (endpoint `/admin/documents` sengaja 501 → fallback lokal).
