# Phase 0c: UI Port from CRA + MUI to Next.js + shadcn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the campground dashboard at `/app` from the existing CRA + MUI app (repo root, `src/`) to the new Next.js + Tailwind + shadcn/ui app at `next/`. End state: visiting `https://campwatch.mikeroberts421.workers.dev/app` renders the same dashboard as the current production site, reading from the same shared KV config and the new Next.js Route Handlers (Phase 0b). No new features — feature parity only. Production traffic still routes to the old Worker until Phase 0d.

**Architecture:** The new Next.js Route Handlers (Phase 0b) are already serving `/api/config`, `/api/subscribe`, `/api/unsubscribe`, `/api/subscribers` on the campwatch Worker. This phase adds a single new client page at `next/src/app/app/page.tsx` (i.e., the URL `/app`) that reproduces the existing CampgroundsGroups dashboard. Data flows: page → hook → `/api/config` for hydration → recreation.gov API client-side (same as the CRA app does today). State stays local to the page (useState hooks); no global state lib.

**Tech Stack swap (1:1 substitutions):**

| Old (CRA / MUI) | New (Next.js / Tailwind + shadcn) |
|---|---|
| `@mui/material` Card/CardHeader/CardContent | shadcn `Card`/`CardHeader`/`CardContent` |
| `@mui/material` Accordion family | shadcn `Accordion` (Radix-based) |
| `@mui/material` Dialog family | shadcn `Dialog` |
| `@mui/material` DropdownMenu equivalents | shadcn `DropdownMenu` |
| `@mui/material` Switch | shadcn `Switch` |
| `@mui/material` Slider | shadcn `Slider` |
| `@mui/material` Tabs/ToggleButtonGroup | shadcn `Tabs` (or `ToggleGroup`) |
| `@mui/material` Table family | shadcn `Table` |
| `@mui/material` Snackbar/Alert | `sonner` (already in shell) |
| `@mui/material` Tooltip | shadcn `Tooltip` |
| `@mui/material` Skeleton | shadcn `Skeleton` |
| `@mui/material` Chip | shadcn `Badge` |
| `@mui/material` AppBar/Toolbar | Tailwind layout primitives |
| `@mui/x-date-pickers` `StaticDatePicker` | shadcn `Calendar` (`react-day-picker`) with custom `Day` component |
| `@mui/icons-material` | `lucide-react` |
| HTML5 drag-and-drop | `@dnd-kit/core` + `@dnd-kit/sortable` |
| `react-hook-form` (none today) | `react-hook-form` + `zod` for new forms |

**Reference reading before starting:**
- `src/App.js` (522 lines) — top-level state, hydration, save flow
- `src/components/CampgroundsGroups.jsx` (669 lines) — main grid + per-campground accordion + view toggle
- `src/components/Campground.jsx` (244 lines from earlier) — per-section card
- `src/components/CampsitesCalendar.jsx` (400 lines) — custom calendar with variants (load-bearing)
- `src/components/CampsitesCalendarParent.jsx` (92 lines)
- `src/components/CampsitesTable.jsx` (236 lines)
- `src/components/NotificationSubscribe.jsx` (104 lines)
- `src/components/SiteConfigDialog.jsx` (1128 lines) — biggest port
- `src/components/TopBar.jsx` (199 lines)
- `src/calls/fetchCampgroundData.jsx` (532 lines) — recreation.gov client + cache + match processing
- `src/utils/utils.js` (258 lines) — grouping/date helpers
- `src/constants/settings.js`, `src/json/siteConfigurations.js`, `src/json/campgroundCatalog.js`, `src/json/sites.js`

**Implementer guidance:**
- The CRA source is the source of truth for behavior. Don't reinvent — port. When a task says "port X to Y," read X end-to-end first, then write Y so it behaves identically.
- Type aggressively. The CRA app is plain JS; this port should be TypeScript with explicit types for campgrounds, sites, matches, settings.
- Tests live next to the file as `<name>.test.ts(x)` and focus on data-layer logic (cache, match aggregation, group formatting) — pure functions. UI components don't get unit tests in this phase; behavioral verification is the live smoke test at the end.
- Commit at the end of every task. Run `tsc --noEmit` + `pnpm run cf:build` periodically (and at the end of every section).

---

## Pre-flight

### Task 0: Branch + sanity check

- [ ] **Step 1:** From the repo root:

```bash
git checkout main && git pull --ff-only
git checkout -b feature/phase-0c-ui-port
git status -s  # expect clean
cd next && pnpm install --frozen-lockfile && pnpm run cf:build 2>&1 | tail -3
```

