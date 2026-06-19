# Adjacent-Site Group Availability — Design

**Date:** 2026-06-18
**Status:** Approved (brainstorming), pending implementation plan

## Goal

Help multiple families camp next to each other on the same dates. Detect when **2 or more
sites that are physically adjacent** in a campground are **simultaneously bookable for a
shared stay**, then surface that both in the notifier email and on the website. Enabled and
filtered per campground.

## Summary of decisions

| Decision | Choice |
| --- | --- |
| Adjacency detection | Hybrid: geo (adaptive kNN) with a site-number fallback |
| Geo rule | Each site links to its **2 nearest neighbors within a 60 m hard cap**, same `loop` when known |
| Number fallback | Used when ≥1 site in a pair lacks coords: consecutive integer site numbers, same `loop` when known |
| Group definition | Connected component of the adjacency graph, size ≥ 2 |
| "Same dates" | A **shared bookable window**: a date range meeting the user's stay-length + valid-start-day rules where every site in the cluster is open, excluding blackout overlaps |
| Min group size | Fixed at 2; actual count is always displayed |
| Anchor filter | Per-campground `adjacencyAnchor?: NotifyScope` (absent = off; `favorites` / `worthwhile` / `all`), mirroring `notifyScope` semantics |
| Relationship to per-site alerts | Additive and independent of `notifyScope` |
| On-site UI | Card pill next to the open-count badge + cluster highlight in the map modal |
| Email | Additive "Adjacent openings" section in the existing notifier email; subject leads with groups when present |
| Notifier coords | Lazy fetch + cache from rec.gov when the `site-details:${id}` KV entry is cold |

## Architecture

One shared pure module — `next/src/lib/adjacent-groups.ts` — is the single source of truth.
It is consumed by:

- **The website**, server-side: `buildSnapshot` in `next/src/app/api/availability/route.ts`
  attaches computed groups to each campground in the per-user snapshot.
- **The notifier**: `notifier/check.ts` calls the same module to produce email content.

Because card, map modal, and email all read groups computed by the same module from the same
coordinates, they cannot disagree.

A second shared helper — `next/src/lib/site-details-cache.ts` (`getSiteDetailsCached(id, kv)`)
— centralizes the "read `site-details:${id}` from KV; if cold, fetch the rec.gov campsites
endpoint, parse via `parseCampsite`, store with the existing 7-day TTL" logic. Both the
availability route and the notifier use it, so geo adjacency works even for campgrounds the
user has never opened in the UI. This refactors the fetch/cache currently inline in
`next/src/app/api/campgrounds/[id]/site-details/route.ts` into the shared helper.

## The detection engine (`adjacent-groups.ts`)

A pure function, no I/O. Inputs:

- `siteDetails: SiteDetail[]` — `id` (site number/name), `lat`, `lng`, plus `loop` if available
- `availabilityById: Record<string, SiteAvailability>` — open nights (`dates`) per site
- `tiers: { favorites: string[]; worthwhile: string[] }`
- `settings: { stayLengths: number[]; validStartDays: string[]; blackoutDates?: BlackoutRange[] }`
- `anchorScope: NotifyScope` (the campground's `adjacencyAnchor`)

Output: `AdjacentGroup[]`.

### Step 1 — Static adjacency graph (availability-independent)

Build an undirected graph over all sites in the campground.

- **Geo edges** — among the pairs where **both** sites have coords: compute haversine distance.
  For each site, take its 2 nearest neighbors; add an edge when the distance is ≤ **60 m**
  and (loop is unknown on either side, or both share the same `loop`). Edges are symmetric:
  an edge exists if either endpoint considers the other a nearest neighbor within the cap.
- **Number-fallback edges** — for any pair where **at least one** site lacks coords: add an
  edge when their site numbers are consecutive integers (parse the trailing integer from ids
  like `"002"` or `"A12"`; ignore ids with no parseable integer) and (loop unknown on either
  side, or both share the same `loop`).

Rationale (from measured rec.gov data, 2026-06-18): the next-door gap is typically 25–40 m,
but site spacing varies ~2× across campgrounds (Glacier View median 25 m vs. Sunny Gulch
47 m). A fixed radius either over-connects dense loops or misses spread-out ones; "2 nearest
within 60 m" self-scales to each campground's density and models "the site(s) next door"
directly.

A **group** is a connected component of this graph. Singletons are discarded.

### Step 2 — Shared bookable windows (per availability snapshot)

For each connected component:

1. Intersect the `dates` (open-night) sets of all sites in the component → the nights when
   the **whole** cluster is open.
2. For each configured stay length, run the existing
   `findConsecutiveAvailableRanges(commonNights, length)` on that intersection.
3. Keep windows whose start day is in `validStartDays` and which do not overlap any
   `blackoutDates` range (reuse `stayOverlapsBlackout`).
4. Apply the **anchor filter**: the component must contain at least one site in the required
   tier — `favorites` ⇒ ≥1 favorite; `worthwhile` ⇒ ≥1 favorite-or-worthwhile; `all` ⇒ no
   requirement (`NotifyScope` semantics, favorites ⊂ worthwhile ⊂ all).

Each surviving (component, window) pair is one `AdjacentGroup`. A component can yield several
groups if it has multiple distinct shared windows. When a window is a sub-range of a larger
shared window the larger one is preferred (reuse the non-overlapping filter already applied to
per-site matches).

### Output type

```ts
interface AdjacentGroup {
    campgroundId: string;
    siteIds: string[];     // sorted, stable — used for dedup signature
    siteNames: string[];   // display order (numeric)
    from: string;          // YYYY-MM-DD
    to: string;            // YYYY-MM-DD
    nights: number;
    anchorTier: "favorites" | "worthwhile" | "none"; // best tier present in the group
}
```

## Data model changes (`next/src/types/campground.ts`)

- `Campground.adjacencyAnchor?: NotifyScope` — absent = feature off for this campground.
  Optional, with a clear button in the editor, exactly like `notifyScope`.
- `SnapshotCampground.adjacentGroups?: AdjacentGroup[]` (in `recgov/cache.ts`).
- `ProcessedCampground.adjacentGroups?: AdjacentGroup[]` — carried through `campground-utils.ts`
  so client components can read it.

## Website

### Server (`/api/availability` → `buildSnapshot`)

After computing `sitesWithMatches` for a campground, if `cg.adjacencyAnchor` is set:
load coords via `getSiteDetailsCached(cg.id, kv)`, call `adjacent-groups`, attach
`adjacentGroups` to the `SnapshotCampground`. The snapshot is already cached per user, so
groups are cached with it. Toggling `adjacencyAnchor` invalidates/rebuilds the snapshot like
any other config change (verify the existing invalidation path covers config edits).

### Card pill

A new small component near `next/src/components/campground/open-count-badge.tsx` renders an
"adjacent" pill (chain icon + count, e.g. `⛓ 2 adjacent`) beside the open-count badge, shown
only when `adjacentGroups` is non-empty. Count reflects the largest current group.

### Map modal

In the map modal (`next/src/components/dashboard/map-modal/`): highlight the grouped open
sites on the Leaflet map (halo/connector) and label the cluster in the site list
("Adjacent group · sites 12–14 · open Jun 13–15"). Reads `adjacentGroups` from the snapshot
(not recomputed client-side) — simpler and guaranteed consistent with the card and email.

## Notifier

`notifier/check.ts`:

- For each campground with `adjacencyAnchor` set, load coords via the shared
  `getSiteDetailsCached` helper (lazy fetch + cache) and call `adjacent-groups`.
- New matches are diffed and deduped with the **same machinery** as per-site openings:
  a group signature = sorted `siteIds` + `from` + `to`; reuse the 24 h cooldown and the
  15-minute non-curator lead time. Store group state in a new bucket alongside the existing
  per-site `sites` map in `NotifierState` (e.g. `groups?: Record<string, {from,to,seen}[]>`,
  keyed by `campgroundId:sortedSiteIds`).
- Group alerts are additive: per-site alerts continue unchanged per `notifyScope`.

### Email (`notifier/lib/email.ts`)

Add an "Adjacent openings" block (rendered above the per-site matches, since it is the
higher-value signal): per group, show campground name, site numbers, the shared window dates,
nights, and per-site booking links. When any group match exists, the subject line leads with
it, e.g. `2 adjacent sites open at Glacier View (Jun 13–15)`. Keep `email-preview.html` /
`render-preview.ts` in sync.

## Error handling & edge cases

- No coords and no parseable site numbers ⇒ no geo or number edges ⇒ no groups (feature
  silently yields nothing for that campground, never errors).
- rec.gov fetch failure in `getSiteDetailsCached` ⇒ return empty details (degrade to
  number-only or nothing), matching the existing modal degradation behavior.
- A campground with `adjacencyAnchor` unset is skipped entirely (no extra coord fetch, no
  computation).
- Blackout dates and per-campground `stayLengths` / `validStartDays` overrides are respected
  via the shared `settings` input.

## Testing

`adjacent-groups.test.ts` (vitest, mirroring `map-sites.test.ts` style):

- Geo edges: within / over 60 m; the 2-nearest rule (a 3rd close site beyond the 2 nearest is
  still linked only if within cap and mutually nearest); same-loop guard blocks cross-loop links.
- Number fallback: consecutive ids, leading zeros (`"002"`/`"003"`), non-numeric ids ignored,
  missing loop, mixed coord/no-coord pairs.
- Connected components: a row A–B–C forms one group of 3; an isolated site forms none.
- Shared windows: full overlap, partial overlap shorter than min stay (rejected), stay-length
  filtering, valid-start-day filtering, blackout exclusion.
- Anchor filter: `favorites` / `worthwhile` / `all`; group with no qualifying tier rejected.
- Min size 2 enforced; count reported correctly.

`site-details-cache.test.ts`: cache hit, cold fetch + store, fetch failure → empty.

Notifier: group dedup / cooldown / lead-time integration; subject-line selection; lazy coord
fetch. **Note:** notifier CI is not covered by the `next/` pipeline — run `tsc` + vitest in
`notifier/` manually before deploy.

Front end: card pill renders only when groups exist; map highlight; `serialize` round-trip for
the new `adjacencyAnchor` config field.

## Out of scope (YAGNI)

- Configurable minimum group size (fixed at 2 for now).
- Per-campground geo-threshold override.
- De-duping individual-site alerts against group alerts (alerts are intentionally additive).
