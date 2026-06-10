# Blackout Dates

**Date:** 2026-06-10
**Status:** Approved

## Problem

Users already have some dates spoken for — a campground booked, a wedding, work. Today nothing marks those dates, so calendar views show tempting availability the user can't act on, the planner proposes trips over them, and alerts fire for stays they can't take.

## Decision summary

- New optional **`GlobalSettings.blackoutDates`**: `Array<{ from: string; to: string; label?: string }>` — ISO dates, inclusive calendar-day ranges, optional short label ("Redfish booked", "wedding"). Absent = none.
- One shared pure helper lib **`next/src/lib/blackout.ts`** consumed by views, planner, and notifier: `isDateBlackedOut(isoDate, ranges)` and `stayOverlapsBlackout(fromIso, toIso, ranges)`.
- **Scope: visual + planner + alerts** (user-selected). Blackouts grey the calendar surfaces, exclude planner suggestions, and suppress alert emails for conflicting stays.
- **Entry UI: site-config dialog**, global settings area (next to stay lengths / valid start days) — same record, same save flow, no new endpoints.
- Rejected alternatives: separate storage (new plumbing for every consumer GlobalSettings already reaches); per-campground blackouts (busy-ness is user-level).

## Overlap semantics

- A blackout range `{from, to}` covers each calendar day from `from` through `to` inclusive.
- A **day is blacked out** if it falls inside any range (string-compare on ISO dates).
- A **stay conflicts** when any of its *nights* — dates `d` with `stayFrom ≤ d < stayTo` — is a blacked-out day. Checkout on a blackout's first morning is fine; check-in on the day a blackout ends is fine.
- Encoded once in `lib/blackout.ts`; every consumer imports it (the notifier imports from `next/src/lib` already).

## Storage & validation

- Rides the existing campgrounds record (`globalSettings`) through PUT `/api/users/me/campgrounds`.
- Validation added to the route: optional array, ≤ 50 entries; each entry needs valid `YYYY-MM-DD` `from`/`to` with `from ≤ to`; optional `label` string ≤ 80 chars. Invalid → 400.
- Passes through `/api/admin/notification-targets` automatically (globalSettings is already forwarded whole).

## Entry UI (site-config dialog, global settings section)

- "Blackout dates" block: list of existing ranges (from → to, label, remove button) + "Add blackout" creating a row with two date pickers and a label input.
- Saves via the dialog's existing save path. Empty list = field omitted (sparse convention).

## Greyed rendering (mimic each surface's existing muted precedent)

- **Per-site calendar** (`campsites-calendar.tsx`): new `blackout` day variant in `VARIANT_CLASS` — muted grey, like the `disabled` styling precedent; blackout wins over availability variants.
- **Availability strip** (`availability-strip.tsx`): blacked-out days render a muted/hatched bar regardless of availability counts (parallel to the existing `showExcluded` treatment).
- **Dashboard timeline** (`availability-block.tsx`): night segments falling on blackout days get a grey overlay via the `segBackground` path.
- Labels surface in tooltips/titles where the surface already supports them; no new tooltip infra.
- Blackout data reaches components through the existing `SiteSettingsContext` (add `blackoutDates` to `SiteSettingsValue`).

## Planner

- `planSummer` (`lib/summer-planner.ts`) gains `blackoutDates` in its options; candidate trips whose nights overlap a blackout are excluded before scoring (same pattern as existing filters).

## Alert suppression (notifier)

- In `computeMatchesForUser`, after the notify-scope filter: drop matches where `stayOverlapsBlackout(match.from, match.to, globalSettings.blackoutDates)`.
- Suppressed matches still render (greyed) in dashboards — suppression governs notifications, not data.
- Dedup/first-seen state untouched by suppression: deleting a blackout later lets still-open matches alert as fresh sightings on the next cycle.

## Testing

- `lib/blackout.ts` units: boundary days (checkout-on-start, check-in-after-end), single-day blackouts, multi-range, empty/absent ranges.
- Save API: valid ranges accepted; bad date shape / from>to / oversized label or list → 400.
- Notifier integration: match fully inside a blackout suppressed; straddling (one night in) suppressed; adjacent (checkout morning) NOT suppressed; no-blackout target unchanged.
- Planner unit: candidate overlapping a blackout excluded.
- View tests where patterns exist (calendar variant mapping; strip cell treatment).

## Out of scope

- Drag-to-blackout on the timeline (future enhancement).
- Greying date-range pickers.
- Recurring blackouts (weekly patterns).
- Per-campground blackouts.