Expected: `OpenNext build complete.`

---

## Section A: Types and data files

### Task A1: TypeScript types for the campground domain

Single types file establishing the shapes that everything else in this phase will consume.

**Files:**
- Create: `next/src/types/campground.ts`

- [ ] **Step 1:** Create the file with these exported types (one source of truth for the rest of the phase):

```ts
export type CampgroundSystem = "recreation.gov";

export interface SiteAvailability {
    siteId: string;
    siteName: string;
    dates: string[];                 // ISO date strings, sorted, unique
    matches: StayMatch[];
    excludedMatches: ExcludedStay[];
    photos?: string[];
    photo?: string;
    campsite_type?: string;
    max_num_people?: number;
    max_vehicle_length?: number;
}

export interface StayMatch {
    from: string;                    // YYYY-MM-DD
    to: string;
    nights: number;
}

export interface ExcludedStay extends StayMatch {
    excluded: true;
    reason: "stayLength" | "startDay";
}

export interface CampgroundDates {
    startDate?: string;
    endDate?: string;
}

export interface CampgroundShowOrHide {
    Favorites: boolean;
    Worthwhile: boolean;
    "All Others": boolean;
}

export type CampgroundType = "campground" | "cabin" | "lookout";

export interface Campground {
    id: string;
    name: string;
    area?: string;
    site?: string;
    type?: CampgroundType | string;
    description?: string;
    dates?: CampgroundDates;
    image?: string;
    sites: { favorites: string[]; worthwhile: string[] };
    showOrHide?: Partial<CampgroundShowOrHide>;
    notifyAll?: boolean;
    enabled?: boolean;                // false = skip API calls, default true
    validStartDays?: string[];        // overrides global
    stayLengths?: number[];           // overrides global
}

export interface ProcessedCampground extends Campground {
    siteAvailability: Record<string, SiteAvailability>;
    sitesGroupedByFavorites?: {
        Favorites: SiteAvailability[];
        Worthwhile: SiteAvailability[];
        "All Others": SiteAvailability[];
    };
    excludedMatches?: {
        byStayLength: number;
        byStartDay: number;
        sites: Record<string, { siteId: string; byStayLength: number; byStartDay: number }>;
    };
    hasAvailability?: boolean;
}

export interface GlobalSettings {
    stayLengths: number[];
    validStartDays: string[];
}

export interface SiteConfig {
    "recreation.gov": Campground[];
}

export interface ApiConfigResponse {
    campgrounds: SiteConfig;
    globalSettings?: GlobalSettings;
}

export interface CampgroundsBySystem {
    "recreation.gov"?: ProcessedCampground[];
}
```

- [ ] **Step 2:** Commit:

```bash
git add next/src/types/
git commit -m "Add TypeScript types for campground domain"
```

### Task A2: Port the catalog + default configurations + sites merger

These are pure data files. Trivial 1:1 port to TypeScript.

**Files:**
- Create: `next/src/data/campground-catalog.ts` (port of `src/json/campgroundCatalog.js`)
- Create: `next/src/data/site-configurations.ts` (port of `src/json/siteConfigurations.js`)
- Create: `next/src/data/sites.ts` (port of `src/json/sites.js`)
- Create: `next/src/data/site-data.ts` (port of `src/json/siteData.js`)
- Create: `next/src/data/mock-recreation-api.ts` (port of `src/json/mockRecreationApi.js` — only used when `useMockData` is on)

- [ ] **Step 1:** Open each CRA source file, port the data verbatim into TypeScript using the types from Task A1. The CRA files use `export const X = { ... }`; the ports do the same but with `as const`-style narrowing where useful. The `defaultCampgroundConfigurations` data structure must stay byte-equivalent.

- [ ] **Step 2:** Port the merger logic from `src/json/sites.js`:

