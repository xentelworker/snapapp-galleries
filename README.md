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
