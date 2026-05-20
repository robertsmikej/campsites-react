# State Parks Integration Plan (Oregon + Washington)

**Status:** Scoped, not started. Dated 2026-05-20.

CampWatch today only watches recreation.gov (federal campsites). User wants state-park coverage too, prioritized by proximity to Boise: **Oregon first**, then **Washington**, eventually California.

Each state uses a different reservation platform. Effort + risk varies a lot between them.

---

## Oregon — feasible (~1-2 days of work)

**Platform:** `oregonstateparks.reserveamerica.com` (ReserveAmerica, server-rendered Java/Struts app).

**Status:** No official API. Confirmed scraping is straightforward.

### What we confirmed (Farewell Bend, parkId=405413)

- URL: `https://oregonstateparks.reserveamerica.com/campgroundDetails.do?contractCode=OR&parkId=<id>&calarvdate=<MM/DD/YYYY>`
- Returns ~420KB of server-rendered HTML containing the full availability matrix inline.
- Each cell:
  ```html
  <div class='td status a'>
    <a aria-label="A for 002 on May 20"
       href='/...?siteId=16096&arvdate=5/20/2026&lengthOfStay=1' ...>
  ```
- Status codes seen so far: `a` (available), `r` (reserved). Likely also `x` / `n` / `w` for closed/walk-up — verify during PoC.
- Pagination: 25 sites per page (`startIdx` param), 14 days per chunk (`calarvdate`).
- Session: needs `AWSALB` cookie set on first request; trivial to handle.
- No JavaScript execution needed.

### Effort estimate

| Step | Effort |
|---|---|
| PoC fetcher in `notifier/lib/fetch-reserveamerica.mjs` | 2-4 hours |
| Integrate with CampWatch data model (multi-system support) | 1 day |
| Add 3-5 SW Oregon campgrounds to catalog | 1 hour |
| Tests | 2-3 hours |

### Fetch cost (per campground per cycle)

For a 110-site campground over 5 months:
- 5 pages × 10 14-day chunks = **50 HTTP requests** per cycle.
- At `*/5` cron with 3 OR campgrounds = 150 requests / 5 min = ~1,800/hr.
- Well below any reasonable rate-limit threshold for shared GH Actions IPs.

### Risks

- ToS technically prohibits automated access. Low-volume personal use is unlikely to draw attention. Worst case: IP block, not legal action.
- HTML structure can change without warning. Mitigate with a "parse failed" alert / sentry.
- ReserveAmerica is shrinking — Oregon could migrate to a new platform in 1-2 years (federal sites already did). Expect this code to have a finite shelf life.

---

## Washington — harder (~3-5 days of work)