```ts
// next/src/data/sites.ts
import type { Campground, SiteConfig } from "@/types/campground";
import { campgroundCatalog } from "./campground-catalog";
import { defaultCampgroundConfigurations } from "./site-configurations";
import { deepMerge } from "@/lib/campground-utils";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function indexById(entries: Campground[] = []): Record<string, Campground> {
    return entries.reduce((acc, entry) => {
        if (entry?.id) acc[entry.id] = entry;
        return acc;
    }, {} as Record<string, Campground>);
}

export function mergeCatalogWithConfigurations(
    catalog: SiteConfig = campgroundCatalog,
    configs: SiteConfig = defaultCampgroundConfigurations,
): SiteConfig {
    const merged: SiteConfig = { "recreation.gov": [] };
    const systemConfigs = indexById(configs["recreation.gov"] ?? []);

    merged["recreation.gov"] = catalog["recreation.gov"].map((campground) => {
        const base = clone(campground);
        const overrides = systemConfigs[campground.id];
        if (!overrides) return base;
        return deepMerge(base, clone(overrides));
    });

    return merged;
}

export const sites = mergeCatalogWithConfigurations();

export function getCampgroundOptions() {
    return campgroundCatalog["recreation.gov"].map((c) => ({
        system: "recreation.gov" as const,
        ...c,
    }));
}
```

- [ ] **Step 3:** Commit:

```bash
git add next/src/data/
git commit -m "Port campground catalog, configurations, and sites merger to TypeScript"
```

### Task A3: Port the utils module

**Files:**
- Create: `next/src/lib/campground-utils.ts` (port of `src/utils/utils.js`)
- Test: `next/src/lib/campground-utils.test.ts` (pure-function coverage)

The CRA `utils.js` exports a lot of helpers; carry the same names so callers don't have to think:

```
formatToMMDDYYYY, getDayOfWeek, getShortenedDayOfWeek, sortBySiteName, sortByFromDate,
checkForAvailability, checkForAvailabilityInArray, checkForGroupAvailability,
checkForGroupedAvailability, formatGroupsByFavorites, formatGroups, getSitesWithMatches,
getAllMatchesFromCampground, mergeObjects, getAllArraysFromParentObjects,
getDateForCurrentMonth, getDateForFutureMonth, getEmptyGroupedSites, getTotalGroups,
buildReservationLink, goToPage, deepMerge, getLocalCurrentTime, flattenData,
checkForAppropriateGroups
```

`siteGroups` constant moves to `next/src/lib/settings.ts` (Task A4).

- [ ] **Step 1:** Port `src/utils/utils.js` verbatim into TypeScript. Add return types to every exported function. Replace the import from `../constants/settings` with `@/lib/settings`.
- [ ] **Step 2:** Write tests for the pure-data helpers (no DOM, no fetch):
  - `getDayOfWeek("2026-05-15")` returns `"Fri"` and `"Friday"` (long)
  - `formatToMMDDYYYY("2026-05-15")` returns `"05/15/2026"`
  - `getEmptyGroupedSites()` returns `{ Favorites: [], Worthwhile: [], "All Others": [] }`
  - `deepMerge({ a: { x: 1 } }, { a: { y: 2 } })` returns `{ a: { x: 1, y: 2 } }`
  - `buildReservationLink("69080", "2026-05-27", 2)` returns the recreation.gov URL with `arrivalDate=2026-05-27` and `departureDate=2026-05-29`
- [ ] **Step 3:** `pnpm test` → all green. Commit.

### Task A4: Port constants/settings

**Files:**
- Create: `next/src/lib/settings.ts` (port of `src/constants/settings.js`)

The CRA file exports `siteGroups`, `defaultSettings`, `getSitewideDefaultSettings`. Port verbatim and add types.

```ts
export const siteGroups = {
    favorites: { label: "Favorites", default: true },
    worthwhile: { label: "Worthwhile", default: true },
    allOthers: { label: "All Others", default: true },
} as const;
```

Plus typed defaults. Commit.

---

## Section B: Recreation.gov client + cache + match processing

### Task B1: Port the recreation.gov fetch + cache + match processor

This is the heaviest pure-logic port. It's ~530 lines of JS; the TypeScript version should be the same shape with explicit types.

**Files:**
- Create: `next/src/lib/recreation-gov.ts` (port of `src/calls/fetchCampgroundData.jsx`)
- Test: `next/src/lib/recreation-gov.test.ts`

- [ ] **Step 1:** Port every exported and module-private function with these names preserved: `fetchCampgrounds`, `getSiteFetchMap`, `makeAllRequests`, `removeParentFromObject`, `clearCampgroundCache`, `getAllDatesInRange`, `findConsecutiveAvailableRanges`, `filterLongestNonOverlappingStays`, `CACHE_DURATION_MS`.

