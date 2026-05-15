# CampWatch

A campsite availability tracker for recreation.gov. Watches the campgrounds and
sites you care about and emails you the moment something opens up.

Live at **https://campwatch.mikeroberts421.workers.dev/app**.

## Architecture

```
next/         Next.js 16 + Tailwind v4 + shadcn/ui app.
              Deploys as the `campwatch` Cloudflare Worker
              via @opennextjs/cloudflare on every push to main.

notifier/     Node script run as a GitHub Actions cron every 15 minutes.
              Calls the Worker's /api/* endpoints to read configuration and
              subscribers, fetches recreation.gov availability, sends emails
              via Resend on new matches.

workers-site/ Tiny redirect Worker (the legacy `campsites-finder` URL).
              307-redirects every request to the corresponding path on
              campwatch.*. Kept alive so old unsubscribe links in
              already-sent emails continue to work.

legacy/cra/   The previous Create React App build of the same product.
              Retained for reference and rollback only — not deployed.
```

## Development

```bash
cd next
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # Vitest
pnpm run cf:build # local OpenNext build
```

## Deployment

- **`next/`**: `.github/workflows/deploy-next.yml` deploys the campwatch Worker on every push to main (and feature branches).
- **`workers-site/`**: `.github/workflows/deploy.yml` deploys the redirect Worker when `workers-site/` or `wrangler.toml` change.
- **`notifier/`**: `.github/workflows/check-campsites.yml` runs every 15 minutes (cron). It reads `SUBSCRIBER_API_URL`, `SUBSCRIBER_API_SECRET`, `SITE_URL`, `RESEND_API_KEY` from GitHub Secrets.

## Design docs and plans

`docs/superpowers/specs/` and `docs/superpowers/plans/` hold the architectural specs and execution plans for ongoing work. The Phase 0 stack migration (0a scaffold → 0b API → 0c UI → 0d cutover) is complete. Next: Phase 1 (Google OAuth) and Phase 2 (per-user lists) per `docs/superpowers/specs/2026-05-14-multi-user-rework-design.md`.
