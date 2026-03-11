# Kilo MVP Phase 1

Kilo is a lightweight workout logging MVP with a web-first PWA and a Cloudflare Worker API. The app lets you start a workout session, log sets manually or by voice, and correct sets in a live table.

## Repo Structure
- `apps/pwa/` - Web-first PWA (static HTML/CSS/JS)
- `services/api-worker/` - Cloudflare Worker API
- `packages/shared/` - Shared types and utilities
- `Documentaions/` - Product and architecture notes

## Quick Start (PWA)
The PWA is plain static assets. You can serve the `apps/pwa` folder with any static server.

1. Start a static server from `apps/pwa`.
2. Open `http://localhost:PORT/public/`.

Example (Node):
```bash
npx serve apps/pwa
```

## Quick Start (API Worker)
1. Install dependencies:
```bash
cd services/api-worker
npm install
```

2. Start the worker:
```bash
npx wrangler dev
```

Notes:
- Local env values can go in `services/api-worker/.dev.vars`.
- The API endpoints are documented in `Documentaions/API.md`.

## Requirements
This repo is not Python-based. The dependency list is recorded in `requirements.txt` for convenience and mirrors the `services/api-worker/package.json` versions.

## Git Ignore
`.gitignore` is set up to ignore Node modules, Cloudflare Wrangler artifacts, env files, caches, and editor files.