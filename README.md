# Statura Admin

Standalone web admin for Statura moderation and support.

This repository is intentionally separate from `statura-mobile`. It connects to
the same Supabase project through the public anon key and an authenticated admin
user session. No `service_role` key is used in the browser.

## What It Controls

- Open / reviewing / resolved / dismissed user reports.
- Chat message moderation status.
- Trainer content moderation status.
- Account restriction / suspension status for abusive UGC users.
- AI interaction audit: user prompt, assistant response, trainer/client context,
  intent, and trainer content ids used by the answer.
- Target preview for reports.
- Admin audit log from `moderation_actions`.
- High-level operational metrics.

## Required Backend

The mobile repository owns the shared backend contracts:

- `content_reports`
- `moderation_actions`
- moderation columns on `chat_messages`
- moderation columns on `trainer_content`
- moderation columns on `profiles`
- `ai_interactions`
- `public.is_admin()`
- `public.admin_moderate_report(...)`
- `public.admin_moderate_target(...)`
- `public.admin_set_user_moderation_status(...)`
- `public.admin_ai_interactions_overview(...)`
- Supabase Storage bucket `trainer-content`

Apply the mobile repo migrations before using this admin.

## Local Run

Create `config.js` from the example:

```bash
cp config.example.js config.js
```

Fill in the project URL and anon key, then run any static server:

```bash
npm run dev
```

Open `http://localhost:4173`.

## Hosting

This is a static site. Recommended deployment:

1. Host on Vercel, Netlify, Cloudflare Pages, or any private static host.
2. Serve only over HTTPS.
3. Set `window.STATURA_ADMIN_CONFIG` in `config.js` at deploy time:

```js
window.STATURA_ADMIN_CONFIG = {
  supabaseUrl: "https://<project>.supabase.co",
  supabaseAnonKey: "<anon-key>"
};
```

4. Protect operational access with Supabase Auth admin accounts
   (`profiles.role = 'admin'`). Do not add a service-role key.
5. If the stores ask for moderation proof, provide a temporary admin reviewer
   account with limited lifetime and rotate it after review.

## Login

Use a Supabase Auth user whose `profiles.role = 'admin'`.
The UI accepts either phone+password or email+password.

## Security

- Do not put `service_role` in this repo or in browser config.
- Browser writes go through admin RLS and RPC.
- Report actions are transactional through `admin_moderate_report`.
- Direct message/content actions use `admin_moderate_target`.
- Account restrictions use `admin_set_user_moderation_status`.
- AI supervision reads `ai_interactions` through
  `admin_ai_interactions_overview`.