- [ ] **Step 2:** Read the CRA file end-to-end before editing. The two non-trivial pieces:

   - `processApiResults` — builds `siteAvailability` per campground, then for each site computes `matches` (1-14 nights, valid stayLength + valid startDay) and `excludedMatches` (everything else). The non-overlapping filter is load-bearing. Port the algorithm verbatim.
   - `calculateExcludedMatches` — same logic but applied to cached data so exclusion counts stay accurate after settings change.
   - `reorderResultsByConfig` — filters out `enabled === false` campgrounds (Phase 0a feature) and reorders by config order. Port verbatim.
   - `getCache`/`setCache` — localStorage-backed cache with the "don't overwrite data with empty data" guard. Port verbatim.

- [ ] **Step 3:** Tests focused on the pure logic (no fetch):
   - `findConsecutiveAvailableRanges(["2026-05-27"], 1)` → `[["2026-05-27", "2026-05-28"]]`
   - `findConsecutiveAvailableRanges(["2026-05-27", "2026-05-28", "2026-05-29"], 2)` → 2-night ranges only
   - `getAllDatesInRange("2026-05-01", "2026-05-03")` → 3 dates
   - `getSiteFetchMap` skips `enabled === false` campgrounds
   - `reorderResultsByConfig` strips disabled campgrounds even from cached data

- [ ] **Step 4:** `pnpm test`. Commit.

### Task B2: Port the progress/site-settings contexts

**Files:**
- Create: `next/src/context/site-settings.tsx` (port of `src/context/SiteSettingsContext.js`)
- Create: `next/src/context/progress-bar.tsx` (port of `src/context/ProgressBarContext.js`)

Both CRA files are 4-line `React.createContext()` shells. Same in TS with `null` default and a typed Provider hook (`useSiteSettings`, `useProgressBar`). Commit.

---

## Section C: Top bar + progress bar + theme primitives

### Task C1: Port ProgressBarEl

**Files:**
- Create: `next/src/components/progress-bar-el.tsx` (port of `src/components/ProgressBarEl.jsx`)

CRA component is 18 lines — an MUI LinearProgress wired to the ProgressBarContext. Replace with a Tailwind progress bar (or shadcn `Progress` if available — `pnpm dlx shadcn@latest add progress` if not already in tree). Same context binding. Commit.

### Task C2: Port the TopBar

**Files:**
- Create: `next/src/components/top-bar.tsx` (port of `src/components/TopBar.jsx`)

The CRA TopBar renders a logo, title, subtitle, a refresh indicator, an action area, and a menu (button → dropdown with toggle items + action items + dividers). Port with:

- Title + subtitle: Tailwind typography classes.
- Logo: `<Image>` from `next/image` reading from `/images/logos/CampWatch_Logo_trimmed.png` (copied in Section H).
- Menu: shadcn `DropdownMenu` with `DropdownMenuCheckboxItem` for `type: 'toggle'` entries and `DropdownMenuItem` for action entries.
- Refresh spinner: lucide `Loader2` with `animate-spin` while `isRefreshing` is true.

Keep the prop signature identical: `{ title, subtitle, logo, menuItems, isRefreshing, actionItems }`. Commit.

---

## Section D: Notification subscribe form

### Task D1: Port NotificationSubscribe

**Files:**
- Create: `next/src/components/notification-subscribe.tsx` (port of `src/components/NotificationSubscribe.jsx`)

The CRA form: an email input + a submit button. On submit, posts to `/api/subscribe`. Shows success/error via the (old) Snackbar; in the new app, fire a sonner toast via the Toaster already in the root layout.

Rewrite the form with `react-hook-form` + `zod`:

```ts
const Schema = z.object({ email: z.string().email() });
const form = useForm<z.infer<typeof Schema>>({ resolver: zodResolver(Schema) });
```

`pnpm add zod @hookform/resolvers` first (if not already in tree). Commit.

---

## Section E: SiteConfigDialog

This is the biggest single file. The CRA version is 1128 lines and does a lot: cards view, list view, drag-drop, per-campground editing, global settings, add campground autocomplete, custom-not-listed flow, reset to defaults, save with sync. The port preserves all of this with shadcn primitives.

### Task E1: Dialog shell + tabs view-mode toggle

**Files:**
- Create: `next/src/components/site-config-dialog/index.tsx` (the shell)
- Create: `next/src/components/site-config-dialog/types.ts` (editable-campground shape used inside the dialog)

Shell renders a shadcn `Dialog` with title `Configure Campgrounds`, body content TBD by subsequent tasks, and footer with `Cancel`, `Reset to defaults`, `Save` buttons. View toggle (cards/list) at the top via shadcn `Tabs` or `ToggleGroup`.

