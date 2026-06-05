# Handoff: Availability Timeline + Configure Campgrounds Modal

## Overview
Two CampWatch features, ready to implement on the live site:

1. **Availability Timeline** — the dashboard's core availability view. Replaces the old "tick-mark" availability row with a shared-axis timeline where every campground (and, expanded, every individual site) is a row over one common date axis. Openings are positioned blocks; weekend nights are visually distinguished; sites are grouped by a per-site tier (favorite / worthwhile / other). A mobile reflow is included.

2. **Configure Campgrounds Modal** — the watchlist setup/edit modal, reskinned to match the site's "Field Notes" editorial theme. Accordion of campground cards with name, IDs, season window, per-site favorite/worthwhile tagging, notification preference, and prime-day selection.

Both share one design system (documented under **Design Tokens**). Implement that token layer once and reuse across both.

---

## About the Design Files
The files in this bundle are **design references created in HTML/CSS/JS** — prototypes that show the intended look and behavior. They are **not production code to copy verbatim.** The HTML prototypes hard-code sample data, use inline styles / a local `<style>` block, and (for mobile) use React via in-browser Babel. 

Your task is to **recreate these designs in CampWatch's existing front-end environment**, using its established component patterns, styling approach, state management, and data layer. If the project has no front-end framework yet, choose the most appropriate one and implement there. Treat the HTML as the source of truth for **layout, measurements, color, type, and interaction** — and wire it to the **real availability data** (recreation.gov polling results) and real user settings rather than the sample arrays in these files.

## Fidelity
**High-fidelity.** Colors, typography, spacing, borders, shadows, and interactions are final. Recreate pixel-faithfully using your codebase's libraries. Exact values are in **Design Tokens**.

---

## Design Tokens

### Color
| Token | Hex / value | Use |
|---|---|---|
| `paper` | `#F4EAD8` | Page / app background (warm paper) |
| `cream` | `#FBF6EA` | Cards, inputs, raised surfaces |
| `ink` | `#1A1614` | Primary text, borders |
| `inkSoft` | `rgba(26,22,20,0.62)` (modal) / `0.70` (timeline) | Secondary text, hints |
| `rule` | `rgba(26,22,20,0.18)` | Dividers, input borders |
| `ruleSoft` | `rgba(26,22,20,0.09)` | Faint track background, hairlines |
| `forest` | `#1F3D2A` | Primary brand green: open availability, primary buttons, "on" toggles, worthwhile tier |
| `forestDeep` | `#142a1d` | Pressed-button shadow, deep header bg |
| `forestBright` | `#3c7a4f` | **Weekend (Fri/Sat) open nights** — the lighter green segment |
| `clay` | `#B65C3F` | Accent: labels/kickers, favorite tier, destructive actions, "now" marker |
| `mustard` | `#C9A227` | Limited availability (1–2 sites); prime-day ring |
| `bookedInk` | `rgba(26,22,20,0.22)` | Booked/disabled, placeholder text |
| weekend-open | `#3c7a4f` | brighter green for Fri/Sat open nights |
| limited weekend | `#C9A227` solid | vs. weekday limited = 45° mustard hatch |

**Availability status colors (the semantic core):**
- **Open** = `forest` `#1F3D2A` (weekday night) / `forestBright` `#3c7a4f` (Fri-Sat night)
- **Limited (1–2 sites)** = weekday: 45° hatch `repeating-linear-gradient(45deg, #C9A227 0 5px, rgba(201,162,39,.4) 5px 10px)`; weekend: solid `#C9A227`
- **Booked / unavailable** = `ruleSoft` track, no block

### Typography (Google Fonts)
Load: **Big Shoulders Display** (500,700,800,900), **Cormorant Garamond** (ital 400–700), **Source Serif 4** (400,500,600 + ital 400), **DM Mono** (400,500), **Caveat** (400,600).

