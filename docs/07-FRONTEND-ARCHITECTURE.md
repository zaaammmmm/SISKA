# Frontend Architecture

## 1. Product surface
Align with `Siska Pages.png` and use-case diagram: public home; login/register/forgot password/terms; user dashboard; create report with optional evidence; report list/detail/status; chat with admin; SISKA AI chat/history; profile; admin dashboard; admin report list/detail/status update; admin chat; PDF knowledge-base management (upload/list/delete/reindex).

## 2. Technology
Next.js App Router, React, TypeScript, Tailwind CSS. Keep UI state in Zustand only where cross-component state is useful. Server data fetching/mutations go through the API/service boundary; no direct database authority in UI. Accessible components, keyboard navigation, semantic labels and clear loading/error states are mandatory.

## 3. Proposed route tree
```text
src/app/
  (public)/page.tsx
  (auth)/login/page.tsx
  (auth)/register/page.tsx
  (auth)/forgot-password/page.tsx
  (auth)/terms/page.tsx
  (reporter)/user/page.tsx
  (reporter)/user/reports/page.tsx
  (reporter)/user/reports/new/page.tsx
  (reporter)/user/reports/[reportId]/page.tsx
  (reporter)/user/chat/page.tsx
  (reporter)/user/ai/page.tsx
  (reporter)/user/profile/page.tsx
  (admin)/admin/page.tsx
  (admin)/admin/reports/page.tsx
  (admin)/admin/reports/[reportId]/page.tsx
  (admin)/admin/chat/page.tsx
  (admin)/admin/knowledge-base/page.tsx
  api/v1/.../route.ts
```

## 4. Component domains
- `components/common`: button, input, modal, status badge, pagination, loading, empty state, error notice.
- `components/auth`: login, register, reset password, terms acceptance.
- `components/reporter`: dashboard, report form, report list, detail, evidence uploader, status timeline.
- `components/admin`: metrics, report table, filters, detail panel, status transition form, KB document table.
- `components/chat`: conversation list, transcript, composer, attachment metadata.
- `components/ai`: mode selector, answer, citations, disclaimer, feedback.

## 5. Data flow and state
- Server/API is source of truth; client cache must be invalidated after mutations.
- Zustand stores UI state (selected conversation, filters, draft UI) not authorization decisions.
- Each request includes bearer token; server derives identity from token.
- Use pagination and stable sort; do not load all reports/messages at once.
- Optimistic UI only for low-risk actions; status updates must confirm server success.
- Realtime listeners must unsubscribe on unmount and be scoped to authorized channels.

## 6. UX and privacy requirements
- Explain what data is collected, who can access it, and that login means not fully anonymous.
- Do not show full report narrative on dashboard cards; minimize sensitive preview.
- Evidence list shows filename/type/date, not public links.
- Confirm before deleting documents or performing irreversible actions.
- Avoid storing report contents in localStorage/sessionStorage. If AI chat history uses localStorage, keep it separate, clearly disclose it, provide clear/delete controls, and never store auth tokens there.
- Mask sensitive content in notifications and browser titles; do not include case details in URLs.
- Empty/error states should not disclose whether another person's report exists.

## 7. Design system
Use SISKA identity/palette from approved Figma/proposal. Reuse KOPKAS generic controls only after accessibility/security review; do not blindly reuse branding that still names KOPKAS. Standardize spacing, type scale, focus states, responsive navigation, status colors plus text labels (not color alone), and contrast.

## 8. Migration inventory
Detailed file-by-file disposition is in `Source code kopkas yang masih bisa dimanfaatkan/REUSE-INVENTORY.md`. Reuse low-level components and layout after removing Supabase assumptions. Replace Supabase-specific stores and middleware rather than performing global search/replace.


## Keputusan platform
SISKA menggunakan Firebase saja untuk autentikasi, data, dan file. Jangan menambahkan Supabase client, Supabase Auth, PostgreSQL/RLS, atau Supabase Storage. Source KOPKAS lama hanya sumber reuse dan harus dibersihkan dari integrasi Supabase.