Reuse `toEditableCampground` and `sanitizeCampground` helpers from the CRA file — port them to `next/src/components/site-config-dialog/serialize.ts` with full type annotations. Tests for both:

- `toEditableCampground` populates `favoritesArray`, `worthwhileArray`, `catalogId` correctly given a known catalog ID list
- `sanitizeCampground` preserves `enabled`, `notifyAll`, `validStartDays`, `stayLengths` when present and omits them when default

Commit.

### Task E2: General Settings section (Accordion at top)

**Files:**
- Create: `next/src/components/site-config-dialog/general-settings.tsx`

Mirrors the post-Phase-0a "General Settings" accordion: stayLength `Slider`, valid start days as `Checkbox` row, plus the two top-bar-moved toggles "Use my own settings (this device only)" and "Use mock data" (each a shadcn `Switch` with caption). Wire to props (the parent owns the state). Commit.

### Task E3: Add-campground row

**Files:**
- Create: `next/src/components/site-config-dialog/add-campground.tsx`

CRA file has a `TextField select` with the catalog options + `Custom / Not listed`. Replace with shadcn `Select` (catalog options + `__custom`). Add button uses shadcn `Button`. Same behavior: clicking Add appends a new campground entry to the list. Commit.

### Task E4: Per-campground editor card (cards view)

**Files:**
- Create: `next/src/components/site-config-dialog/campground-editor.tsx`

Reproduces the existing AccordionSummary + AccordionDetails pattern with the enable Switch, delete button, drag handle, and the inner form (date pickers, favorites/worthwhile autocomplete, show/hide checkboxes, notifyAll toggle, validStartDays/stayLengths overrides if customized).

Substitutions:
- MUI Accordion → shadcn `Accordion` (with `type="multiple"` for independent expand state per row).
- MUI X DatePicker → shadcn `Popover` wrapping `Calendar` with a `Button` trigger that shows the formatted date. Pattern is documented at shadcn docs "Date Picker" example.
- MUI Autocomplete → shadcn `Command` + `Popover` (the "Combobox" example in shadcn docs).
- MUI ToggleButton for "Show in section" → shadcn `Toggle` or `Checkbox`.

The drag-and-drop reordering uses `@dnd-kit`. Install in Task E6.

Carry the existing field labels verbatim. Commit.

### Task E5: List view (table)

**Files:**
- Create: `next/src/components/site-config-dialog/campgrounds-table.tsx`

shadcn `Table` with the same columns as today: drag handle, Campground (with enable Switch), Area, Facility ID, Source, Actions (Edit / Delete). Edit jumps back to cards view focused on that row (state lifted to dialog shell). Commit.

### Task E6: Drag-and-drop reordering

**Files:**
- Modify: `next/src/components/site-config-dialog/campground-editor.tsx`
- Modify: `next/src/components/site-config-dialog/campgrounds-table.tsx`

`pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/modifiers` first.

Wrap the cards list and table body in a `DndContext` + `SortableContext`. Each row uses `useSortable`. On `onDragEnd`, swap entries in the campground array. Drag handles use the `attributes`/`listeners` from `useSortable`.

Commit.

### Task E7: Wire dialog into a single `<SiteConfigDialog />` export

**Files:**
- Modify: `next/src/components/site-config-dialog/index.tsx`

Combine all sub-components, manage local state, call `onSave(sanitizedConfig, globalSettings)` and `onResetToDefaults()` and `onClose()`. Same prop signature as today's CRA dialog:

```ts
interface SiteConfigDialogProps {
    open: boolean;
    onClose: () => void;
    onSave: (config: SiteConfig, globalSettings: GlobalSettings) => void;
    onResetToDefaults: () => void;
    initialData: SiteConfig;
    catalogOptions: ReturnType<typeof getCampgroundOptions>;
    globalSettings: GlobalSettings;
    availableSites: Record<string, string[]>;
    useMockData: boolean;
    onToggleMockData: (event: React.ChangeEvent<HTMLInputElement>) => void;
    useLocalConfig: boolean;
    onToggleUseLocalConfig: (event: React.ChangeEvent<HTMLInputElement>) => void;
}
```

Commit.

---

## Section F: Campground rendering

### Task F1: Type badge + reservation link helpers

**Files:**
- Create: `next/src/components/campground/type-badge.tsx` (port of the `TYPE_BADGES` map + `getTypeBadge` from `CampgroundsGroups.jsx:38-49`)
- Move (already in place from B/A): reservation-link helper lives in `campground-utils.ts`

