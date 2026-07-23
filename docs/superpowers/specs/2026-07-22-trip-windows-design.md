# Trip Windows: Design

**Date:** 2026-07-22
**Status:** Approved

## Problem

CampWatch alerts on any new opening at watched campgrounds, filtered by notify scope. But when you have a specific trip coming up ("I need a site the weekend of Jul 31"), those dates matter far more than everything else. Today there's no way to say "these dates are special": alerts for the trip dates look identical to routine ones, scope settings can hide viable sites, and the 24h dedup cooldown means an unbooked opening goes quiet for a day.

Trip windows let a user declare date ranges they're actively trying to book. Openings that can host the trip get loud, unmistakable, repeating alerts across every watched campground.

## Requirements (decided with Mike)

1. **Scope:** windows are user-global with an optional per-window campground filter (absent/empty = all watched campgrounds).
2. **Match rule:** full stay at one site, with per-end flex. A window has `flexDays` (0–3, default 0); each end may independently shrink by up to `flexDays`. Equivalent formulation: a site matches iff every night of the **core range** `[from + flexDays, to − flexDays)` is open. Example: Thu→Mon window with flex 1 matches a site open Fri→Mon, Thu→Sun, or Fri→Sun.
3. **Special treatment** (all four):
   - Distinct look: dedicated push title ("Trip match: …") and email subject/featured section.
   - Bypass notify scope: any open site counts, even on favorites-only campgrounds.
   - Shorter cooldown: trip matches re-alert every **6h** (vs 24h) while still open and the window hasn't passed.
   - Digest per window: one push per window listing all matching sites, not the per-campground grouping.
4. **UI:** a Trips card on the main dashboard, with This weekend / Next weekend quick-add chips.
5. **Extras in v1:** timeline highlight of window dates; auto fast-lane polling for campgrounds covered by an imminent window.

## Data model

New type in `next/src/types/campground.ts`, stored as `GlobalSettings.tripWindows?: TripWindow[]` (mirrors `blackoutDates`):

```ts
/** A user-level "I want to camp these dates" range. Alerts are boosted for stays covering it. */
export interface TripWindow {
    id: string;              // crypto.randomUUID() at creation; used for dedup keys and push tags
    from: string;            // YYYY-MM-DD arrival (first night)
    to: string;              // YYYY-MM-DD departure/checkout, > from (nights are [from, to))
    label?: string;          // <= 80 chars
    flexDays?: number;       // 0-3, default 0; core range must keep >= 1 night
    campgroundIds?: string[]; // absent/empty = all watched campgrounds
}
```

Note the half-open night semantics (`to` = checkout day) match `StayMatch` and rec.gov arrival/departure params. Blackouts are inclusive-day; trip windows are arrival/checkout. The UI presents them as arrival and departure dates, so users never see the distinction.

Storage rides the existing `user:{email}:campgrounds` record: no new KV keys, no new routes, `deleteUser` already covers it, and `/api/admin/notification-targets` already ships `globalSettings` to the notifier (verify it passes the object through verbatim rather than cherry-picking keys; add `tripWindows` if it cherry-picks).

Validation in `PUT /api/users/me/campgrounds` (alongside `validBlackoutDates`): max 10 windows; ISO `from`/`to` with `to > from`; label ≤ 80; `flexDays` integer 0–3 with `nights(from,to) > 2*flexDays`; `campgroundIds` an array of strings; `id` non-empty string ≤ 64.

## Shared matching lib

`next/src/lib/trip-windows.ts`: pure TS, imported by both the Next app (dashboard badge, timeline) and the notifier at build time (same pattern as `lib/blackout.ts`). ISO-string date math only, no `Date` round-trips.

- `coreRange(w): { from, to }`: window shrunk by flex on each end.
- `windowIsPast(w, todayIso)`: `to <= today` (checkout passed).
- `windowTargets(w, campgroundId)`: filter check.
- `siteMatchesWindow(availabilities, w)`: every core night `"Available"` in a `RawSiteData.availabilities` map (same status predicate as `findConsecutiveAvailableRanges`).
- `maximalRunInWindow(availabilities, w): StayMatch`: the longest consecutive open run within `[from, to)` containing the core; this is what alerts display and what dedup records.
- `validTripWindows(v): boolean`: for the PUT route.

## Notifier changes (`notifier/check.ts` + `notifier/fetch-jobs.ts`)

### Trip-match pass

A separate pass per user inside `run()`, after the normal diff, reading the same cached month data (`readCachedMonths`) directly rather than going through `processCampgroundResults`, because trip matching deliberately ignores `stayLengths`, `validStartDays`, notify scope, blackout suppression, the per-campground `dates` watch window, and the 15-minute curator lead-time gate. It still respects: `campground.enabled`, `IGNORE_CAMPSITE_TYPES`, `notifications.enabled`, and the per-user `frequencyMinutes` eligibility gate (the whole user run is gated on it, unchanged in v1).

For each non-past window × targeted campground × site: if `siteMatchesWindow`, produce a candidate `{ window, campgroundId, campgroundName, siteId, siteName, run: maximalRunInWindow }`.

Blackout interplay: a trip window wins over an overlapping blackout (setting one is explicit intent); document, don't reconcile.

### Dedup: new `trips` bucket