**Platform:** `washington.goingtocamp.com` (Aspira's newer SaaS platform, same parent as ReserveAmerica).

**Status:** No official API. Behind Azure WAF. Scraping is significantly harder than Oregon.

### What we confirmed

- Direct curl with a non-browser User-Agent returns an **Azure WAF challenge page**, not the real content.
- Site is a modern SPA (likely client-side rendered) — HTML scraping won't work; need to interact with the underlying JSON API.
- The JSON API is presumably documented internally but not public. Endpoints would need reverse-engineering via browser DevTools.

### Effort estimate

| Step | Effort |
|---|---|
| Reverse-engineer the JSON API (probe via real browser, capture headers/tokens) | 1 day |
| Solve Azure WAF challenge (cookie token flow or rotating User-Agent + Accept headers) | 1-2 days |
| Or: switch to headless browser (Playwright) — much slower per request, more setup | adds 1 day |
| Fetcher in `notifier/lib/fetch-goingtocamp.mjs` | 4-6 hours |
| Same data-model integration as OR | shared with Oregon work |

### Risks

- Azure WAF can change rules without notice. Each lock-out is a debugging session.
- If we need Playwright, GitHub Actions runners support it but the cron job's runtime jumps from ~1 min to maybe 5-10 min. Still well under the free-tier limits.
- Aspira may add explicit anti-bot measures (CAPTCHAs, fingerprinting) at any time.

### Recommendation

**Don't tackle Washington until Oregon is shipping.** Then re-evaluate based on how much pain Oregon's actually been.

---

## California — to be scoped later

Uses **ReserveCalifornia** (https://www.reservecalifornia.com), which is ALSO an Aspira platform. Different UI but similar API patterns to goingtocamp. Probably falls between Oregon (easy) and Washington (hard).

---

## Architecture for multi-system support

The current data model is implicitly single-system (everything keyed by recreation.gov facility ID). The `CampgroundSystem` enum in `types/campground.ts` already exists as a future-proofing hint:

```ts
export type CampgroundSystem = "recreation.gov";
```

To add ReserveAmerica:

1. **Extend the enum**: `"recreation.gov" | "reserveamerica.com"`.
2. **Per-campground identifier**: ReserveAmerica needs `{ contractCode: "OR", parkId: "405413" }` instead of a single facility ID. Add `system` field to `Campground` and make `id` shape system-aware:
   ```ts
   interface Campground {
       system: CampgroundSystem;
       id: string; // for rec.gov, the facility ID; for RA, "OR/405413"
       contractCode?: string; // RA only
       parkId?: string; // RA only
       // ... rest unchanged
   }
   ```
3. **Fetcher dispatch**: `lib/recreation-gov.ts` becomes the rec.gov-specific implementation; introduce `lib/fetch-availability.ts` (or similar dispatcher) that routes by `campground.system`. Notifier mirrors this in `notifier/lib/`.
4. **Output shape stays identical**: both fetchers produce the same `SiteAvailability` records, so all downstream code (diff, email, UI strip, ratings) needs no changes.
5. **Catalog updates**: `data/campground-catalog.ts` adds OR entries with `system: "reserveamerica.com"` and the RA identifiers.

### What WON'T need to change

- Notifier diff logic (`findNewMatches`, signatures)
- Email formatting
- Homepage stats
- Dashboard UI, drawer, availability strip, per-site ratings
- KV schema

### What WILL need to change

- `types/campground.ts` — add system + RA identifier fields
- `lib/recreation-gov.ts` — split system-specific fetch out of the generic dispatcher
- New `lib/fetch-reserveamerica.ts` + corresponding `notifier/lib/`
- `data/campground-catalog.ts` — add OR entries
- `next/src/components/campground-row.tsx` — show a small "OR State Parks" badge maybe (cosmetic)
- `next/src/app/api/campgrounds/[id]/details/route.ts` — currently hits rec.gov for preview image; will need to no-op or fetch RA park photos when applicable

---

## Phase 1 — Oregon only

Suggested initial scope:

- 3-5 SW Oregon state parks within ~3-hour drive of Boise:
  - Farewell Bend State Recreation Area (Snake River, ~1hr from Boise) — parkId 405413
  - Lake Owyhee State Park
  - Succor Creek State Natural Area (if it has campsites)
  - Three Rivers (Idaho border) — possibly
  - Catherine Creek (WA-OR border) — verify state ownership
- New `system: "reserveamerica.com"` plumbing per architecture above
- Notifier fans out fetches both rec.gov + RA in the same cycle, dedup map covers both
- UI shows a small system label on each row so you can tell rec.gov from state park at a glance

**Implementation order:**

1. Type changes + dispatcher scaffolding (no behavior change yet).
2. Standalone `fetch-reserveamerica.mjs` module — confirm parsing on 1 campground, output a `SiteAvailability`.
3. Wire into notifier loop alongside rec.gov.
4. Add OR entries to catalog.
5. End-to-end test: pick one open weekend, verify the notifier emails when an RA site opens.
6. Ship.

---

## Open questions for future-me

- How does the user actually want to MANAGE state park campgrounds in the UI? The current "paste a campground ID" affordance won't work for RA — you'd need contractCode + parkId. Maybe a different "add" flow or a search/picker.
- Does the preview-image proxy work for RA? Their site has photos; whether they're scrapeable or if there's a CDN with good URLs is unknown.
- Should the "Layout / Satellite" map buttons in the drawer route to ReserveAmerica's page or to state-park websites? Probably the RA page since that's where the booking happens.

---

## Files this plan would touch (Oregon)

```
next/src/types/campground.ts                          # CampgroundSystem + new RA fields
next/src/data/campground-catalog.ts                   # OR entries
next/src/lib/recreation-gov.ts                        # extract into dispatcher
next/src/lib/fetch-reserveamerica.ts                  # NEW
notifier/check.mjs                                    # dispatcher
notifier/lib/fetch-reserveamerica.mjs                 # NEW
next/src/app/api/campgrounds/[id]/details/route.ts    # RA handling
next/src/components/campground-row.tsx                # system badge (cosmetic)
docs/state-parks-integration-plan.md                  # this file
```

Estimated total for Oregon: **1-2 days of focused work** plus testing.
