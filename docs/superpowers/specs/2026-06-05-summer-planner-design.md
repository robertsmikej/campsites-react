# Ideal Summer Planner — Design

**Status:** Approved (2026-06-05)

## Goal
A CampWatch dashboard feature that takes the user's live campsite availability and proposes an "ideal summer": ~5 trips (4-5) at *different* campgrounds, spread across the season, biased toward favorite sites and weekend stays. Output is a real, mostly-bookable itinerary with deep links to recreation.gov, plus light controls to regenerate, lock, and swap individual trips.

## Decisions (locked)
- **Form:** dashboard feature (not a chat skill or one-off).
- **Candidate sites:** favorites first, then worthwhile, then any open site only as needed to reach distinct campgrounds.
- **Optimize for:** favorites-first (tier), campground variety, spread across the summer, weekend (Fri/Sat) bias. (Water-access / kid-friendly is intentionally **out of scope for v1** — it needs per-site review/attribute data not present in the availability snapshot; revisit as v2.)
- **Algorithm:** greedy slot-fill, with light interactivity (regenerate / lock / swap).
- **Summer window:** June 1 – September 30 of the season present in the data.
- **Target trips:** 5 (acceptable to return fewer when openings are scarce).
- **Trip length:** taken directly from each opening (`StayMatch`), which already respects the user's stay-length settings — no extra length logic.
- **No new backend:** computed client-side from data the dashboard already loads.

## Where it lives
- New route `next/src/app/app/plan/page.tsx` ("Plan your summer").
- Reached from a button in the dashboard top bar (`DashboardTopBar`).
- Reuses `useUserCampgrounds` (siteConfig) and `useCampgroundsData` (campgroundsByAreas — the live availability snapshot with per-site `matches`). Field Notes theme throughout (`cw-*` tokens, `font-*` roles).

## Core (pure, tested): `next/src/lib/summer-planner.ts`

### Types
```
interface PlanWindow { start: Date; end: Date }   // Jun 1 – Sep 30

interface CandidateTrip {
  campgroundId: string;
  campgroundName: string;
  area: string;
  siteId: string;
  siteName: string;
  tier: "fav" | "worth" | "other";   // from siteTier(campground, siteName)
  from: string;                       // ISO arrival (StayMatch.from)
  to: string;                         // ISO departure (StayMatch.to, exclusive)
  nights: number;
  includesWeekend: boolean;           // any Fri/Sat night in [from, to)
}

interface PlannedTrip extends CandidateTrip {
  id: string;          // `${campgroundId}:${siteId}:${from}:${to}` (stable, = match signature)
  slotIndex: number;
  bookUrl: string;     // reservation deep-link for these exact dates
  locked: boolean;
}

interface SummerPlan {
  trips: PlannedTrip[];
  stats: { tripCount: number; campgroundCount: number; weekendCount: number; window: PlanWindow };
  notes: string[];     // human-readable relaxations ("repeated Stanley Lake to fill September")
}

interface PlanOptions {
  window: PlanWindow;
  targetTrips: number;            // 5
  lockedTripIds?: string[];       // ids that must appear, fixed in place
  excludeTripIds?: string[];      // for Regenerate: ids to avoid re-picking when an alt exists
}
```

### Building candidates
For each campground in `campgroundsByAreas`, for each site in `siteAvailability`, for each `match` whose `from` falls within the window: emit a `CandidateTrip`, tagging `tier` via `siteTier(campground, siteName)` and `includesWeekend` by walking the match's nights with `isWeekendNight`. Reuse `timeline.ts` helpers (`siteTier`, `isWeekendNight`, `siteRangeUrl`, date utils).

### Scoring
`score = tierScore + weekendBonus`
- `tierScore`: fav = 3, worth = 2, other = 1.
- `weekendBonus`: +1.5 if `includesWeekend`.
Tie-break order: higher score → earlier `from` → more `nights` → campgroundName asc (deterministic).

