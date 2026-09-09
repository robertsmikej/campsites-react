# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user is a camper targeting high-demand recreation.gov campgrounds (initially central Idaho's Sawtooth Valley: Redfish Lake, Stanley Lake, etc.) where summer reservations sell out within minutes of the January release window, and cancellations vanish before manual refreshers notice.

Curator role: the site owner, who receives notifications immediately. All other users receive a 15-minute delay after the first global sighting, giving the curator a booking-priority window.

The app is open to anyone with a Google account, but has no active growth effort. The user base is early and small.

## Product Purpose

CampWatch watches recreation.gov for campsite availability (both initial-drop and cancellation openings) and delivers email and push notifications the moment a match appears. Median notification latency is under ten seconds from a site opening.

It exists because manually refreshing recreation.gov is unreliable and slow for the most competitive campgrounds. Success means the owner consistently books the sites they want, and the project doubles as a portfolio piece demonstrating real production engineering.

## Positioning

Per-user watchlists diffed against a globally deduplicated fetch cycle (one request per unique campground/month, not one per user). Curator-priority notification window. Five-minute poll cadence, sub-10-second delivery. No app install required.

## Operating Context

Campers set up watchlists pointing at specific recreation.gov campground IDs and date ranges (including trip windows for multi-night stays). The notifier runs on a 1-minute tick / 5-minute sweep cron schedule. Users receive email (Resend) or web push (PWA) when openings match, then race to book on recreation.gov directly.

The dashboard shows grouped watchlists with an inline availability timeline, a per-site drawer with an availability calendar and satellite map, and trip-window planning. A discover page helps find campgrounds. An admin panel exposes notifier state and user management.

## Capabilities and Constraints

Confirmed functionality: Google OAuth sign-in, per-user watchlists with campground search, trip windows with multi-night filtering, email + Web Push notifications (installable PWA, iOS 16.4+), availability timeline and calendar, site map modal, admin panel.

Not offered: dark mode (removed 2026-09-09; the palette is light only). The "open right now" openings feed was removed from the dashboard and its code deleted; the homepage postcard still shows recent openings.

Technical constraints: Cloudflare Workers runtime (no Node.js APIs), KV for all persistence (no relational DB), recreation.gov has no official API (scraping their public availability endpoint), Cloudflare Cron Triggers for scheduling.

Undecided: state parks integration (Idaho's getoutside.idaho.gov has no availability API and blocks scraping; an Oregon/Washington plan is scoped in `docs/state-parks-integration-plan.md` and not started).

## Brand Commitments

Name: CampWatch. Domain: campwatch.dev.

Logo: hand-drawn compass-rose mark in `/public/images/logos/`.

Design system: "Field Notes," a cohesive visual language across all surfaces. Cream/ink/forest/clay/mustard palette with five typefaces (Big Shoulders Display for poster headlines, Cormorant Garamond for italic accents, Source Serif 4 for body, DM Mono for data/fields, Caveat for handwritten annotations). Tokens live in CSS custom properties (`--cw-*`). The metaphor is a naturalist's field notebook.

## Evidence on Hand

Live production site at campwatch.dev with real users, real telemetry (campgrounds tracked, openings sent, median latency), and real notification history. Email template rendered locally via `notifier/render-preview.ts`. No screenshots are checked in. No testimonials, press, or case studies. Do not fabricate any.

## Product Principles

1. **Speed is the feature.** A ten-second edge over manual refreshing is the entire value proposition. Every architectural decision protects notification latency.
2. **Watch, don't browse.** The product's job is to watch so the user doesn't have to. Passive monitoring, active notification.
3. **Show the work.** Real telemetry, real data, real engineering. The product is also a portfolio piece, so transparency and craft matter equally.
4. **One person's quality bar.** Maintained by a single developer. Favor depth and polish over breadth. Ship fewer features at higher quality.
5. **Respect the platform.** No native app. The web, email, and push are the delivery surface. PWA where possible, no friction to start.