| Role | Family | Usage |
|---|---|---|
| `head` (display) | **Big Shoulders Display**, sans-serif | Big uppercase headings, numeric stats, button labels. Weights 800–900. Negative tracking `-0.01em`. |
| `ital` (serif italic) | **Cormorant Garamond**, Georgia, serif | Campground names, hints, accent subheads. Often `font-style:italic`, weight 500. |
| `body` | **Source Serif 4**, Georgia, serif | Input values, paragraph copy. |
| `mono` | **DM Mono**, ui-monospace, monospace | All field LABELS (uppercase, `letter-spacing:.16em`), tags, dates, meta, kickers. |
| `hand` | **Caveat**, cursive | Occasional handwritten accent ("All quiet."). Use sparingly. |

Label convention: DM Mono, ~10px, `letter-spacing:.16em`, `text-transform:uppercase`, color `clay`.
Kicker convention: same, prefixed with `§` (e.g. `§ I — Season Window`).

### Spacing / radius / shadow
- Card border: `1.5px solid ink`.
- Signature elevation: **hard offset shadow** `box-shadow: 8px 8px 0 var(--forest)` on primary surfaces (modal: `10px 12px 0 forest`); secondary cards `4–5px 4–5px 0 rgba(26,22,20,0.14)`.
- Input radius `3px`; pills/toggles `999px`; small tiles/blocks `4–6px`; buttons `2px`.
- Primary button pressable shadow: `3px 3px 0 forestDeep`, translates on hover/active.
- Paper grain (optional): `radial-gradient(circle at 12px 12px, rgba(26,22,20,0.022) 0.8px, transparent 0.8px); background-size:5px 5px;`

---

## FEATURE 1 — Availability Timeline

**File:** `Availability Timeline.html` (desktop, vanilla JS), `Availability Timeline Mobile.html` + `mobile-timeline.jsx` + `ios-frame.jsx` (mobile, React).

### Concept
A **single shared horizontal time axis** spans the chosen season horizon (demo: May 1 – Sep 30 2026). Every watched campground is a **row** beneath that axis. Availability is drawn as **blocks positioned by date** — left edge = start date, width = duration. Because all rows share the axis, the user scans **down** to choose a place and **across** to read its season, and can **compare rows vertically** (the same calendar date is the same x-position on every row). No interaction is required to read it.

### Layout (desktop)
- Outer plate: `cream` card, `1.5px solid ink`, `box-shadow:8px 8px 0 forest`.
- **Header strip** (`grid-template-columns: 236px 1fr`, the 236px is shared by all rows as the "meta" column width via a CSS var `--meta`): left = mono label "Watchlist · click a row to expand its sites"; right = the **month axis** — month names (Big Shoulders, uppercase) positioned at each month's start x-position, with a 1px left border tick, plus a 2px `clay` vertical **"NOW"** line at today's x.
- **Each campground row** (`grid-template-columns: var(--meta) 1fr`):
  - **Meta cell** (left, `border-right:1px solid rule`): campground name (Cormorant italic 22px), location (Source Serif 12px `inkSoft`), and a status count line (mono, uppercase): `"19 nights open · 4 sites ▾"`. A clay `★` prefixes favorited names if applicable.
  - Below the count: a **tier tally** `★2 ◇1 ·1` (clay / forest / muted) + a `★ favorite open` pill (clay outline) shown when any favorite site has an opening.
  - **Track cell** (right, `position:relative; height:64px; padding:0 26px`): the time canvas. Contains, layered:
    1. **Weekend shading** — faint `clay` columns (`rgba(182,92,63,0.06)`) over each Fri+Sat pair, full track height.
    2. **Month dividers** — 1px `rgba(26,22,20,0.07)` verticals at each month start.
    3. **NOW line** — 2px `clay` at today.
    4. **Availability blocks** (see below).

### Availability blocks (the critical detail)
A block is an absolutely-positioned element: `left = (startDayIndex / totalDays) * 100%`, `width = (dayCount / totalDays) * 100%`, vertically centered, height ~24px (summary) / 15px (site rows), radius 5–6px.

- **Two-tone weekend fill:** a block is NOT a flat color. It is filled by one `<div>` segment **per night**, laid out with flex. Each night-segment is colored by whether that night is a **Fri or Sat** (weekend) or not:
  - open weekday night → `forest` `#1F3D2A`
  - open weekend night → `forestBright` `#3c7a4f`
  - limited weekday night → mustard 45° hatch
  - limited weekend night → solid `mustard`
  This makes "this opening includes a weekend" readable at a glance. (See `daysFill()` in the desktop file and the segment loop in `Track`/`block()` in `mobile-timeline.jsx`.)
