# 12 — Klasifikasi Data SISKA

**Pemilik dokumen:** Keamanan Akses  
**Status:** Draf kerja untuk persetujuan tim  
**Sumber:** `docs/02-ERD.md`, `firestore.rules`, `storage.rules`, `src/server/*`.

Tujuan dokumen ini adalah menetapkan sensitivitas data, peran yang boleh mengakses, dan lapisan tempat otorisasi diterapkan. Semua contoh data pada pengujian harus sintetis.

## 1. Kelas data

| Kelas | Arti | Perlakuan minimum |
|---|---|---|
| **K1 — Sangat sensitif** | Kebocoran dapat membahayakan pelapor, membuka narasi kasus, atau memicu reviktimisasi | Akses owner/admin sesuai mandat, tidak masuk log atau AI umum, tanpa URL publik, unduhan diaudit |
| **K2 — Sensitif** | Identitas atau relasi yang dapat mengidentifikasi/menghubungi pelapor | Akses terbatas dan hanya field yang diperlukan |
| **K3 — Internal** | Data operasional, role, status, metadata audit | Akses admin/backend sesuai tugas; client tidak boleh mengubah |
| **K4 — Publik/terkontrol** | Materi edukasi yang memang disetujui untuk disajikan | Hanya data yang sudah dipublikasikan melalui API yang sesuai |

## 2. Peta data dan perlindungan

| Lokasi | Field/isi | Kelas | Reporter | Admin | Backend | Pelindung utama |
|---|---|---|---|---|---|---|
| `reports/{id}` | `description`, `incidentAt`, `location`, `category` | K1 | R own | R seluruh laporan saat ini* | C/R/U status | Firestore Rules + `assertCanReadReport` (404 seragam) |
| `reports/{id}` | `reporterId` | K2 | R own | R | C diturunkan dari token | Payload tidak dipercaya untuk UID |
| `reports/{id}` | `status`, timestamps | K3 | R own | R | U melalui transaksi status/history/audit | Client update ditolak |
| `reports/{id}/evidence/{eid}` | `storagePath`, `originalName`, `sizeBytes`, `sha256` | K1 | R own | R* | C setelah file diverifikasi | Rules read; client writes ditolak; API checks owner |
| Storage `reports/{id}/evidence/*` | PDF/JPEG/PNG bukti | K1 | Tidak ada akses langsung | Tidak ada akses langsung | Upload/download melalui backend/Admin SDK atau Signed URL | Storage Rules deny-all untuk Client SDK; Signed URL pendek dan audit unduhan |
| `reports/{id}/statusHistory/*` | `fromStatus`, `toStatus`, `actorUid`, `note` | K2 | R own | R* | C append-only | Client mutations ditolak; backend transaksi |
| `conversations/{id}` | reporter/admin/report IDs, status | K2 | R own | R assigned/unassigned | C/U melalui service transaksional | Firestore read rules + backend `assertCanAccessConversation` |
| `conversations/{id}/messages/*` | `body`, `senderUid`, `attachmentPath` | K1 | R own | R assigned/unassigned | C melalui ConversationService | Client mutations ditolak; sender dari token; rate limit |
| `users/{uid}` | `email`, `displayName` | K2 | Get own; perubahan melalui API | Get satu profil, tidak list client | C/U profil melalui service | Firestore client writes ditolak |
| `users/{uid}` | `role` | K3 | Tidak dapat mengubah | Tidak dapat self-assign | Provisioning tepercaya | Custom Claim + Admin SDK |
| Firebase Auth | password credentials, ID token | K1 | Token milik sendiri | Tidak dapat membaca kredensial | Verifikasi/revocation check | Firebase Auth; `verifyIdToken(token, true)` |
| `auditEvents/{id}` | actor/action/target/time/requestId | K3 | — | R | C append-only | Tidak berisi narasi; client write ditolak |
| `knowledgeDocuments`, `knowledgeChunks` | judul, status, chunk text | K3/K4 sesuai publikasi | Tidak ada akses langsung | R | C/U/D via API/pipeline | Firestore Rules; API admin |
| Storage `knowledge-base/*` | PDF sumber internal | K3 | Tidak ada akses langsung | Tidak ada akses langsung | Admin API + Admin SDK | Storage Rules deny-all untuk Client SDK |
| Log aplikasi | requestId, code, status | K3 | — | — | Backend | Jangan mencatat token, narasi kasus, file, atau payload sensitif |
| Permintaan layanan AI | pertanyaan umum + potongan KB disetujui | K4 | C melalui API | C melalui API | Retrieval terbatas | Tidak mengirim narasi laporan/chat pribadi ke AI umum |


a. **SEC-F03:** penanda `*` berarti kebijakan saat ini memberi semua admin terverifikasi akses baca ke seluruh laporan, evidence metadata, dan status history. Kebijakan per kasus belum dapat diterapkan karena skema laporan belum memiliki field penugasan. Perlu keputusan tim/dosen sebelum produksi.

## 3. Aturan penanganan

| Aturan | K1 | K2 | K3 | K4 |
|---|---|---|---|---|
| Log aplikasi | Tidak | Tidak | Hanya ID/kode minimum | Sesuai kebutuhan |
| Dikirim ke layanan AI umum | Tidak | Tidak | Tidak | Hanya materi yang disetujui |
| URL publik/permanen | Tidak | Tidak | Tidak | Hanya materi yang memang dipublikasikan |
| Unduhan/admin access perlu audit | Ya | Ya | Sesuai risiko | — |
| Akses Client SDK | Read terbatas jika diizinkan Rules; seluruh mutasi ditolak | Read terbatas; mutasi ditolak | Ditolak kecuali read admin yang disebut | Via API publikasi |
| Akses Storage Client SDK | Ditolak seluruhnya | Ditolak seluruhnya | Ditolak seluruhnya | Ditolak kecuali keputusan desain baru |

## 4. Keputusan yang belum final

1. **SEC-F03 — cakupan admin:** seluruh laporan atau hanya laporan yang ditugaskan. Jika per kasus dipilih, perlu perubahan skema, query backend, rules, dan pengujian.
2. **Retensi/penghapusan:** jangka simpan laporan, bukti, percakapan, audit, serta prosedur permintaan penghapusan.
3. **Enkripsi tambahan:** evaluasi enkripsi sisi aplikasi untuk narasi/file K1 di luar enkripsi bawaan platform.
4. **Pencadangan:** backup Firestore/Storage harus mewarisi klasifikasi dan kontrol K1/K2.
5. **Lifecycle objek yatim:** tetapkan pembersihan objek hasil Signed Upload yang tidak pernah difinalisasi.
