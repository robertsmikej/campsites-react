# Campground Site Map + Campsite Info

**Date:** 2026-06-12
**Status:** Approved (pending spec review)
**Design source:** claude.ai/design project `9afded9f-...`, `design_handoff_map_and_site_info/` (README + `Campground Map Modal.html` + variants). Design is the source of truth for layout/color/type/interaction; **this conversation overrules the design where they conflict** (data adaptations + no drawn loops below).

## Problem

The dashboard answers "when can I go?" (availability) but not "which site, and where is it?" Users picking among sites at an unfamiliar campground have no spatial view and none of recreation.gov's per-site detail (rating, type, shade, cell, amenities).

## Decision summary

- **Architecture (from the design, locked):** map + full site info do NOT go inline in the dashboard. Clicking a campground row opens a **modal** with a satellite map + per-site info list. Dashboard stays glanceable.
- **Build scope:** everything in one pass — data endpoint, info components, modal shell + dashboard trigger, site list + popover, live satellite map, mobile reflow.
- **Map:** **Leaflet + Esri World Imagery** satellite tiles (free, no API key) + one **GPS pin per site** from real lat/long, colored by open/booked, clay star when favorite. **No hand-drawn loop overlay** — the satellite shows the real loops underneath; pins work for all 11 campgrounds with zero manual tracing. (Design wants a drawn loop; conversation overrules.)
- **Favorites/worthwhile** come from the existing user campground config (`sites.favorites` / `sites.worthwhile`) — single source of truth shared with the Configure modal and timeline.

## Data — design fields vs. real recreation.gov data

Source: `GET https://www.recreation.gov/api/search/campsites?fq=asset_id:{id}&size=1000&include_non_site_specific_campsites=true` (same upstream the `sites` route already calls — it just discards everything but names).

| Design field | Real source | Status |
|---|---|---|
| `lat`, `lng` | `latitude`, `longitude` | ✓ exact |
| `rating`, `reviews` | `average_rating`, `number_of_ratings` | ✓ exact |
| `type` + `hookup` | `permitted_equipment` (Tent/RV/Trailer + `max_length`), `campsite_type` | ✓ derived |
| `shade` | `attributes[]` → `site_details · Shade` (Full/Partial/Sun) | ✓ exact |
| `cell` per-carrier `{vz,att,tmo}` | `aggregate_cell_coverage` (single 0–4) | **ADAPT → single signal** |
| `water`, `restroom` | not present in the data | **DROP** |
| amenities (fire pit, picnic table, accessible, tent pad, campfire, max vehicle length, capacity) | `attributes[]` → `amenities`/`site_details`/`equipment_details` | ✓ use these instead of water/restroom |
| `open`, `openCount` | from the existing availability snapshot/diff per site | ✓ existing |
| `fav` | user config `sites.favorites` (worthwhile = `sites.worthwhile`) | ✓ existing |

**Adaptations (conversation overrules design):** cell renders as one aggregate Good/Weak/None signal, not VZ/AT&T/T-Mo. Water/restroom dropped. The site-info chip row becomes: **rating · type · shade · cell · key amenities** (fire pit / accessible / max RV length).

## New endpoint

