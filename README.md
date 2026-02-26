# CampWatch

A campsite availability tracker that monitors [recreation.gov](https://www.recreation.gov) for openings at popular campgrounds and sends email alerts when your favorite sites become available.

Built with React, deployed on Cloudflare Workers, and automated with GitHub Actions.

## What It Does

Finding campsites at popular campgrounds is notoriously difficult — sites book months in advance and cancellations are gone within minutes. CampWatch solves this by continuously monitoring availability and alerting you the moment a site opens up.

- **Tracks 9+ campgrounds** across Idaho's Sawtooth region (Redfish Lake, Stanley Lake, Warm Lake, and more)
- **Curated site lists** — mark specific sites as favorites based on location (lakefront, riverside, etc.)
- **Email notifications** — get alerted within 15 minutes when a favorite site opens
- **Priority subscribers** — configurable head-start for select emails before general subscribers are notified
- **Calendar and table views** — visualize availability across date ranges with filtering by stay length and start day

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  GitHub Actions (every 15 min)                      │
│  ┌───────────────────────────────────────────────┐  │
│  │  notifier/check.mjs                           │  │
│  │  → Fetch recreation.gov API                   │  │
│  │  → Diff against previous state                │  │
│  │  → Email new matches via Resend               │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  Cloudflare Workers                                 │
│  ┌──────────────┐  ┌────────────────────────────┐   │
│  │  Static SPA  │  │  Subscriber API             │  │
│  │  (React app) │  │  POST /api/subscribe        │  │
│  │              │  │  GET  /api/unsubscribe      │  │
│  │              │  │  GET  /api/subscribers       │  │
│  └──────────────┘  └────────────────────────────┘   │
│                          │                          │
│                    ┌─────┴─────┐                    │
│                    │ Workers KV │                    │
│                    │ (emails)   │                    │
│                    └───────────┘                    │
└─────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Material-UI 7, Emotion |
| Backend | Cloudflare Workers |
| Storage | Cloudflare Workers KV |
| Email | Resend API |
| CI/CD | GitHub Actions |
| Data Source | recreation.gov API |

## Key Features

**Availability Monitoring**
- Fetches live availability data from recreation.gov's public API
- Configurable date ranges, stay lengths (2-5 nights), and valid start days
- Groups results by campground with favorites highlighted

**Smart Notifications**
- Signature-based diffing — only alerts on *new* availability, not repeats
- Cancellation detection — if a site opens up again, you get re-notified
- Delayed delivery queue — priority subscribers get a 15-minute head start
- HMAC-secured unsubscribe links

**Performance**
- 30-minute client-side cache to minimize API calls
- Rate-limited API requests (50ms between calls) to respect recreation.gov limits
- State persisted across GitHub Actions runs via cache

## Project Structure

```
├── src/
│   ├── components/          # React components (calendar, table, config)
│   ├── calls/               # recreation.gov API integration
│   ├── json/                # Campground catalog & site configurations
│   ├── context/             # React context (settings, progress)
│   └── utils/               # Shared utilities
├── notifier/
│   ├── check.mjs            # Scheduled availability checker
│   └── lib/
│       ├── fetch-availability.mjs  # API fetching & match detection
│       ├── diff.mjs                # Signature-based change detection
│       └── email.mjs               # Email formatting & Resend integration
├── workers-site/
│   └── index.js             # Cloudflare Worker (static + API routes)
└── .github/workflows/
    ├── deploy.yml            # Auto-deploy on push to main
    └── check-campsites.yml   # Scheduled availability checks (every 15 min)
```

## Setup

### Prerequisites
- Node.js 20+
- A [Resend](https://resend.com) account (free tier: 3,000 emails/month)
- A [Cloudflare](https://cloudflare.com) account

### Local Development

```bash
npm install
npm start
```

The app runs at `http://localhost:3000`. A proxy server handles recreation.gov API calls to avoid CORS issues during development.

### Deployment

The app auto-deploys to Cloudflare Workers on push to `main`. Required GitHub secrets:

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | Wrangler deployment |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account |
| `RESEND_API_KEY` | Email sending |
| `SUBSCRIBER_API_URL` | CF Worker base URL |
| `SUBSCRIBER_API_SECRET` | API authentication |
| `PRIORITY_EMAILS` | Comma-separated priority addresses |
| `SITE_URL` | App URL (for email links) |

### Configuring Campgrounds

Edit `src/json/campgroundCatalog.js` to add campgrounds and `src/json/siteConfigurations.js` to configure favorite sites and date ranges per campground.

## License

MIT
