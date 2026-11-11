# 16 — Review Perubahan Security pada Basis SISKA Development

## Ringkasan pendekatan

`SISKA-development` dipakai sebagai basis utama. Fitur terbaru pada development dipertahankan; security-final tidak disalin menyeluruh. Integrasi hanya mengambil kontrol yang kompatibel dengan kontrak dan source development.

## Perubahan fungsional

| Area/file | Sebelum (development) | Sesudah integrasi | Nilai dan verifikasi |
|---|---|---|---|
| `firestore.rules` | Client dapat membuat profil/laporan/conversation/message pada beberapa jalur | Seluruh client writes ditolak; read dengan owner/role/assignment | Mengurangi bypass API; 27 Rules test disediakan, runtime pending |
| `storage.rules` | Akses client mengikuti pemilik/role pada path | Semua direct Client SDK read/write ditolak | Seluruh file melalui backend/Signed URL; 18 Storage test disediakan, runtime pending |
| `permissions.ts` | `??` dapat menggunakan alias ketika field canonical eksplisit null | Alias hanya fallback saat field canonical tidak ada | Menghindari stale alias memberi akses; unit test AUTHZ-CHAT ditambahkan |
| `storage.ts` | Helper KB `knowledge/{id}/original.pdf` tidak sama dengan KnowledgeService | `knowledge-base/{id}/v1.pdf` | Konsistensi path; unit test diperbarui |
| Emulator config | Source dan firebase.json memakai 8085, contoh/env/CSP/test sebagian 8080 | Referensi yang dipakai diselaraskan ke 8085 | Mengurangi koneksi emulator salah; parsing/static check perlu dijalankan ulang di mesin dev |
| `package.json` | Test backend + AI/PDF tersedia | Semua test existing dipertahankan; script Rules/IDOR/AI service ditambahkan | Tidak mengorbankan test AI |
| IDOR | Tidak ada harness khusus di development ZIP | Harness API IDOR + kontrol negatif AI docs admin | Menguji boundary Admin SDK; runtime pending |

## Perubahan dokumentasi

`README.md`, docs 05, 08, 09, 10 diperbarui/ditambah tanpa menghilangkan materi AI utama; docs 11–17 mendokumentasikan bukti test, klasifikasi, temuan, deployment, changelog, review, dan jobdesk.

## Fitur development yang dipertahankan

Tidak ada penggantian menyeluruh pada AI Node.js, contract, AI service, KnowledgeService, preview chat, UI, route admin AI documents, AI/PDF test, dependency `pdfjs-dist`, atau asset `public/siska.png`. Seluruh file lain dari development tetap menjadi basis.

## Keputusan yang masih terbuka

1. SEC-F03: apakah semua admin berwenang membaca semua laporan/evidence/history.
2. SEC-F05–SEC-F11: temuan backend/upload/rate-limit/CSP/file validation yang perlu tindak lanjut.
3. Tes Firebase Emulator/API IDOR/AI E2E dan build belum dijalankan pada environment pengguna.
4. Koordinasi formal dan persetujuan tim backend belum dapat dibuktikan dari source ZIP.
