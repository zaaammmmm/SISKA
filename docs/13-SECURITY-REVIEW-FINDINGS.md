# 13 — Temuan Review Keamanan Akses SISKA

**Tanggal review:** 31 Oktober 2026  
**Cakupan:** Firestore Rules, Storage Rules, konfigurasi Firebase, backend authorization, evidence upload/download, percakapan, dan paket pengujian.  
**Metode:** analisis statis source code serta penyiapan skenario tes. Firebase Emulator/API IDOR belum dieksekusi pada lingkungan pembuatan paket; status runtime tidak boleh diasumsikan lulus.

## 1. Ringkasan temuan

| ID | Tingkat | Temuan | Status pada paket gabungan | Pemilik |
|---|---|---|---|---|
| SEC-F01 | Sedang | Pembuatan percakapan client tidak membatasi `reportId` dan `assignedAdminId` | Mitigasi dengan menolak seluruh client writes; backend tetap memvalidasi ownership dan membuat `assignedAdminId: null` | Keamanan Akses + Backend |
| SEC-F02 | Sedang | Admin lain dapat mengirim pesan pada percakapan belum ditugaskan melalui Client SDK | Mitigasi dengan menolak seluruh client message writes; backend melakukan claim transaksional | Keamanan Akses + Backend |
| SEC-F03 | Kebijakan | Semua admin terverifikasi dapat membaca seluruh laporan/evidence/status history | Terbuka; perlu keputusan tim/dosen | Tim + dosen pembimbing |
| SEC-F04 | Sedang | Storage Rules sebelumnya mengizinkan akses bukti langsung melalui Client SDK | Diperbaiki pada paket ini: seluruh Storage Client SDK read/write ditolak | Keamanan Akses + Backend |
| SEC-F05 | Sedang | Base64 upload menerima `evidenceId` dari client dan dapat menimpa objek sebelum metadata `batch.create` gagal | Terbuka; perlu perbaikan backend dan uji reproduksi | Backend |
| SEC-F06 | Sedang | Upload/JSON/unduhan dapat dimuat penuh ke memori sebelum batas ukuran diverifikasi | Terbuka; perlu streaming dan batas body | Backend |
| SEC-F07 | Rendah | Signed Upload URL belum membatasi panjang/ukuran objek pada lapisan GCS; Signed Download belum memaksa attachment disposition | Terbuka; kaji dukungan GCS dan pengiriman header | Backend |
| SEC-F08 | Rendah | Objek hasil Signed Upload yang tidak difinalisasi berpotensi menjadi orphan | Terbuka; lifecycle rule/cleanup job diperlukan | Backend/DevOps |
| SEC-F09 | Sedang | Rate limiter berbasis memori satu instance tidak konsisten di serverless/multi-instance | Terbuka; perlu distributed rate limit | Backend |
| SEC-F10 | Rendah | CSP masih mengandung `unsafe-inline`/`unsafe-eval` | Terbuka; koordinasi frontend | Frontend |
| SEC-F11 | Rendah | Pemeriksaan signature file hanya memeriksa header awal; belum mendeteksi semua polyglot | Catatan residual; evaluasi scanner/decoder | Backend |
| SEC-F12 | Sedang | Rules belum memiliki harness Emulator dan bukti run | Harness, config, dan skenario tersedia; eksekusi aktual masih pending | Keamanan Akses |
| SEC-F13 | Sedang | Fallback profil reporter dapat bertentangan dengan Custom Claim admin | Diperbaiki pada Firestore Rules: fallback hanya bila token tidak memiliki role SISKA valid | Keamanan Akses |
| SEC-F14 | Sedang | `assignedAdminId: null` dapat tertimpa alias `adminUid` yang stale pada helper backend | Diperbaiki: resolver backend mengikuti keberadaan field kanonis seperti Rules | Backend |
| SEC-F15 | Rendah | Dokumentasi/konfigurasi emulator sebelumnya menyebut port Firestore 8080, sedangkan kode/config memakai 8085 | Diselaraskan ke 8085 pada config, docs, dan unit test | Keamanan Akses + Backend |
| SEC-F16 | Rendah | Helper path Knowledge Base berbeda dari path yang digunakan service (`knowledge/` vs `knowledge-base/`) | Diperbaiki ke `knowledge-base/{documentId}/v1.pdf` | Backend |

## 2. Penjelasan perbaikan Rules

### SEC-F01 — Pembuatan percakapan

Client SDK tidak lagi dapat membuat dokumen `conversations` secara langsung. Alur resmi adalah `POST /api/v1/conversations`. `createOrOpenConversation()` memeriksa laporan melalui `assertCanReadReport()` di dalam transaksi, membuat ID deterministik, dan mengisi `assignedAdminId: null`. Dengan demikian client tidak dapat menghubungkan percakapan ke laporan orang lain atau menentukan admin sendiri.

### SEC-F02 — Pengiriman pesan

Client SDK tidak lagi dapat membuat dokumen `messages` secara langsung. Pengiriman melalui `POST /api/v1/conversations/{id}/messages` memanggil `ConversationService.sendMessage()`, menerapkan `assertCanAccessConversation(..., 'send')`, memeriksa status, menerapkan rate limit di Route Handler, mengambil `senderUid` dari token, serta mengizinkan admin pertama yang sah mengklaim percakapan unassigned dan mengirim pesan dalam satu transaksi. Setelah claim commit, admin lain ditolak.

