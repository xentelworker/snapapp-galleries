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