- **Labels by width:** if the block is wide enough (≥11% of axis) show `"May 23–25"` + nights count; ≥6.5% show date only; narrower → no inline label, show date in a hover tooltip/`title` + a small tag-on-hover above the block.
- Open blocks: light box-shadow `0 2px 6px -2px rgba(20,42,29,.6)`. Limited: `0 2px 6px -3px rgba(201,162,39,.7)`.

### Expand to individual sites (by-site)
The campground row is the **union** of its sites' availability (open wins over limited wins over booked, computed per day). Clicking a campground header row **expands** it into one **thin sub-row per site** on the same axis:
- Site sub-rows are sorted **favorites-first** (`fav` → `worth` → `other`).
- Each site meta shows a **tier marker** before the site id: `★` (clay) favorite, `◇` (forest) worthwhile, `·` (muted) other. Then `Site A-07` (mono) + feature description (Cormorant italic, e.g. "lakefront · shade").
- **Favorite site rows** get a faint warm tint `rgba(182,92,63,0.055)`; **worthwhile rows** `rgba(31,61,42,0.035)`.
- **A favorite site's open blocks get a clay ring** `box-shadow:0 0 0 1.5px clay` so a favorite coming free pops out.
- A site with no availability shows a centered italic "booked all season" in its empty track.
- The chevron in the count line rotates 180° when open. Default: first campground expanded.

### Data model (replace sample data with real)
```
Campground {
  name: string,
  loc: string,           // "Redfish Lake · Sawtooth NRA, ID"
  sites: Site[]
}
Site {
  id: string,            // "A-07"
  feat: string,          // "lakefront · shade"
  tier: 'fav' | 'worth' | 'other',   // user-set per site
  open:  [startISO|dayIdx, endISO|dayIdx][],   // inclusive ranges of bookable nights
  lim:   [...][]          // ranges with only 1–2 sites left (campground-level) — see note
}
```
Notes for real implementation:
- The demo encodes ranges as **day-indices** from a `START` date over `N` days via helper `R(y,m,d1,d2)`. In production, derive day-index from real dates: `idx = floor((date - horizonStart) / 1 day)`, `pct = idx / horizonDays * 100`.
- `open`/`lim` come from diffing recreation.gov availability per site. "Limited" in the demo is a campground-level concept (1–2 sites left); decide whether you track limited per-site or per-campground and keep the color semantics.
- "Weekend" is defined as **Friday and Saturday nights** consistently everywhere. `isWkndNight(date) = (date.getDay() === 5 || date.getDay() === 6)`.
- The horizon (start/end) should come from the user's season window (see modal); demo uses 5 months.

### Interactions & behavior
- Click campground header → toggle `.siterows` expand/collapse + rotate chevron.
- Hover a narrow/label-less block → show date + nights tooltip.
- (Production) click a block → open that site/date on recreation.gov, or surface a detail popover.
- Reduced-motion: no essential animation; expand can be instant.

