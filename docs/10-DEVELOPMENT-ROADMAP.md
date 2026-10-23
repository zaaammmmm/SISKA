# Development Roadmap — Scrumban

## 1. Working agreements
Use GitHub Projects columns: Backlog → Todo → In Progress → Review → Done. Every task has owner, acceptance criteria, risk, test evidence and links to relevant requirement IDs. Limit WIP (suggestion: 2 active tasks/person); prioritize security and data model before feature breadth. Five-week schedule follows the proposal and is an initial plan, not a guarantee.

## 2. Milestones
| Week | Goal | Deliverables / exit criteria |
|---|---|---|
| 1 — Discovery & setup | Confirm process, roles, privacy and technology | Approved scope/SRS, status workflow, data classification, wireframes, ERD, Firebase projects/environments, backlog |
| 2 — Foundation | Auth, role model, API contracts, design system | Registration/login/reset, trusted role provisioning, Firestore/Storage rules draft, Emulator Suite, CI, API spec |
| 3 — Core reports | Create/list/detail/evidence/status/dashboard | Report CRUD, private evidence, status history, admin list/detail, integration tests |
| 4 — Chat + AI/RAG | Chat and optional AI knowledge base | Participant-only chat, KB upload/index/delete, RAG endpoint, citation/abstention, security test pass |
| 5 — Verification & handoff | Fix, test, document, demo/deploy | E2E/security/usability reports, critical findings closed, deployment runbook, README, demo dataset |

## 3. Backlog by epic
### E0 — Governance and privacy
- Confirm official service owner, admin authority, contact/escalation content, data retention, consent and privacy notice.
- Konfirmasi Firebase sebagai satu-satunya backend; ganti semua adapter Supabase yang ada di KOPKAS.
- Approve report status transitions and whether admins are assigned or global.

### E1 — Foundation
- Create Next.js TypeScript app and lint/typecheck/build CI.
- Configure Firebase dev/staging/prod and Emulator Suite.
- Implement token verification, role provisioning, default-deny rules and error contract.

### E2 — Reporter workflow
- Public pages/auth/profile.
- Report creation and validation.
- Private evidence upload/download.
- Report list/detail/status timeline and dashboard.

### E3 — Admin workflow
- Admin dashboard and filters.
- Detail review and audited status transition.
- User-admin chat and assignment policy.
- KB document management with permission checks.

### E4 — SISKA AI
- Approve and version knowledge sources.
- Build PDF ingestion, chunking, embedding, retrieval, relevance gate, citations and abstention.
- Implement FastAPI auth/service boundary, health, rate limit and timeouts.
- Evaluate golden set and prompt injection before exposing UI toggle.

### E5 — Quality and release
- Unit/integration/E2E tests.
- Cross-account/Storage/Realtime tests.
- Responsive/accessibility checks.
- Dependency/secret scans, backup/retention and incident response checklist.
- Final README, architecture diagrams, demo script and known limitations.

## 4. Reuse strategy from KOPKAS
- **Reuse with adaptation:** public-home content structure, layout patterns, common UI primitives, report form/list/detail presentation, admin table patterns, chat layout, dashboard visualizations, date formatting, logo only if rebranded and approved.
- **Refactor before reuse:** route groups, login/register/forgot password UI, report stores, chat stores, dashboard stores, database types, middleware, user profile and evidence handling.
- **Replace:** Supabase client/query layer, Supabase Auth helpers, Supabase-specific database types, `getPublicUrl` evidence flow, any role/authorization logic tied to Supabase, and unsupported public-bucket assumptions.
- **Do not claim done:** RLS/Storage security, AI/RAG, audit trail, end-to-end encryption, reset-password functionality, and Firebase rules unless implemented and tested.

## 5. Definition of Done
Code reviewed; lint/typecheck/build pass; tests added; API/schema docs updated; no secret committed; authorization verified; accessibility baseline checked; errors/logs reviewed for PII; docs and demo updated; no critical/high finding left open without formal risk acceptance.

## 6. Team coordination
Follow proposal role allocation: Project Manager & Full-Stack Developer coordinates integration; Frontend owns page/components; Backend/Database owns domain services and schema; System Analyst owns requirements and acceptance criteria; AI Engineer owns RAG/evaluation; Data & Access Security owns rules/access tests; Application Security & Testing owns secure coding/security retest; UI/UX and testers own usability and evidence. Review sensitive-data flows jointly.