`NotifierState.trips?: Record<string, SeenRange[]>` keyed `${windowId}:${campgroundId}:${siteId}`: the **same shape** as the `sites`/`groups` buckets, so `mergeNotifierSites` is reused verbatim with a new exported constant `TRIP_COOLDOWN_MS = 6h` (defined in `next/src/lib/notifier-state-merge.ts`, imported by the notifier). A candidate is new if its run overlaps no in-cooldown seen range for its key (same overlap logic as `diffPerUser`). The 6h age-out **is** the re-alert cadence: still-open sites fall out of cooldown and re-fire. Stale keys (deleted or past windows) age out on their own within 6h; the notifier additionally skips past windows when diffing.

**Landmine (the June `groups` incident):** `PUT /api/admin/notifier-state` normalizes the blob and silently drops unknown keys. It MUST be updated in the same commit to merge and persist `trips` (via `mergeNotifierSites(existing.trips, incoming.trips, now, TRIP_COOLDOWN_MS)`, included in the blob only when non-empty, like `groups`), with a route test in `next/` proving the round-trip: that test is the only automated guard, since notifier CI coverage is thin.

### Fan-out

- **Push:** one digest per window with new candidates. Title: `Trip match: {label || "Jul 31 – Aug 2"}`. Body: up to 5 lines `{campground} · {site} · Fri Jul 31 → Sun Aug 2 (2n)`, favorites-first, then `+N more`. Tag `cw-trip-{windowId}` (new sends replace the old notification instead of stacking). URL: lone single site → `buildReservationLink` with the run's dates; single campground → its rec.gov campground page; else `https://campwatch.dev/app`. Trip digests send before normal pushes.
- **Email:** trip matches render as a featured section at the top (modeled on `buildAdjacentSection`) and take over the subject (`Trip match: {label/dates} · N sites`) when present.
- **Same-run dupe suppression:** normal per-campground push lines and email opening cards drop any (site, overlapping range) already covered by a trip digest in this run. Cross-run duplication with historical normal alerts is fine.

### Fetch coverage + fast lane (`fetch-jobs.ts`)

- Month planning per campground unions in months from the owner's non-past trip windows targeting it, so a window outside the campground's watch `dates` range still gets data.
- Fast lane: campgrounds targeted by an **imminent** window (`from − 14d <= today <= to`) join `buildFastLanePlan` (1-minute tick) regardless of `checkPriority`. This is notifier-side only and doesn't count against `HIGH_PRIORITY_CAP` (which caps user-set priorities). The real worst case is bigger than a few extra refreshes: a window with no `campgroundIds` filter fast-lanes every one of the user's watched campgrounds for its window months, every tick, for the full 14-day lead. Two mitigations are in as of this pass: window span is capped at `TRIP_MAX_NIGHTS` (30 nights), which bounds how many months one window can pull in. There is no cap yet on how many campgrounds/windows can ride the fast lane at once; that's deferred as a follow-up if it proves to be a real load problem in practice.

## Dashboard UI

### Trips card (`next/src/components/dashboard/trips-card/`)

Rendered on `app/app/page.tsx` near the date-picker strip. Persists through the existing `useUserCampgrounds` `save()` (`PUT /api/users/me/campgrounds` full-record write); state lives in `globalSettings.tripWindows`.

- **List:** each window shows label (or formatted range), arrival→departure, flex badge (`±1d`), campground-filter summary ("All campgrounds" / "2 campgrounds"), a live **"N sites match now"** badge computed client-side from the availability data already on the page (`useCampgroundsData`) via the shared lib, expandable to the matching sites with rec.gov reservation links, and a delete button.
- **Add:** date range via the existing `Calendar mode="range"` popover pattern (`date-range-calendar.tsx`), optional label input, flex stepper 0–3, optional campground multi-select from the watch list.
- **Quick-add chips:** "This weekend" (upcoming Friday arrival → Sunday checkout; if today is Fri/Sat, use the current weekend) and "Next weekend" (the one after).
- **Expiry:** past windows (`to <= today`) render greyed with a remove affordance; the PUT route prunes past windows on save; the notifier ignores them regardless.

### Timeline highlight

Thread `tripWindows` through the timeline components the way `blackoutDates` already is (`timeline-track.tsx`, `availability-block.tsx`, `mobile-timeline.tsx`): window-date columns get a subtle highlight tint (inverse intent of the blackout grey), using an existing `--cw-*` token.

## Testing

- `next/` (Vitest, colocated, in CI): trip-windows lib (flex/core math, matching, maximal run, validation edge cases), campgrounds PUT validation for `tripWindows` incl. pruning, **notifier-state PUT round-trip test for the `trips` bucket** (regression guard for the normalization landmine), Trips card component test (add/delete/badge).
- `notifier/` (Vitest, NOT in CI: run `tsc` + `vitest` manually before deploy): trip diff/dedup semantics (new vs in-cooldown, 6h re-fire, past-window skip), digest push formatting + tag/url, same-run dupe suppression, fetch-plan month union, fast-lane inclusion window.
- End-to-end: `next:verify` skill against the local dev server for the dashboard card; real push via the existing account-page "Send test" plus a live window after deploy.

## Out of scope (v1)

- Per-window custom cooldown or notification channel; bypassing the `frequencyMinutes` eligibility gate; auto-suggesting windows from a calendar; server-synced dashboard date-range prefs (existing TODO, unrelated).
