# Authorization Matrix

**Legend:** R=read, C=create, U=update, D=delete, M=managed by trusted backend. “Own” means the caller owns/is a participant in the resource. Deny by default.

| Resource/action | Public | Reporter (own) | Reporter (other) | Admin authorized | AI service |
|---|---:|---:|---:|---:|---:|
| Public help pages | R | R | R | R | — |
| User profile | — | R/U allowlisted fields | — | R only if operationally justified | — |
| Reports | — | C/R | Deny | R/U status per mandate | Deny |
| Evidence metadata/file | — | C/R own report | Deny | R only for assigned/authorized case | Deny |
| Status history | — | R own report | Deny | R/C through audited workflow | Deny |
| Human chat | — | C/R own conversation | Deny | R/C assigned/authorized conversations | Deny |
| AI general Q&A | — | C | C | C for testing | Process only query + approved KB passages |
| KB document metadata | — | R published sources only | R published sources only | R/C/U/D | R approved indexed material |
| KB original PDFs | — | No direct access unless explicitly published | No direct access | R/C/D | Ingestion-only service access |
| Audit events | — | Deny | Deny | Restricted read; no client writes | Deny |
| Role/claims | — | No write | No write | No self-assignment; provisioning workflow | No access |

## Enforcement requirements
1. Check identity, role, ownership and assignment on every request; hidden buttons are not authorization.
2. Firebase rules enforce client SDK paths; trusted backend uses Admin SDK and therefore must enforce authorization itself.
3. Admin access is least-privilege, auditable and limited to institutional mandate. If all admins can see all reports, that policy must be explicitly approved and disclosed.
4. Sender identity, reporter UID, role, and actor ID derive from verified token, never from payload.
5. Object storage is private. Signed URLs are issued only after a fresh authorization check and expire quickly.
6. AI service must not have database-wide access to reports or chat. Send only the question and approved retrieved passages.
7. Test cross-account access for GET, PATCH, DELETE, realtime listeners, Storage downloads, guessed IDs, and pagination.
8. SISKA tidak menggunakan PostgreSQL/Supabase. Otorisasi wajib ditegakkan dengan Firebase Security Rules untuk akses client dan pemeriksaan ownership/role di setiap Route Handler yang memakai Admin SDK.