### Mobile reflow
**File:** `Availability Timeline Mobile.html` (harness) → `mobile-timeline.jsx` (React component `MobileShowcase`, depends on `ios-frame.jsx`'s `IOSDevice`). Two screens:

1. **Watchlist (glance):** The shared-axis idea survives a narrow screen by **compressing the full horizon to fit the width** (NOT horizontal scroll — that would hide rows and break vertical comparison). Sticky month axis at top; campgrounds grouped by tier into sections (★ Favorites → ◇ Worthwhile → · Everything else) with section headers; each row = name + ellipsis-truncated location + status pill + a compressed `Track`. Tap a row → detail.
2. **Detail:** Back link; a **tier badge** (★ Favorite / ◇ Worthwhile / · Other); campground title + season stat; a full-width `Track`; an **"Open windows" list** spelling out each opening with **day-of-week** (`Sat May 23 – Mon May 25`), an **"incl. weekend"** tag when applicable, nights count, and open vs. limited; then **only-the-relevant-month mini-calendars** (months with no availability are hidden, noted as "+N quiet months hidden") with **Fri/Sat columns shaded**; finally a forest **"Book on recreation.gov →"** CTA.

Note: on mobile the per-site rows belong on the **detail** screen (room to breathe), not the compressed watchlist. The desktop file currently has the by-site expansion; porting it into the mobile detail is a small remaining task if you want full parity.

### State
- `expandedCampgroundIds: Set` (desktop) — which campgrounds show site rows.
- `selectedCampgroundIndex` (mobile) — which detail screen is shown.
- Availability data + per-site tiers come from the backend / user settings.

---

## FEATURE 2 — Configure Campgrounds Modal

**File:** `Configure Campgrounds Modal.html` (vanilla JS).

### Purpose
Add / edit / reorder the campgrounds on a user's watchlist and set per-campground options, including which **individual sites** are tagged favorite / worthwhile (the same tiers the timeline renders).

### Layout
- **Scrim:** full-viewport, `rgba(20,15,12,0.5)` + slight blur over a dimmed dashboard backdrop; modal centered, `width:min(960px,100%)`, `max-height:92vh`.
- **Modal shell:** `paper` bg, `1.5px solid ink`, `box-shadow:10px 12px 0 forest, 0 40px 90px -30px rgba(20,15,12,0.8)`. Three regions: sticky header, scrolling body, sticky footer.
- **Header** (`cream`, `border-bottom:2px solid ink`): kicker `§ Watchlist · Field Station Setup` (mono, clay); title `CONFIGURE` (Big Shoulders 38px uppercase) with `campgrounds` on its own line (Cormorant italic 30px, forest); italic subtitle; a square close button (`38px`, `1.5px ink` border, inverts to ink-on-cream on hover).
- **Body:** a vertical list of **campground accordion cards**.
- **Footer** (`cream`, `border-top:2px solid ink`): left = quiet clay **"Reset to defaults"** (danger, transparent until hover); right = ghost **"Cancel"** + forest solid **"Save"** (pressable `3px 3px 0 forestDeep` shadow).

### Campground accordion card
- `cream` card, `1.5px ink`; expanded card gets `box-shadow:5px 5px 0 forest`, collapsed `4px 4px 0 rgba(26,22,20,0.14)`.
- **Header row** (clickable to expand): a 2×3 dot **drag grip** (reorder handle); campground **name** (Cormorant italic 23px; muted when collapsed); **tier chips** summarizing tagged sites (`★ 2` clay chip, `◇ 1` forest chip); a **delete** icon button (hover → clay); a **chevron** (rotates when expanded).
- **Body** (shown when expanded; `border-top:1px dashed rule`):

#### Fields (in order)
1. **Campground Name** * — text input.
2. **Area / Region** — text input.
3. Two-col grid: **Facility ID** * (mono input, hint "Matches the recreation.gov facility ID.") | **Type** (text, hint "As listed on recreation.gov.").
4. **Source** — mono input (e.g. `recreation.gov`).
5. **Description** — textarea (min-height 78px, vertical resize).
6. Section divider **`§ I — Season Window`**.
7. Two-col grid: **Start Date** | **End Date** — each a date input with a clay calendar icon (left), mono value, and a clear (`×`) button (right); hint "Optional — leave blank to use global settings."
8. Section divider **`§ II — Sites that matter`**.
9. Two-col grid: **★ Favorite Sites** (clay label) | **◇ Worthwhile Sites** (forest label) — each a **chip multiselect**: existing tags shown as pills (favorite = clay bg + `★`; worthwhile = forest bg + `◇`; each with a removable `×`), plus a "Type to add a site…" placeholder. Focus ring uses clay for the favorites box, forest for worthwhile. Hints below.
10. **Toggle row:** three pill toggles — `★ Show favorites`, `◇ Show worthwhile`, `Show all others` — track `bookedInk` off / `forest` on, 38×21px, knob translates 17px.
11. Section divider **`§ III — When to write you`**.
12. **Email me when** — label + right-aligned ghost "Use account default"; a **segmented control** (`1.5px ink`, 3px radius): `Favorites only` | `Favorites + Worthwhile` | `Any site opens`; active segment = forest bg, cream text. Hint "Favorites means only the sites you've starred above."
13. **Start Days** — label + ghost "Use global" + ghost "Prime days only"; a row of 7 **day checkboxes** (Sun–Sat): 20px box, `1.5px rule`, checked = `forest` fill + cream check SVG; **Fri & Sat boxes carry a gold ring** `box-shadow:0 0 0 2px rgba(201,162,39,.5)` (prime/weekend). "Prime days only" selects exactly Fri+Sat; "Use global" selects all. Hint explains the gold ring = weekend nights.
14. **Stay Length** — label + ghost "Customize"; hint "Currently 1–3 nights · matching your account default."

### Interactions & behavior
- Accordion: click header (except the delete button) toggles `.expanded`.
- Toggles: click flips on/off.
- Segmented control: click sets the single active segment.
- Day checkboxes: click toggles; "Prime days only" → only `.prime` (Fri/Sat) on; "Use global" → all on.
- Chip `×`: removes that site pill. Real impl: typing in the box autocompletes site ids from the campground's site list and adds a pill (assign tier by which box).
- Date clear `×`: empties the field.
- Footer Save persists; Cancel/close discards; Reset to defaults reverts the card(s).

### State
```
WatchlistConfig {
  campgrounds: Array<{
    id, name, area, facilityId, source, type, description,
    startDate?, endDate?,                    // null = use global
    favoriteSites: string[], worthwhileSites: string[],
    showFavorites: bool, showWorthwhile: bool, showOthers: bool,
    notifyMode: 'fav' | 'fav_worth' | 'any' | null,   // null = account default
    startDays: bool[7],                       // Sun..Sat
    stayLength: {min, max} | null,            // null = account default
    order: int
  }>
}
```
- Per-site tiers set here are exactly what the **timeline** reads (`Site.tier`). Keep the source of truth shared.
- Reorder via drag handle updates `order`.

---

## Interactions & Behavior (shared)
- All transitions are short (`.15–.2s`) ease. Honor `prefers-reduced-motion`.
- Focus states: inputs get `border-color:forest` + `box-shadow:0 0 0 3px rgba(31,61,42,0.12)` (favorites multiselect uses clay equivalent).
- Hover: buttons darken/translate as specified; icon buttons recolor to clay/forest.

## Responsive behavior
- Timeline: desktop = roomy shared-axis; phones = compressed-to-fit watchlist + tap-to-detail (do not horizontal-scroll the axis). One breakpoint, same data.
- Modal: `max-height:92vh` with internal scroll; two-col grids should collapse to single column on narrow widths.

## Assets
- **No raster assets.** All icons (close, trash, calendar, chevron, checkmark, grip) are inline SVG or CSS — reproduce with your icon set. Tier markers are the literal glyphs `★`, `◇`, `·`.
- **Fonts:** the 5 Google families listed in Typography. If the live site already self-hosts brand fonts, map roles accordingly; otherwise load these.
- `ios-frame.jsx` is a **prototype device bezel for presentation only** — do NOT ship it; it just frames the mobile screens in the demo.

## Files in this bundle
- `Availability Timeline.html` — desktop timeline, full logic (vanilla JS). **Primary reference for Feature 1.**
- `Availability Timeline Mobile.html` — mobile harness (loads the two below).
- `mobile-timeline.jsx` — React components for the mobile watchlist + detail screens.
- `ios-frame.jsx` — demo-only iPhone frame (`IOSDevice`). Not for production.
- `Configure Campgrounds Modal.html` — the modal, full logic (vanilla JS). **Primary reference for Feature 2.**

## Implementation order (suggested)
1. Build the **design-token layer** (colors, fonts, the label/kicker/section conventions, the offset-shadow card, button + input + pill primitives). Both features depend on it.
2. **Timeline desktop** (the availability block math + two-tone weekend fill + by-site expand) — highest value, most novel.
3. **Configure modal** (mostly standard form controls in the themed primitives).
4. **Timeline mobile** reflow; optionally port by-site rows into the mobile detail screen.
