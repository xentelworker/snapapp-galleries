# Architecture

## Public application

Canonical production domain:

- `https://gallery.snapapp.ca`

The default Cloudflare `workers.dev` URL remains enabled for direct access and troubleshooting.

## Gallery access model

Each gallery can independently configure:

- public or password-protected access
- unlisted/private visibility
- optional download PIN
- downloads enabled/disabled
- SnapApp branding on/off
- custom logo and business/client identity
- accent/theme preferences
- custom gallery title/subtitle/cover

Passwords and device secrets must be stored as hashes, never plaintext.

## Storage model

Planned Cloudflare bindings:

- D1: galleries, sets, photos, favorites, sessions, device tokens
- R2: original images, derivatives and thumbnails
- Worker: API/auth/upload routing

## SnapApp Sync

Windows uploader workflow:

1. User pairs the Windows app using a revocable device token.
2. A watched folder is mapped to a gallery and set.
3. The agent waits for each new file to finish writing.
4. It hashes the file for duplicate detection.
5. It uploads through the gallery ingestion API.
6. Failed uploads are retried and queued locally.
