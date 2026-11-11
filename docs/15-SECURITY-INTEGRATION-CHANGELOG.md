# 15 — Changelog Integrasi Keamanan pada SISKA Development

**Basis proyek:** `SISKA-development.zip` (branch development yang dilampirkan).
**Sumber security patch:** `SISKA-security-final.zip`, hanya perubahan yang kompatibel dipilih.
**Tujuan:** mempertahankan seluruh fitur development, khususnya Node.js RAG microservice, halaman Audit, API `ai-documents`, komponen AI/PDF, live pages, aset, dan test AI.

## File existing yang diubah

| File | Perubahan | Alasan |
|---|---|---|
| `firestore.rules` | Diganti dengan backend-mediated writes; read dibatasi; Custom Claim valid diprioritaskan; field kanonis conversation menang atas alias | Mencegah privilege escalation, client-side mutation bypass, dan akses percakapan lintas akun |
| `storage.rules` | Seluruh akses langsung Client SDK ditolak | Seluruh alur file resmi harus melalui backend/Admin SDK atau Signed URL setelah authorization |
| `src/server/authz/permissions.ts` | Resolver `reporterId`/`assignedAdminId` memakai keberadaan field kanonis, bukan nullish fallback | Nilai kanonis `null` tidak dapat dioverride alias stale |
| `src/lib/firebase/storage.ts` | Path Knowledge Base diselaraskan menjadi `knowledge-base/{documentId}/v1.pdf` | Sama dengan path yang dibuat `KnowledgeService` |
| `firebase.json.example`, `.env.example`, `next.config.ts`, `src/lib/firebase.ts` | Port emulator Firestore disamakan ke `8085`; `serverExternalPackages: ['pdfjs-dist']` tetap dipertahankan | Konsistensi config tanpa merusak PDF extractor |
| `package.json` | Menambahkan script Rules, IDOR, dan AI service test tanpa menghapus test AI/PDF yang sudah ada | Menjaga seluruh pengujian development dan menambah keamanan |
| `src/tests/unit/backend-test-plan.test.mjs` | Menambahkan tes resolver canonical-vs-alias; memperbarui path KB dan port test | Membuktikan resolver backend dan menyamakan fixture |
| `README.md` | Menambah petunjuk security test dan memperbaiki rujukan port/config root | Memudahkan setup dan bukti kerja |
| `docs/05-BACKEND-ARCHITECTURE.md` | Menjelaskan Rules, backend-mediated writes, Storage deny-all, dan AI Node.js aktual | Dokumentasi mengikuti source branch development |
| `docs/08-AUTHORIZATION-MATRIX.md` | Mempertahankan matrix awal dan menambahkan detail Firestore, Storage, API, AI Service | Matriks mencakup role serta semua boundary teknis |
| `docs/09-TEST-PLAN.md` | Mempertahankan tes AI/fitur lalu menambahkan 27 Firestore, 18 Storage, IDOR dan AI service E2E | Traceability test |
| `docs/10-DEVELOPMENT-ROADMAP.md` | Menyelaraskan roadmap implementasi AI menjadi Node.js RAG service | Source aktif berbeda dari rancangan FastAPI awal |

## File baru

| File | Tujuan |
|---|---|
| `scripts/idor-check.mjs` | Uji API IDOR lintas akun, role, chat, evidence, KB, audit, dan AI document admin |
| `src/tests/rules/firestore.rules.test.mjs` | 27 skenario Firestore Rules |
| `src/tests/rules/storage.rules.test.mjs` | 18 skenario Storage Rules |
| `docs/11-SECURITY-RULES-TEST-RESULTS.md` | Template bukti run aktual (tetap pending sebelum dijalankan) |
| `docs/12-DATA-CLASSIFICATION.md` | Klasifikasi sensitivitas data |
| `docs/13-SECURITY-REVIEW-FINDINGS.md` | Temuan dan risiko residual |
| `docs/14-FIREBASE-SECURITY-DEPLOYMENT.md` | Setup, test, staging deployment, rollback |
| `docs/15-SECURITY-INTEGRATION-CHANGELOG.md` | Changelog integrasi ini |
| `docs/16-SECURITY-CHANGE-REVIEW.md` | Perbandingan kondisi development dan kondisi setelah integrasi |
| `docs/17-SECURITY-JOBDESK-TRACEABILITY.md` | Pemetaan jobdesk ke artefak dan bukti |

## File development yang sengaja dipertahankan

- `ai-service/` beserta Node.js RAG, data export, notebook, dan E2E test.
- `src/server/contracts/ai-service.contract.ts` versi Node.js.
- `src/server/services/ai.service.ts` dan `knowledge.service.ts` versi development.
- `src/app/api/v1/admin/ai-documents/route.ts` serta endpoint/halaman AI yang ada.
- `src/components/ai-chat.tsx`, `src/components/live-pages.tsx`, `src/server/services/ai-pdf-extractor.ts`, `src/lib/ai-reply.ts`.
- `src/app/admin/audit/`, `public/siska.png`, test `ai-reply` dan `ai-pdf-extractor`.
- Dependency `pdfjs-dist` dan Next config `serverExternalPackages`.
- Field metadata `lastMessage`, `lastMessageSenderUid`, dan `lastMessageAt` pada conversation service/domain/UI.

Tidak digunakan: penggantian file AI dari security-final yang mengubah kontrak menjadi FastAPI, penghapusan preview chat, atau penggantian package manifest yang menghilangkan dependency/test AI.

## Dependensi dan status

`@firebase/rules-unit-testing@^4.0.1` perlu ditambahkan di mesin pengembang menggunakan `npm install --save-dev @firebase/rules-unit-testing@^4.0.1`; perintah itu akan memperbarui `package.json` dan `package-lock.json`. Firebase CLI diperlukan untuk emulator. Tidak ada hasil runtime yang dikarang dalam paket ini.
