# CampWatch

> Most popular campsites on recreation.gov sell out within minutes of release. CampWatch watches the spots you actually want and emails you the moment a site opens — initial drop or cancellation.

**Live:** [campwatch.dev](https://campwatch.dev)

![CampWatch homepage](docs/screenshots/homepage.png)

## Why

I camp in central Idaho. Outlet Campground at Redfish Lake opens its summer reservations on a fixed January morning and is sold out by 8:05 AM. By the time you've manually scrolled to find an available date, it's gone. Refreshing recreation.gov is a part-time job.

CampWatch turns that into "check email when something opens." It polls recreation.gov every five minutes for the sites on your watchlist, diffs against the previous cycle, and emails you on new matches. Median time from a site opening to landing in your inbox is under ten seconds.

## Engineering highlights

A few things worth pointing at:

- **Per-user notifier with global dedup** — `notifier/check.ts` builds one `(campgroundId, month)` set across every user's watchlist, fetches each unique combination from recreation.gov exactly once, then runs per-user diffs from the shared raw data. Scales linearly with unique campgrounds, not users × campgrounds.
- **Curator lead-time** — non-curator users don't get notified until 15 minutes after a match's first global sighting. Lets the curator hold first-priority booking. Implemented via a global `notifier:first-seen` map in KV.
- **Field Notes design system** — full visual language across the homepage, dashboard, drawer, account, discover, admin, and email template. Cream/ink/forest/clay/mustard palette with five fonts (Big Shoulders Display / Cormorant Garamond / Source Serif 4 / DM Mono / Caveat). Implemented as Tailwind utilities backed by CSS variables so dark mode flips with one class.
- **Atomic component split** — `next/src/components/{homepage,dashboard,campground,field-notes}/` — every section that has a name has a file. The two page shells are under 80 lines each; everything composes from named primitives.
- **Email template that survives Gmail + Outlook** — table-based layout, inline styles only, no web fonts (web-safe font cascade approximates Big Shoulders → Impact, Cormorant → Georgia italic, DM Mono → Courier). Mobile-first sizing as the default.
- **Deploy via Git Data API** — when iCloud broke `git push` mid-sync, I had a Bash one-liner using `gh api /repos/.../git/{blobs,trees,commits,refs}` to land a tree on `main` without local git cooperating. Mentioned because debugging it taught me how GitHub's path-filter evaluator handles non-branch-push commits.

## Tech stack

Next.js 16 (App Router) + Tailwind v4 + shadcn/ui · TypeScript end-to-end · Cloudflare Workers via `@opennextjs/cloudflare` · KV for state · GitHub Actions for the notifier cron + CI · Resend for transactional email · Google OAuth for sign-in · Cloudflare Email Routing for inbound mail · Vitest.

## Architecture

```mermaid
graph LR
    User[Browser] -->|reads| Worker[Cloudflare Worker<br/>campwatch.dev]
    Worker -->|reads/writes| KV[(Cloudflare KV<br/>users, config, stats,<br/>sessions, first-seen,<br/>recent-openings)]
    User -->|signs in| Google[Google OAuth]
    Google -->|callback| Worker

    Cron[GitHub Actions<br/>every 5 min] -->|admin API| Worker
    Cron -->|polls| RecGov[recreation.gov]
    Cron -->|sends mail| Resend[Resend]
    Resend -->|delivers| Email[User Inbox]
    Email -->|reply-to| EmailRoute[Cloudflare Email Routing]
    EmailRoute -->|forwards| Inbox[hello@campwatch.dev]
```

The Worker is a thin app shell + KV-backed admin/auth endpoints. The notifier is where the actual work happens.

## Screenshots

| | |
|---|---|
| Homepage hero with live telemetry strip | ![homepage](docs/screenshots/homepage.png) |
| Dashboard — openings feed + grouped watchlist | ![dashboard](docs/screenshots/dashboard.png) |
| Per-site drawer with availability calendar | ![drawer](docs/screenshots/drawer.png) |
| Notification email | ![email](docs/screenshots/email.png) |

## Local development

```bash
cd next
cp .dev.vars.example .dev.vars   # then set DEV_USER=you@example.com
pnpm install
pnpm dev                          # http://localhost:3000
pnpm test                         # Vitest (logic-contract tests)
pnpm exec tsc --noEmit            # type-check
pnpm run cf:build                 # local OpenNext build
```

`DEV_USER` triggers an auth bypass that only activates when `NODE_ENV !== "production"`. See `next/src/lib/sessions.ts`.

## Project structure

```
next/                     Next.js 16 app — UI + API routes + Worker entry
notifier/                 TypeScript cron — fetches rec.gov, sends mail
docs/                     Architecture docs, design plans (archived)
.github/workflows/        deploy-next.yml, check-campsites.yml, ci.yml
```

Inside `next/src/`:

```
app/                      App router pages + API routes
components/
  homepage/               Hero, StatsBand, Watchlist preview, FAQ, etc.
  dashboard/              TopBar, Greeting, OpeningsFeed, WatchlistSection
  campground/             Shared atoms — Thumbnail, NameLine, OpenCountBadge
  field-notes/            Design tokens, decorations (SVG), loading primitives
  ui/                     shadcn primitives (Button, Dialog, Sheet, …)
contexts/                 StatsProvider (single /api/stats fetch per page)
hooks/                    useAuth, useUserCampgrounds, useIsMobile, …
lib/                      sessions, users, recreation-gov client, …
types/                    Campground, SiteAvailability, GlobalSettings, …
```

## Deployment

- **`next/`** deploys to Cloudflare Workers on every push to any branch via `.github/workflows/deploy-next.yml`. CI (`ci.yml`) gates tsc + tests + cf:build on every push and PR.
- **`notifier/`** runs every 5 minutes (GitHub Actions floor) via `.github/workflows/check-campsites.yml`.

## Observability

- Page views via [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) (free, cookieless).
- API route handlers wrapped with `withErrorLogging` (`next/src/lib/route-helpers.ts`). Structured errors land in Cloudflare's worker observability for live-tail debugging.
- Notifier telemetry (last poll, campgrounds tracked, openings sent today, rolling 7-day total, median latency) written to KV each cycle, surfaced on the homepage stats band.

## Notable files to read first

If you're skimming the codebase to evaluate the engineering, start with:

- `notifier/check.ts` — the dedup + diff loop
- `next/src/app/app/page.tsx` — dashboard shell (~330 lines)
- `next/src/components/dashboard/watchlist-section/watchlist-row.tsx` — desktop/mobile responsive row with shared atoms
- `next/src/lib/sessions.ts` — opaque KV-backed sessions with a dev bypass
- `notifier/lib/email.ts` — table-based email template
- `next/src/app/api/admin/migrate/route.ts` — idempotent KV bootstrap from the in-repo catalog
