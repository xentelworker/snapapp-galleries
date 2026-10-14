# SnapApp Galleries

SnapApp Galleries is a client gallery platform for event photography and photo booth delivery.

## Production

- Canonical domain: https://gallery.snapapp.ca
- Cloudflare fallback: workers.dev deployment URL
- Source of truth: this GitHub repository

## Planned stack

- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2
- React + Vite frontend
- SnapApp Sync Windows uploader

## Core features

- Client galleries and sets
- Optional per-gallery branding / white-label mode
- Password-protected galleries
- Optional download PIN
- Favorites
- Downloads
- Admin dashboard
- Device-token upload API for SnapApp Sync

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Admin sign-in

Open `/admin.html` and sign in with the authorized Audio Guestbook email and password. Supabase Auth verifies credentials; the Worker restricts access to `ADMIN_USER_ID`. No signup is exposed. Sessions use a Secure, HttpOnly, SameSite=Strict cookie and expire after at most one hour. Sign out clears the gallery cookie without signing out Audio Guestbook.

`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (public, not a service key), and `ADMIN_USER_ID` configure authentication. The former `ADMIN_TOKEN` is no longer accepted. No passwords or service-role keys belong in the repository.

Run authentication checks with `node --test tests/auth.test.mjs`.


## Background gallery ZIP downloads

Large galleries are prepared as one ZIP in the background. Visitors enter an email address, and SnapApp emails a private download link when the ZIP is ready. The archive is kept in the existing private R2 bucket and expires after 48 hours. Password and download PIN checks happen when the visitor requests the job; the download-enabled setting is checked again when the link is used.

Before deploying this feature to a new environment:

1. Create the Cloudflare Queue named `snapapp-gallery-zip-jobs`.
2. Apply the new D1 migration with `npm run db:migrate:remote`.
3. Enable Workers Paid, then onboard `snapapp.ca` under Compute > Email Service > Email Sending. Cloudflare adds the sender authentication records; confirm they do not conflict with existing mail DNS before accepting changes. The Worker sends from `gallery@snapapp.ca` using a restricted native email binding, so no API key is needed.
4. Deploy the Worker and frontend.

The Worker reports email sending failures by ZIP job ID. ZIP preparation can still finish and be downloaded from the open gallery page. Queue retries, private expiring download tokens, and scheduled archive cleanup are enabled.