`GET /api/campgrounds/[id]/site-details` → `{ sites: SiteDetail[] }`, 7-day KV cache keyed `site-details:{id}` (mirrors the `sites` route's cache pattern). Leaves the existing `sites` route (name-only, used by the config autocomplete) untouched.

```ts
interface SiteDetail {
    id: string;            // campsite name/number, e.g. "002"
    campsiteId: string;    // rec.gov campsite_id, for the booking link
    lat: number | null;
    lng: number | null;
    type: "tent" | "rv" | "walkin" | "other";
    maxRvLength?: number;  // from permitted_equipment
    rating: number | null;
    reviews: number;
    cell: number | null;   // aggregate 0–4
    shade?: "full" | "partial" | "sun";
    amenities: { firePit?: boolean; picnicTable?: boolean; accessible?: boolean; tentPad?: boolean; campfire?: boolean };
}
```

Availability (`open`/`openCount`) and `fav`/`worth` are merged client-side from data the dashboard already holds (snapshot + user config), keyed by site id — not baked into this endpoint.

## Components (themed in the existing Field Notes palette/fonts — already in the codebase)

- **StarRating(value, reviews)** — partial-fill 5 stars (mustard over inkFaint), numeric + "(reviews)".
- **CellSignal(level)** — aggregate 0–4 → bars + word Good/Weak/None (NOT per-carrier).
- **TypeBadge(type, maxRvLength)** — icon + label: RV (+max length), Walk-in, Tent.
- **SiteInfoChips(site)** — the hero row: rating · type · shade · cell · amenities.
- **Markers** — `ListMarker` (numbered circle, in the list) and `MapMarker` (teardrop pin, on the map). Both: forest fill+border when open, cream+faint border when booked, clay star badge when favorite, clay ring when selected, 1.12 hover scale. Row ↔ marker hover linked via shared `hovered` state.

## Modal (`CampgroundMapModal`)

Opened by a **"Map & sites" affordance on each `campground-timeline-row.tsx`** (a dedicated control — not overloading the existing row-click that expands the by-site timeline). Fixed overlay, scrim `rgba(20,15,12,0.55)` + 3px blur; modal `min(1100px,100%)`, `max-height:92vh`, flex column, paper bg, 1.5px ink border, offset shadow `10px 12px 0 forest`.

- **Header** (cream, 2px ink bottom): kicker `§ Watchlist · Site map & details`; name (Big Shoulders 900 ~34px); location; meta row (status pill + "7 of 24 sites bookable" + date-range chip); 36px square close.
- **Body** (scrolls): 2-col grid `520px 1fr`, 30px gap — **left** = map (min-height 430px) + "At a glance" summary; **right** = site list.
  - **Map**: Leaflet satellite, centered on the campground lat/long (z≈16, site pins readable), one pin per site, legibility scrim gradient over imagery, Esri attribution, legend beneath (● Open / ○ Booked / ★ Favorite). Click empty map = deselect.
  - **At a glance** (`MapSummary`): 3 hairline tiles — Sites open (forest "7/10"), Favorites (clay, star), Avg rating (mustard, star).
  - **Site list** (`SiteList`/`SiteRow`): header "10 of 24 sites · 7 open"; one row per site = marker chip + id + TypeBadge + SiteInfoChips; right = open count + "Book →" if open else "Watching"/"Booked". Favorite rows tint clay, others forest. Hover ↔ map marker.
  - **Site popover** (`SitePopover`): click marker or row → 248px cream card, `5px 5px 0 forest`, anchored to the marker. Site id + favorite star + type; rating; amenity grid (shade / cell / fire pit / accessible / max RV); "Book on recreation.gov →" if open else "Booked — watching".
- **Footer** (cream, 2px ink top): italic helper; Close (ghost) + Recreation.gov → (forest solid, pressable `3px 3px 0 forestDeep`) linking to the campground page.

## Map library + SSR

- **Leaflet + react-leaflet**, **Esri World Imagery** raster tile layer (`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`, free, no key), with the required Esri attribution string. Pins are `L.divIcon`/`Marker` styled per the design.
- Leaflet touches `window`; the map component is **dynamically imported `ssr: false`** so it never renders on the server. CSS imported in the client component.
- New dependencies: `leaflet`, `react-leaflet`, `@types/leaflet`.

## Mobile (`MobileExpanded`)

At ≤~430px the modal reflows: compact campground header → full-width map (~280px) → stacked site cards (marker + id + type + open count, then rating + wrapped chips + full-width "Book on recreation.gov →" when open). Reuses the same components and data; one breakpoint.

## State

```
mapModalCampgroundId: string | null   // which modal is open (null = closed)
selectedSiteId: string | null          // open popover
hoveredSiteId: string | null           // row ↔ marker hover link
```

## Testing

- **Endpoint:** maps real rec.gov fields → `SiteDetail` (lat/lng, rating, type from equipment, shade from attributes, aggregate cell, amenities); caches; tolerates missing fields (no shade, no rating) without throwing.
- **Info components:** StarRating partial fill; CellSignal 0–4 → Good/Weak/None buckets; TypeBadge RV-with-length / walk-in / tent.
- **Modal:** opens from the row trigger, closes; site list renders rows with availability + favorite tint; row↔marker hover state; popover open on row/marker click; "Book →" only when open.
- **Map:** component is client-only (no SSR crash — assert dynamic import boundary); markers rendered per site with open/favorite styling (jsdom-friendly assertions on marker props/classes, not tile rendering).
- **Mobile:** stacked card layout under the breakpoint.

## Out of scope

- Per-carrier cell coverage (API gives aggregate only).
- Hand-drawn loop-road overlays (satellite + pins instead).
- Water proximity / restroom distance (not in the data).
- Offline/cached tiles; non-recreation.gov campgrounds.
- Changing the dashboard's existing glanceable availability bars (untouched).