### SEC-F03 — Cakupan baca admin

Rules dan backend saat ini memberi admin terverifikasi akses baca ke seluruh laporan, metadata evidence, dan status history. Itu konsisten dengan pemeriksaan backend saat ini, tetapi belum tentu konsisten dengan prinsip least privilege. Pilihan kebijakan:

- **Opsi A:** secara resmi menyetujui bahwa semua admin SISKA merupakan petugas berwenang untuk semua laporan; dokumentasikan dasar kewenangan, SOP, dan kewajiban audit.
- **Opsi B:** tambahkan `assignedAdminId`/model penugasan pada laporan, ubah Rules, `assertCanReadReport()`, `listReports()`, download evidence, query, dan tes. Perlu koordinasi Backend + pemilik proses.

Jangan mengubahnya sepihak di Rules saja karena akan membuat perilaku Rules dan API berbeda.

### SEC-F04 — Storage access

Seluruh akses langsung melalui Firebase Storage Client SDK ditolak. Source frontend yang dilampirkan tidak menggunakan operasi Firebase Storage client untuk upload/download; alur evidence menggunakan API backend. Backend menyimpan melalui Admin SDK atau menerbitkan Signed URL. Admin SDK dan Signed URL tidak dievaluasi oleh Firebase Storage Rules; endpoint penerbit URL tetap harus memeriksa role/ownership.

### SEC-F12 — Pengujian

`firebase.json`, script npm, dan 45 skenario Rules telah disediakan. Namun suite membutuhkan `@firebase/rules-unit-testing` dan Firebase CLI pada mesin pengembang. Status tes tetap **belum dijalankan** sampai terminal menghasilkan output aktual yang dicatat di `docs/11-SECURITY-RULES-TEST-RESULTS.md`.

## 3. Catatan backend yang tetap harus ditindaklanjuti

- **SEC-F05:** pada mode base64, periksa apakah `evidenceId` dari client dapat menimpa objek yang sudah ada. Pilihan aman: selalu generate ID baru di server dan simpan objek dengan precondition `ifGenerationMatch: 0`; pastikan cleanup tidak menghapus objek lama saat terjadi `ALREADY_EXISTS`.
- **SEC-F06:** batasi `Content-Length`/`file.size` sebelum membaca body; batasi panjang base64; periksa metadata ukuran Storage sebelum mengunduh objek penuh.
- **SEC-F07:** evaluasi batas ukuran pada Signed Upload URL sesuai dukungan GCS; tambahkan `Content-Disposition: attachment` pada Signed Download bila tepat.
- **SEC-F08:** tambahkan bucket lifecycle atau job terjadwal untuk objek yang diunggah tetapi tidak difinalisasi.
- **SEC-F09:** ganti rate limiter in-memory dengan penyimpanan terdistribusi bila deployment berjalan lebih dari satu instance.
- **SEC-F10/F11:** koordinasikan penguatan CSP dan pemindaian/validasi berkas dengan pemilik frontend/backend.

## 4. Yang sudah benar pada arsitektur saat ini

- ID token diverifikasi dengan `verifyIdToken(token, true)`.
- Otoritas admin di backend memerlukan Custom Claim yang terverifikasi.
- UID reporter, sender, dan aktor audit berasal dari caller token di backend.
- Akses lintas pemilik pada laporan/evidence/percakapan memakai pesan 404 seragam di backend.
- Perubahan status laporan menggunakan transaksi/history/audit.
- Bukti tidak disimpan sebagai URL publik permanen; alur download memakai Signed URL sementara.
- `auditEvents` tidak dapat ditulis oleh Client SDK dan tidak memuat narasi laporan.

## 5. Keputusan / bukti yang dibutuhkan sebelum produksi

1. Persetujuan tertulis atas SEC-F03.
2. Jalankan 27 tes Firestore Rules dan 18 tes Storage Rules di Emulator Suite.
3. Jalankan API IDOR serta backend unit/service tests.
4. Uji upload/download signed URL di emulator/staging dan pastikan TTL, ownership, serta file lifecycle sesuai.
5. Tindaklanjuti temuan SEC-F05 sampai SEC-F11 atau dokumentasikan penerimaan risiko oleh penanggung jawab.


## 6. Kontrol khusus AI Node.js pada branch development

Branch development menyertakan microservice RAG Node.js di `ai-service/` dan API admin SISKA `/api/v1/admin/ai-documents`. Route API admin tersebut wajib memverifikasi Custom Claim admin sebelum memanggil microservice. Semua endpoint microservice selain `/health` wajib memvalidasi `X-Service-Authorization`; secret hanya ada di environment server dan tidak boleh disertakan pada bundle browser atau log. Tes E2E existing `ai-service/tests/server.e2e.test.js` mencakup penolakan secret hilang/salah dan otorisasi admin-document operations pada service boundary. IDOR harness terintegrasi menambahkan kontrol negatif reporter terhadap `/api/v1/admin/ai-documents`. Hasil kedua suite tetap harus dijalankan pada mesin pengembang.
