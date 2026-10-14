# Cloudflare setup

The application is ready for Cloudflare Workers + D1 + R2, but the account-specific resources must exist before the first production deployment.

## Required Cloudflare resources

1. Create D1 database: `snapapp-galleries`
2. Put its database ID into `wrangler.jsonc` in place of `REPLACE_WITH_D1_DATABASE_ID`
3. Create R2 bucket: `snapapp-galleries`
4. Add Worker secret `ADMIN_TOKEN`
5. Route the Worker to `gallery.snapapp.ca`
6. Keep `workers_dev: true` so the default workers.dev URL remains available.

## GitHub Actions secrets

Add:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The API token needs permission to deploy Workers and manage the D1 database used by this application.

Once these are configured, pushes to `main` automatically build, migrate D1 and deploy the Worker.

## Admin

After deployment:

- `/admin.html` creates galleries through the authenticated admin API.
- The admin token is stored only in the browser session, not committed to the repository.

## Sync upload API

SnapApp Sync will upload files to:

`POST /api/upload/:setId`

Headers:

- `X-Device-Token`
- `X-File-Name`
- `Content-Type`

The server calculates SHA-256 and avoids duplicate files per gallery.


## Background ZIP jobs

Create the queue before deploying the Worker configuration:

```sh
npx wrangler queues create snapapp-gallery-zip-jobs
npm run db:migrate:remote
# Enable the Workers Paid plan, then onboard snapapp.ca under Compute > Email Service > Email Sending
```

Cloudflare Email Sending requires Workers Paid and an onboarded sending domain. Review the DNS records before accepting them; they authenticate email sending and may affect existing mail setup. The Worker uses a restricted native email binding for gallery@snapapp.ca, so there is no API key to store. Large ZIPs are streamed into multipart R2 uploads, emailed as private links, and removed after 48 hours. The Worker is configured for up to 5 minutes of CPU per queue invocation.