The badge uses lucide icons (`Flame` for campground, `Mountain` for cabin/lookout — pick lucide equivalents close to the current MUI icons: `LocalFireDepartment → Flame`, `Cabin → Cabin` (lucide has a `Cabin`? if not, use `House`), `Landscape → Mountain` or `MountainSnow`). Commit.

### Task F2: CampsitesTable

**Files:**
- Create: `next/src/components/campsites-table.tsx` (port of `src/components/CampsitesTable.jsx`)

shadcn `Table`. Columns: site, dates available (chip list), nights, "Reserve" link button. Preserve the sorting and the way matches are grouped per site. Commit.

### Task F3: CampsitesCalendar — the load-bearing port

**Files:**
- Create: `next/src/components/campsites-calendar.tsx` (port of `src/components/CampsitesCalendar.jsx`)
- Create: `next/src/components/campsites-calendar-parent.tsx` (port of `CampsitesCalendarParent.jsx`)

This is the trickiest port. The CRA file uses MUI X `StaticDatePicker` with a custom `PickersDay` that paints availability variants (range-start, range-middle, range-end, single, plus "soft" and "excluded" prefixed variants). Six paint styles + radius logic + a 115deg gradient for the end-of-range tail.

In shadcn, replace with `Calendar` (which uses `react-day-picker` under the hood). `react-day-picker` exposes a `components.DayButton` slot (v9+) where we render the cell ourselves with the appropriate Tailwind classes:

- Pre-compute the variant map per the existing `buildVariantMap` logic — port verbatim.
- The `DayButton` component looks up the variant for `day.format("YYYY-MM-DD")` and applies a Tailwind class set.
- Use Tailwind classes plus a tiny `cn()`-merged class table:

```ts
const VARIANT_CLASS: Record<string, string> = {
    single: "rounded-full bg-emerald-600 text-white",
    rangeStart: "rounded-l-full bg-emerald-600 text-white",
    rangeMiddle: "bg-emerald-600 text-white",
    rangeEnd: "bg-emerald-600 text-white",
    softSingle: "rounded-full bg-emerald-200 text-emerald-900",
    softRangeStart: "rounded-l-full bg-emerald-200 text-emerald-900",
    softRangeMiddle: "bg-emerald-200 text-emerald-900",
    softRangeEnd: "bg-emerald-200 text-emerald-900",
    excludedSingle: "rounded-full bg-orange-500 text-white",
    excludedRangeStart: "rounded-l-full bg-orange-500 text-white",
    excludedRangeMiddle: "bg-orange-500 text-white",
    excludedRangeEnd: "bg-orange-500 text-white",
};
```

For the 115deg gradient on `rangeEnd`, apply `bg-gradient-to-br from-emerald-600 from-65% to-transparent to-65%` (Tailwind v4 supports `from-<percent>`).

Months to show: port `getMonthsFromSiteData` from the CRA file. Render N `Calendar` components in a row (one per month).

Click handler: same `goToPage(site, month)` that opens the recreation.gov reservation page.

Tests:
- `buildVariantMap` — given a matches array and excluded ranges, returns the expected `Map` (this is pure logic and worth testing). Port the tests against the existing CRA logic by constructing fixtures from the CRA file's actual data shape.

Commit.

### Task F4: Photo preview dialog