### Greedy slot-fill
1. Split the window into `targetTrips` equal date slots (chronological). A candidate belongs to the slot its `from` falls in.
2. Pre-place any `lockedTripIds`: put each in its slot, mark its campground used and its date range occupied.
3. For each remaining slot in order:
   - Build the pool: candidates in this slot whose campground is **not already used** and whose date range does **not overlap** an already-chosen trip, excluding `excludeTripIds`.
   - If empty, relax in order, recording a `note` each time: (a) allow date overlap; (b) allow a repeated campground; (c) borrow the best unused candidate from the nearest non-empty slot. If still nothing, skip the slot (note: "no openings in <Month range>").
   - Pick the top candidate by the scoring/tie-break above; add to `trips`; mark campground used.
4. Sort `trips` by `from`; compute `stats`.

"Some overlap is okay" = the relaxation path may permit a repeat or minor overlap to fill a gap; the planner prefers distinct, non-overlapping trips but won't fail when it can't.

### Interactivity contract
- **Regenerate:** call `planSummer` again with `excludeTripIds = current trip ids` (locked ones are not excluded). Yields a different itinerary where alternatives exist; falls back to repeats if none.
- **Lock:** toggling lock adds/removes the trip id from `lockedTripIds`; re-run keeps it fixed and re-plans the rest.
- **Swap (next option):** re-pick just that slot — exclude the current trip id for that slot and take the next-best candidate; leave other trips intact.

The page owns `lockedTripIds` / per-trip swap state; the core stays pure.

## UI (`plan/page.tsx` + small components under `components/dashboard/summer-plan/`)
- **Masthead** (Field Notes): kicker, "PLAN your *summer*", subtitle. A **Regenerate** button.
- **Summary line:** "{tripCount} trips · {campgroundCount} campgrounds · {weekendCount} include a weekend · Jun–Sep".
- **Summer strip:** reuse the timeline axis + blocks (`TimelineAxis`, `AvailabilityBlock`/`TimelineTrack`) over a Jun–Sep `Horizon` to show the chosen trips on one axis.
- **Trip cards** in date order: trip number; dates with day-of-week + "incl. weekend" tag (`dowRangeLabel` / `runIncludesWeekend`); campground name + area; site with tier marker (★/◇/·); nights; **Book on recreation.gov** link (`bookUrl`); per-trip **lock** toggle and **swap** button.
- **Notes:** render `plan.notes` as small italic hints under the itinerary.
- **States:** loading (availability not yet loaded); partial ("Only found {n} trips worth booking this summer."); empty ("No summer openings yet — check back as sites free up.").

## Reuse
`timeline.ts` (`buildHorizon`, `siteTier`, `isWeekendNight`, `dowRangeLabel`, `runIncludesWeekend`, `siteRangeUrl`, `dateAt`), timeline components (axis/track/block), `CW` tokens, field-notes primitives, `useUserCampgrounds`, `useCampgroundsData`.

## Error handling
- Availability still loading → loading state, no compute.
- No candidates in window → empty state.
- Relaxations never throw; they append to `notes`.
- All date math via the existing local-ISO helpers to avoid timezone drift.

## Testing
- **Unit (`summer-planner.test.ts`):** distinct campgrounds preferred; trips spread across slots; favorites/weekends win on score; too-few-openings returns fewer trips with a note; locked trip always present and fixed; regenerate excludes prior picks when alternatives exist; swap changes only the targeted slot; deterministic given same input.
- **Component smoke test:** page renders the trip cards from a fixture; Regenerate changes the plan; lock keeps a trip across regenerate.

## Out of scope (v2 ideas)
- Water-access / kid-friendly biasing (needs reviews/attributes).
- User-adjustable window / trip count in the UI.
- Saving/sharing a plan; calendar export.
- Cross-checking real-time availability at click (the deep link already lands on rec.gov).
