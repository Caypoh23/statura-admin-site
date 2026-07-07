# Statura System Contract

## Mobile App Responsibilities

- Authenticated clients/trainers use the mobile app.
- Users can report chat messages from mobile.
- Trainers upload content into `trainer_content`.
- AI uses only active, non-private trainer content.
- Mobile never uses a service-role key.

## Backend Responsibilities

- Supabase Auth owns identity.
- `profiles.role` defines access: `client`, `trainer`, `admin`.
- RLS checks `public.is_admin()` for admin-only reads/writes.
- `content_reports` is the single moderation intake queue.
- `public.admin_moderate_report(...)` performs moderation transactionally:
  target update, report resolution, and audit insert.
- `public.admin_moderate_target(...)` lets admins proactively flag/hide/remove
  chat messages and trainer content without waiting for a user report.
- `public.admin_set_user_moderation_status(...)` lets admins restrict or
  suspend abusive accounts.
- `ai_interactions` stores prompt/response/context for AI-generated chat
  answers.
- `public.admin_ai_interactions_overview(...)` exposes AI audit rows to admins.
- `moderation_actions` is the audit log.

## Admin Web Responsibilities

- Admin users sign in with Supabase Auth.
- Admin UI reads the same production tables through admin RLS.
- Admin actions call `admin_moderate_report`; no multi-step client-side
  moderation writes.
- Admin UI can inspect reports, chat messages, trainer content, users, AI
  interaction audit, and moderation audit.
- Admin UI must never use a service-role key in browser runtime.

## End-to-End Flow

1. Client or trainer reports a message in mobile.
2. Mobile inserts into `content_reports` as the authenticated user.
3. Admin web lists open reports.
4. Admin inspects the target row.
5. Admin applies `hide`, `remove`, `restore`, `resolve_report`, or
   `dismiss_report`.
6. Supabase RPC updates the target, closes the report, and writes audit.
7. Mobile queries filter out hidden/removed content through RLS and app logic.
8. If behavior is account-level abusive, admin restricts/suspends the profile;
   RLS blocks new chat messages, reports, and trainer content writes.
9. AI answers are saved in `chat_messages` and mirrored into
   `ai_interactions` with the user prompt, assistant text, resolved intent,
   trainer/client ids, and trainer content ids used in the answer.
