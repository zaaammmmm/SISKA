# Backend Architecture

## 1. Baseline keputusan
Proposal menetapkan Next.js App Router + Firebase. Gunakan Next.js Route Handlers sebagai boundary API/domain dan Firebase Admin SDK hanya di server. Firebase Authentication memverifikasi identitas; Firestore menyimpan dokumen; Cloud Storage menyimpan berkas privat; Firebase Security Rules dan App Check menjadi lapisan tambahan. Supabase tidak digunakan pada SISKA; seluruh akses data dan autentikasi harus memakai Firebase.

## 2. Komponen
1. **Web client:** UI dan validasi UX; tidak menjadi sumber otoritas.
2. **Next.js Route Handlers:** validasi schema, verifikasi Firebase ID token, pemeriksaan role/ownership, rate limiting, domain services, audit event.
3. **Domain services:** `AuthzService`, `ReportService`, `EvidenceService`, `ConversationService`, `KnowledgeBaseService`, `AuditService`.
4. **Firebase Admin SDK:** akses server ke Firestore/Storage; secret hanya pada server.
5. **AI service (FastAPI):** dipanggil server-to-server; tidak dipercaya untuk menentukan akses laporan.
6. **Background worker:** indexing PDF, cleanup file/chunk, retry job; idempotent dan observable.

## 3. Struktur direktori yang disarankan
```text
src/
  app/api/v1/{reports,conversations,ai,admin}/.../route.ts
  app/(public)/...
  app/(auth)/...
  app/(reporter)/...
  app/(admin)/...
  components/{common,auth,reporter,admin,chat,ai}/
  lib/firebase/{client.ts,admin.ts,auth.ts,firestore.ts,storage.ts}
  server/{authz,services,validators,rate-limit,audit}/
  types/{api,domain}/
  stores/                 # UI state only; no authorization logic
  tests/{unit,integration,e2e}/
ai-service/
  app/{main.py,api,rag,ingestion,security}/
```

## 4. Request flow
1. Client memperoleh Firebase ID token dari Firebase Auth.
2. Route handler memverifikasi token melalui Admin SDK; role/claims diambil dari sumber tepercaya.
3. Validasi request dengan schema allowlist; jangan menerima `reporterId`, `role`, atau `senderId` sebagai otoritas dari client.
4. Domain service memeriksa ownership/role untuk resource spesifik.
5. Operasi status dan history menggunakan transaction/batch yang sesuai.
6. File upload menggunakan signed upload atau endpoint streaming dengan batas ukuran; object path dibuat server-side.
7. Audit metadata minimum; response tidak memuat field yang tidak diperlukan.

## 5. Security controls
- Firestore rules default-deny dan uji dengan Firebase Emulator Suite.
- Custom claims/role provisioning hanya melalui admin SDK; cegah privilege escalation.
- Storage rules mengikat path dengan UID/resource authorization; signed URL maksimal 5 menit untuk bukti.
- MIME allowlist, ukuran maksimum awal 5 MiB, signature/content inspection, filename random, antivirus scanning bila tersedia.
- Rate limit login, create report, messages, AI, upload, dan admin operations.
- CORS allowlist; security headers; CSP yang diuji; cookie/session strategy konsisten.
- Secrets dari secret manager/env runtime; `.env.example` hanya placeholder.
- PII redaction pada log; request IDs; alert untuk pola akses tidak normal.
- Backup, retensi, incident response, dan prosedur akses petugas ditetapkan sebelum produksi.

## 6. Status dan transaksi
Transisi status divalidasi pada backend. Satu transaksi memperbarui `reports.status`, `updatedAt`, `resolvedAt` bila relevan, menambah `statusHistory`, dan menghasilkan audit event. Client tidak boleh menulis langsung status/history.

## 7. Firebase rules (konsep, bukan file deploy siap pakai)
- users: user dapat membaca/mengubah subset profil miliknya; `role`, `uid`, timestamps sistem tidak boleh ditulis client.
- reports: reporter create dengan `reporterId == request.auth.uid`; read hanya owner; admin access melalui claim dan aturan eksplisit; update sensitif hanya backend tepercaya.
- evidence: bucket private; validasi owner/admin terhadap laporan terkait; jangan bergantung pada URL publik.
- conversations/messages: hanya peserta dan admin yang ditugaskan/berwenang; sender UID harus cocok dengan token; role tidak diambil dari payload.
- KB: hanya admin dapat mengelola; pengguna hanya dapat mengakses jawaban/sumber yang dipublikasikan.
- audit: tidak dapat dibaca reporter dan tidak dapat dimodifikasi client.

Rules final harus diuji dengan emulator dan tidak boleh disalin mentah tanpa memetakan struktur dokumen yang sebenarnya.

## 8. Error contract
Gunakan `{code, message, requestId}`. Kode contoh: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `UPLOAD_REJECTED`, `CONFLICT`, `INTERNAL_ERROR`. Jangan membedakan “resource tidak ada” dengan “resource milik orang lain” jika pembedaan membocorkan keberadaan data.

## 9. Observability dan deployment
Pisahkan dev/staging/production; gunakan Firebase Emulator Suite untuk Auth/Firestore/Storage; CI menjalankan lint, typecheck, unit/integration tests, dependency audit, secret scan. Deploy AI service secara terpisah; health check, timeout, retry terbatas, circuit breaker dan metrik latency/error. Tidak ada klaim SLA sampai diukur.

## 10. Migrasi kode dari KOPKAS (bukan migrasi platform berjalan)
- Cari dan hapus seluruh import, environment variable, query, realtime subscription, dan helper Supabase dari aplikasi SISKA.
- Buat adapter Firebase terpisah: client SDK hanya untuk kebutuhan client yang diizinkan; Admin SDK hanya di server.
- Reuse UI/layout setelah audit; ganti store data/auth/storage dengan API/domain services SISKA berbasis Firebase.
- Migrasi bertahap: UI reuse → Firebase Auth → Firestore domain services → private evidence → chat → AI proxy → tests.
- Jangan migrasikan data produksi KOPKAS kecuali ada keputusan eksplisit, dasar hukum/otorisasi, pemetaan, masking, dan prosedur penghapusan.