**Files:**
- Modify: `next/src/components/campsites-calendar.tsx` (photo button stays in the calendar's header strip)
- Create: a small `<PhotoPreviewDialog />` component (shadcn `Dialog` with a stacked image list) — can live inline in the calendar file if small.

Same UX as today: click "Photos" → modal with all the site's photos in a column. Commit.

### Task F5: Campground card (the per-section wrapper)

**Files:**
- Create: `next/src/components/campground.tsx` (port of `src/components/Campground.jsx`)

The CRA file wraps each section (Favorites / Worthwhile / All Others) in an MUI Card with a header and collapse. Per section: badge with match count, "Hidden by settings" chip if applicable, view toggle (calendar/table), then the chosen view.

Replace with shadcn `Card` + `Accordion` (per-section expand). Carry the existing localStorage keys for expand state and view overrides. Commit.

---

## Section G: CampgroundsGroups (main grid)

### Task G1: Port CampgroundsGroups

**Files:**
- Create: `next/src/components/campgrounds-groups.tsx` (port of `src/components/CampgroundsGroups.jsx`)

The largest non-dialog component (~670 lines). Renders the campground accordions and the "show excluded" toggle wiring. Substitutions:

- MUI Accordion → shadcn `Accordion type="multiple"`. Preserve the sticky header behavior with Tailwind `sticky top-16 z-10 bg-background`.
- MUI Chip → shadcn `Badge`.
- MUI ToggleButtonGroup view mode → shadcn `Tabs` or `ToggleGroup`.
- MUI Tooltip → shadcn `Tooltip`.
- Image preview Dialog → shadcn `Dialog`.

Keep localStorage keys (`campgrounds-view-mode`, `campgrounds-expanded-groups`) so refreshes feel the same. Commit.

---

## Section H: App-level page + state

### Task H1: Image assets

**Files:**
- Copy: `public/images/sites/*` → `next/public/images/sites/`
- Copy: `public/images/logos/CampWatch_Logo_trimmed.png` → `next/public/images/logos/`
- Copy: `public/favicon.ico` → `next/public/favicon.ico` (overwrite the create-next-app default)

- [ ] **Step 1:** Use `cp -r` from repo root:

```bash
mkdir -p next/public/images
cp -r public/images/sites next/public/images/sites
cp -r public/images/logos next/public/images/logos
cp public/favicon.ico next/public/favicon.ico
```

- [ ] **Step 2:** Verify a sample image is accessible after `pnpm dev`:

```bash
cd next && pnpm dev &
sleep 6
curl -sI http://localhost:3000/images/sites/outlet_campground_map.jpg | head -2
kill %1
```

Expected: HTTP 200, content-type image/jpeg.

- [ ] **Step 3:** Commit:

```bash
git add next/public/
git commit -m "Copy campground images and logo into next/public/"
```

### Task H2: Hooks for hydration and data fetching

**Files:**
- Create: `next/src/hooks/use-config.ts`
- Create: `next/src/hooks/use-campgrounds-data.ts`
- Create: `next/src/hooks/use-global-settings.ts`
- Create: `next/src/hooks/use-color-mode.ts`

These extract the state logic from the existing CRA `App.js` into reusable hooks (with the same behavior; nothing fancier).

`useConfig`:
- localStorage keys: `campsites-react-user-sites`, `campsites-react-use-local-config`
- Hydration order: if useLocalConfig true → localStorage → defaults; else → GET /api/config → localStorage → defaults
- Save: setSiteConfig + write localStorage + optionally PUT /api/config (skipped if useLocalConfig)
- Return: `{ siteConfig, setSiteConfig, useLocalConfig, setUseLocalConfig, isHydrating, syncStatus, save, resetToDefaults }`

`useCampgroundsData(siteConfig, settings, useMockData)`:
- Calls `fetchCampgrounds()` whenever inputs change (and not during hydration).
- Returns `{ campgroundsData, campgroundsByAreas, isFetching, progressBarData, refresh }`.

`useGlobalSettings`:
- localStorage key: `campsites-react-global-settings`
- Returns `{ globalSettings, setGlobalSettings }`.

`useColorMode`: thin wrapper over `useTheme()` from next-themes that mirrors the CRA app's light/dark toggle UX.

Commit.

### Task H3: The `/app` page

**Files:**
- Create: `next/src/app/app/page.tsx`

Top-level client component (`"use client"`) that wires:
- `useGlobalSettings` → derives `settings` (the CRA `settings` object that merges global into the CRA defaults).
- `useConfig` → siteConfig hydration + save + reset + sync.
- `useCampgroundsData(siteConfig, settings, useMockData)` → fetched data.
- A `useState` for `useMockData`, `useLocalConfig` (the latter is owned by `useConfig`, expose its setter).

Renders:
- `<TopBar />` with the same menu items as today (Configure Sites / Refresh / Clear cache).
- `<ProgressBarEl />` while progress < 1.
- `<CampgroundsGroups />` with the grouped data.
- Footer with `<NotificationSubscribe />`, "Live Recreation.gov data" status, and color-mode toggle.
- `<SiteConfigDialog />` controlled by local `isOpen` state.

This file mirrors the existing `App.js` structure 1:1 — read it side-by-side. Commit.

### Task H4: Layout adjustments

**Files:**
- Modify: `next/src/app/layout.tsx`

The current root layout was set up in Phase 0a for the public hero. Per the spec, `/app` lives under a different layout segment so it doesn't inherit any landing-page chrome. Approach:

- Keep the root `layout.tsx` as the global shell (theme provider, Sonner, fonts).
- Create `next/src/app/app/layout.tsx` if needed for app-shell-specific concerns (currently none — leave to a later phase).

No commit needed if no changes.

### Task H5: SiteSettings + ProgressBar provider wrappers around `/app`

**Files:**
- Modify: `next/src/app/app/page.tsx`

Wrap the page contents in `<SiteSettings.Provider value={settings}>` and `<ProgressBar.Provider value={progressBarData}>` from Section B's context ports. Commit.

---

## Section I: Smoke verification

### Task I1: Local end-to-end check

- [ ] **Step 1:** `cd next && pnpm dev`. Open http://localhost:3000/app in a browser. Verify:
  - Top bar renders with logo, title, dropdown.
  - Campground cards render with the right images and badges.
  - Calendar shows availability for at least one campground (the easiest live check: Outlet for 2026-05-27, which has the lone-day availability we've been chasing all session — should appear as soft single when "All Others" is visible).
  - Configure Sites dialog opens, shows the right campgrounds, supports adding/removing/editing/reordering, save persists.
  - "Use my own settings" toggle gates the KV sync.
  - Refresh data button kicks off a new fetch and updates the progress bar.
  - Theme toggle in the footer flips light/dark.

If any of these is broken, fix it before continuing (use the existing CRA app at the repo root as the reference).

- [ ] **Step 2:** `pnpm test` → all green. `pnpm exec tsc --noEmit` clean. `pnpm run cf:build` clean.

### Task I2: Live verification (deployed Worker)

- [ ] **Step 1:** Push the branch:

```bash
git push -u origin feature/phase-0c-ui-port
```

- [ ] **Step 2:** Wait for CI:

```bash
gh run watch --exit-status
```

- [ ] **Step 3:** Open https://campwatch.mikeroberts421.workers.dev/app in a browser and run through the same checks as in Task I1.

- [ ] **Step 4:** Confirm production is untouched — open https://campsites-finder.mikeroberts421.workers.dev/ and verify the existing app still works.

No commit (verification only).

---

## Section J: PR

### Task J1: Open the PR

```bash
gh pr create --base main --head feature/phase-0c-ui-port \
    --title "Phase 0c: Port the campground dashboard UI to Next.js + shadcn" \
    --body "$(cat <<'EOF'
## Summary

Re-implementation of the campground dashboard at /app on the campwatch Worker. Feature parity with the existing CRA app — no new product behavior.

**Ported surfaces**
- TopBar, ProgressBar, NotificationSubscribe (sonner toasts replace MUI Snackbar)
- SiteConfigDialog (cards + list views, drag-drop via @dnd-kit, all per-campground fields)
- Campground card + Campsites table + Campsites calendar with custom day variants (react-day-picker)
- CampgroundsGroups main grid

**Data layer**
- recreation.gov client, KV cache, match aggregation, exclusion tracking, group formatting — all in TypeScript with unit tests on the pure-data helpers

**Substitutions**
- MUI → Tailwind + shadcn primitives (Card / Dialog / Accordion / Tabs / Switch / Slider / Tooltip / Skeleton / Badge / Table / Calendar / Popover)
- MUI X DatePicker → shadcn Popover + Calendar
- MUI Autocomplete → shadcn Combobox (Command + Popover)
- @mui/icons-material → lucide-react
- HTML5 drag-drop → @dnd-kit/sortable

## What's intentionally NOT in this PR

- Production cutover (Phase 0d)
- The UI-driven catalog rework (Phase 4 of the parent spec)
- Auth or per-user lists (Phases 1-2)

## Test plan

- [x] All Vitest tests pass on the data layer
- [x] tsc --noEmit clean
- [x] cf:build clean
- [x] Local /app renders the dashboard with parity to /
- [x] Live /app on the campwatch Worker renders the same
- [x] Old Worker still serves production traffic
EOF
)"
```

- [ ] **Step 2:** Hand off to the user.

---

## Self-review checklist

- [ ] Every CRA component listed in the "reference reading" section has a matching task.
- [ ] No `// TODO` or `tbd` left in any of the listed code samples (helper imports, schema definitions, prop signatures).
- [ ] All type and helper names that are introduced in earlier tasks are used by-name in later tasks (no rename drift).
- [ ] The plan never asks the implementer to re-derive logic that's already in `src/` — it always points them at the existing JS as the source of truth for behavior.
- [ ] Phase 0c does not touch the existing CRA `src/` tree, `workers-site/`, or `.github/workflows/deploy.yml`. The old app keeps shipping unchanged.
- [ ] At the end of Section I, both Workers coexist; only Phase 0d switches production over.
