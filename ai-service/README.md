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
| `notebook/RAG_v3.ipynb` | Notebook ingest & evaluasi |

## Yang tidak lagi tampil ke pengguna
- penanda sumber `[1]`: dibuang setelah verifikasi guard (`src/rag/cleanAnswer.js`), plus lapisan kedua di frontend (`src/lib/ai-reply.ts`)
- label rute (`smalltalk`, `answered`, …), `local · 45s`: tidak ada di respons API sama sekali; hanya di log server

## Menambah dan menghapus sumber dari SISKA

Admin masuk ke SISKA, buka **Pengaturan Admin**, lalu unggah file `.md`, `.txt`, atau PDF berteks, atau isi teks langsung.
Backend memeriksa sesi dan role admin, lalu AI service memecah teks, membuat embedding dengan model
embedding yang sedang aktif, dan memperbarui indeks. Dokumen langsung tersedia untuk pertanyaan baru;
tidak perlu membuka notebook atau menjalankan reindex. Dokumen yang dimasukkan admin dapat dihapus dari
halaman yang sama. Dokumen dasar dari notebook tampil sebagai sumber readonly.

PDF maksimal 25 MiB diekstrak teksnya di backend dan penanda halaman dipertahankan dalam indeks.
PDF hasil scan/gambar yang tidak memiliki lapisan teks belum didukung OCR; lakukan OCR dan tinjau
hasilnya terlebih dahulu. Maksimum teks hasil ekstraksi adalah 300.000 karakter. PDF yang sama dapat
langsung dipilih sebagai sumber AI; tidak perlu menyalinnya ke folder lokal atau menjalankan notebook.
Jangan memasukkan kronologi laporan, nama, atau data pribadi pengguna sebagai dokumen knowledge base.

Dokumen admin disimpan sebagai bagian dari berkas indeks lokal (`chunks.json`, `embeddings.f32`,
`manifest.json`) dan registry `web-docs.json` di `data/export/`. Folder tersebut akan berubah setelah
unggah/hapus; cadangkan dokumen yang perlu dipertahankan dan jangan commit data uji yang tidak sengaja.

### Peran notebook dan folder sumber

Notebook dipakai untuk membangun ulang sumber/export awal, mengubah konfigurasi retrieval/policy, atau
menjalankan evaluasi. Penggunaan notebook tidak diperlukan untuk operasi harian, termasuk menambah PDF
dari halaman admin. Notebook `RAG_v3.ipynb` membaca file sumber dari `MyDrive/capstone/docs` pada Google
Drive dan hanya memproses file yang tercantum di daftar `DOCUMENTS` notebook. Folder checkout
`ai-service/data/dokumen-rag/` bukan input otomatis notebook maupun server; folder itu hanya salinan kerja
Markdown. Jika ingin memakai ulang PDF lewat notebook, letakkan di `MyDrive/capstone/docs` dan daftarkan
namanya pada `DOCUMENTS`. Perubahan admin berada di `data/export/`, bukan otomatis disalin ke folder
sumber notebook; simpan cadangan sebelum export ulang.

## Setup lokal SISKA

Jalankan Firebase Emulator, AI service, dan SISKA di terminal terpisah. Gunakan Node.js 22+ untuk
menjalankan test loader repo SISKA dan Java JDK 11+ untuk Firebase Emulator.

1. Di root `SISKA-Imp`, salin `.env.example` menjadi `.env.local` dan
   `ai-service/.env.example` menjadi `ai-service/.env`.
2. Buat nilai acak untuk `AI_SERVICE_SHARED_SECRET`, lalu isi nilai yang sama di kedua file tersebut.
   Jangan gunakan secret contoh untuk server online.
3. Siapkan Ollama dan model `qwen3-embedding:0.6b` serta `qwen3:4b-instruct`.
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
`GET/POST/DELETE /admin/rag-docs` (.md/.txt/PDF dengan teks hasil ekstraksi), `GET/POST /admin/settings` (ganti `local`/`colab` & URL tunnel tanpa restart), `POST /admin/reindex`.
```bash
curl -X POST localhost:8000/admin/settings -H "X-Service-Authorization: $SECRET" \
  -d '{"backend":"colab","colabUrl":"https://xxxx.trycloudflare.com"}'
```

## Catatan operasional
- Riwayat percakapan & rate limit ada di memori proses (hilang saat restart; untuk multi-instance pindahkan ke Redis).
- `data/export/policy.json` saat ini masih versi v3 (belum ada mode curhat/persona v3.1). Jalankan ulang `export_all` di notebook lalu salin ke `data/export/` dan `POST /admin/reindex`.
- PDF yang diunggah admin SISKA tetap diindeks oleh SISKA sendiri (endpoint `/admin/documents` sengaja 501 → fallback lokal).
