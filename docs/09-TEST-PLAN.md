# Test Plan

## 1. Objectives
Verify functional correctness, authorization boundaries, privacy controls, usability, responsiveness, resilience, and SISKA AI grounding. Test environments must use synthetic data only; never use real reports or evidence without formal authorization and a protected test protocol.

## 2. Test levels
- Unit: validators, status transition rules, authorization helpers, file policy, RAG chunking/retrieval/citation validation.
- Integration: Firebase Auth/Firestore/Storage using Emulator Suite; Next.js API + AI service; transaction and cleanup behavior.
- E2E: public → register/login → create report → evidence → view status → chat; admin login → review → status update → user sees update; KB upload/reindex/query/delete.
- Security: authorization, IDOR, XSS, injection, CSRF where relevant, rate limiting, upload abuse, secret exposure, prompt injection, data leakage.
- Usability/accessibility: keyboard, screen reader labels, contrast, responsive layouts and task completion.

## 3. Core test cases
| ID | Scenario | Expected result |
|---|---|---|
| AUTH-01 | Valid registration/login | Session established; role reporter by default |
| AUTH-02 | Invalid credentials | Generic safe error; no account enumeration |
| AUTH-03 | Password reset | Approved recovery flow sends reset link and handles expiry |
| AUTH-04 | Reporter attempts to set role=admin | Server ignores/rejects; no privilege change |
| REP-01 | Submit valid report | Record created with server-derived reporter UID |
| REP-02 | Missing/oversized/invalid fields | Validation error; no partial record |
| REP-03 | Reporter A fetches reporter B report by guessed ID | Denied or indistinguishable not-found response |
| REP-04 | Reporter patches status directly | Denied |
| REP-05 | Admin changes valid status | Status and history committed atomically |
| REP-06 | Invalid status transition | Conflict/validation response; no mutation |
| FILE-01 | Upload allowed PDF/JPEG/PNG within limit | Private file stored and metadata recorded |
| FILE-02 | Spoofed MIME, executable, oversized file | Rejected; no publicly accessible object |
| FILE-03 | Cross-user evidence download | Denied; no signed URL issued |
| FILE-04 | Database write fails after upload | Compensating cleanup or recoverable orphan job |
| CHAT-01 | Participant sends message | Message saved and realtime delivered only to participants |
| CHAT-02 | Nonparticipant subscribes/reads | Denied |
| CHAT-03 | XSS payload in message | Rendered as text; never executed |
| KB-01 | Admin uploads approved PDF | Validated, status transitions to indexed or failed |
| KB-02 | Reporter calls admin KB endpoint | 403; no side effect |
| KB-03 | Delete document | Original, chunks, vector entries and cache invalidated |
| AI-01 | Answerable question with source | Accurate response with valid source reference |
| AI-02 | Unsupported question | Clear abstention; no fabricated citation |
| AI-03 | Prompt injection in user query or PDF | Instructions ignored; only policy-compliant grounded answer |
| AI-04 | Request for report/private data | Refused; no report data retrieved |
| AI-05 | Emergency/urgent safety question | Displays only approved contact information and human escalation guidance |
| PRIV-01 | Inspect logs/analytics | No secrets, evidence, report narrative or raw sensitive transcript |
| UX-01 | Mobile core flow | No blocking layout/navigation issues at 360px width |
| REL-01 | AI provider timeout | Bounded timeout, safe fallback, no duplicate runaway requests |

## 4. Security testing method
- Build two reporter accounts (A/B), one admin, and one unauthorized account.
- Attempt direct API requests and direct Firebase SDK queries, not only UI navigation.
- Test guessed resource IDs, altered UID/role fields, stale tokens, expired signed URLs, realtime channel reuse and Storage path manipulation.
- Run dependency and secret scanning; review CSP/security headers and upload pipeline.
- Record severity, reproduction steps, sanitized evidence, owner, remediation and retest.

## 5. AI evaluation
Use a reviewed golden set covering exact facts, paraphrase, multi-document questions, out-of-scope advice, conflicting/outdated sources, prompt injection, sensitive-data requests, and emergency-related queries. Measure retrieval Recall@k/MRR, citation precision, groundedness, correctness rubric, abstention behavior, p50/p95 latency and cost. Two reviewers adjudicate disagreements. Report dataset size and confidence/limitations; do not set a fabricated accuracy result.

## 6. Acceptance gates
- No open critical/high security findings before public deployment.
- All authorization tests pass in Emulator Suite and staging.
- Every functional requirement has linked test evidence or an explicitly accepted deferral.
- Upload privacy and lifecycle tested end-to-end.
- AI citations validated; out-of-scope and prompt-injection tests pass threshold defined by project team.
- Usability findings and known limitations documented.


## Keputusan platform
SISKA menggunakan Firebase saja untuk autentikasi, data, dan file. Jangan menambahkan Supabase client, Supabase Auth, PostgreSQL/RLS, atau Supabase Storage. Source KOPKAS lama hanya sumber reuse dan harus dibersihkan dari integrasi Supabase.
