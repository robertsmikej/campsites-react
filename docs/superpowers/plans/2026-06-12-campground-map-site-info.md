# Campground Site Map + Campsite Info Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a dashboard campground row opens a modal with a satellite map (one GPS pin per site) + a per-site info list/popover wired to real recreation.gov data.

**Architecture:** A new `site-details` API endpoint maps rec.gov campsite fields to a structured `SiteDetail[]`. A pure merge helper joins those with the dashboard's existing per-site availability and the user's favorites (by site number) into `MapSite[]`. A `CampgroundMapModal` (opened from a "Map & sites" control on `campground-timeline-row.tsx`) renders a client-only vanilla-Leaflet satellite map + Esri tiles + pins, an info list, and a popover. Mobile reflows to stacked cards.

**Tech Stack:** Next.js 16 / React 19, TypeScript, Cloudflare KV, **vanilla Leaflet** (client-only via `dynamic(..., { ssr:false })`; NOT react-leaflet — its peer deps are fragile on React 19), Esri World Imagery tiles, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-12-campground-map-site-info-design.md`
**Design source:** claude.ai/design `9afded9f-...`, `design_handoff_map_and_site_info/` (README + `Campground Map Modal.html` + variants). Source of truth for layout/color/type/interaction; **this plan's data adaptations overrule the design** (aggregate cell, no per-carrier; shade+amenities instead of water/restroom; satellite pins, no drawn loop).

**Repo rules (campwatch):** Commit to `main`; **NEVER push or deploy without Mike's explicit OK.** Worktree is clean. Stage only files your task touches. Gates before every commit: `cd next && npx tsc --noEmit && npx vitest run && npm run lint && npm run format:check` (prettier --write your files first; CI enforces Prettier).

**Conventions to MATCH (verify in the file you're editing, don't hardcode from this plan):**
- Field Notes tokens: dashboard components import a tokens module from `@/components/field-notes/...` (some files import `{ C }`, some `{ CW }`). **Use whatever the sibling file you're editing already imports.** Colors are also available as CSS vars (`var(--cw-forest)`, `--cw-clay`, `--cw-cream`, `--cw-ink`, `--cw-mustard`, `--cw-paper`, `--cw-ink-soft`, `--cw-ink-faint`, `--cw-rule`).
- Fonts: `font-poster` (Big Shoulders display), `font-mono-field` (DM Mono labels), `font-italic-serif` (Cormorant), `font-body-serif` (Source Serif).
- Dialog primitive: `@/components/ui/dialog` (`Dialog`/`DialogContent`), opened with `open` + `onOpenChange` — mirror `components/dashboard/add-campground-dialog/add-campground-dialog.tsx`.

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `next/src/lib/site-details.ts` (create) | `SiteDetail` type + `parseCampsite()` rec.gov→SiteDetail mapper | 1 |
| `next/src/lib/site-details.test.ts` (create) | mapper units | 1 |
| `next/src/app/api/campgrounds/[id]/site-details/route.ts` (create) | cached endpoint returning `SiteDetail[]` | 2 |
| `next/src/app/api/campgrounds/[id]/site-details/route.test.ts` (create) | route tests | 2 |
| `next/src/lib/map-sites.ts` (create) | `MapSite` type + `mergeMapSites()` (details + availability + favorites) | 3 |
| `next/src/lib/map-sites.test.ts` (create) | merge units | 3 |
| `next/src/components/dashboard/map-modal/site-info.tsx` (create) | StarRating, CellSignal, TypeBadge, SiteInfoChips, ListMarker | 4 |
| `next/src/components/dashboard/map-modal/site-info.test.tsx` (create) | info component units | 4 |
| `next/src/components/dashboard/map-modal/campground-map-modal.tsx` (create) | modal shell, header/footer, data fetch, state | 5 |
| `next/src/components/dashboard/timeline/campground-timeline-row.tsx` (modify) | "Map & sites" trigger + `onOpenMap` prop | 5 |
| `next/src/components/dashboard/timeline/availability-timeline.tsx` (modify) | modal open state + render `CampgroundMapModal` | 5 |
| `next/src/components/dashboard/map-modal/site-list.tsx` (create) | SiteList/SiteRow + SitePopover + hover state | 6 |
| `next/src/components/dashboard/map-modal/site-list.test.tsx` (create) | list/popover tests | 6 |
| `next/src/components/dashboard/map-modal/site-map.tsx` (create) | client-only vanilla-Leaflet map (Esri tiles + pins) | 7 |
| `next/src/components/dashboard/map-modal/map-summary.tsx` (create) | "At a glance" tiles + legend | 7 |
| `next/src/components/dashboard/map-modal/campground-map-modal.tsx` (modify) | wire map + list + summary + mobile | 7, 8 |
| `next/package.json` | `leaflet` + `@types/leaflet` deps | 7 |

---

### Task 1: SiteDetail type + rec.gov mapper

**Files:**
- Create: `next/src/lib/site-details.ts`
- Test: `next/src/lib/site-details.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `next/src/lib/site-details.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseCampsite, type SiteDetail } from "./site-details";

// Trimmed real shape from recreation.gov /api/search/campsites
const RAW = {
    campsite_id: "69072",
    name: "002",
    campsite_type: "STANDARD NONELECTRIC",
    latitude: 44.1437,
    longitude: -114.9114,
    average_rating: 3,
    number_of_ratings: 3,
    aggregate_cell_coverage: 2,
    permitted_equipment: [
        { equipment_name: "Tent", max_length: 35 },
        { equipment_name: "RV", max_length: 35 },
    ],
    attributes: [
        { attribute_category: "site_details", attribute_name: "Shade", attribute_value: "Full" },
        { attribute_category: "amenities", attribute_name: "Fire Pit", attribute_value: "Y" },
        { attribute_category: "amenities", attribute_name: "Picnic Table", attribute_value: "Y" },
        { attribute_category: "amenities", attribute_name: "Accessibility", attribute_value: "Y" },
        { attribute_category: "site_details", attribute_name: "Campfire Allowed", attribute_value: "Yes" },
    ],
};

describe("parseCampsite", () => {
    it("maps the core fields", () => {
        const s = parseCampsite(RAW) as SiteDetail;
        expect(s.id).toBe("002");
        expect(s.campsiteId).toBe("69072");
        expect(s.lat).toBeCloseTo(44.1437);
        expect(s.lng).toBeCloseTo(-114.9114);
        expect(s.rating).toBe(3);
        expect(s.reviews).toBe(3);
        expect(s.cell).toBe(2);
        expect(s.shade).toBe("full");
    });

    it("derives type rv with max length when RV equipment present", () => {
        const s = parseCampsite(RAW)!;
        expect(s.type).toBe("rv");
        expect(s.maxRvLength).toBe(35);
    });

    it("derives type tent when only tents permitted", () => {
        const s = parseCampsite({ ...RAW, permitted_equipment: [{ equipment_name: "Tent", max_length: 0 }] })!;
        expect(s.type).toBe("tent");
    });

    it("reads amenities from the attributes array", () => {
        const s = parseCampsite(RAW)!;
        expect(s.amenities).toMatchObject({ firePit: true, picnicTable: true, accessible: true, campfire: true });
    });

    it("tolerates missing rating / shade / coords without throwing", () => {
        const s = parseCampsite({ campsite_id: "1", name: "A-01", permitted_equipment: [], attributes: [] })!;
        expect(s.rating).toBeNull();
        expect(s.reviews).toBe(0);
        expect(s.cell).toBeNull();
        expect(s.shade).toBeUndefined();
        expect(s.lat).toBeNull();
        expect(s.type).toBe("other");
    });

    it("returns null for an entry with no name", () => {
        expect(parseCampsite({ campsite_id: "1" })).toBeNull();
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/lib/site-details.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `next/src/lib/site-details.ts`:

```ts
export interface SiteDetail {
    id: string; // site name/number, e.g. "002"
    campsiteId: string; // rec.gov campsite_id (booking link)
    lat: number | null;
    lng: number | null;
    type: "tent" | "rv" | "walkin" | "other";
    maxRvLength?: number;
    rating: number | null;
    reviews: number;
    cell: number | null; // aggregate 0–4 (NOT per-carrier — API only gives aggregate)
    shade?: "full" | "partial" | "sun";
    amenities: {
        firePit?: boolean;
        picnicTable?: boolean;
        accessible?: boolean;
        tentPad?: boolean;
        campfire?: boolean;
    };
}

interface RawAttr {
    attribute_category?: string;
    attribute_name?: string;
    attribute_value?: string | number;
}
interface RawEquip {
    equipment_name?: string;
    max_length?: number;
}
interface RawCampsite {
    campsite_id?: string;
    name?: string;
    campsite_type?: string;
    latitude?: number;
    longitude?: number;
    average_rating?: number;
    number_of_ratings?: number;
    aggregate_cell_coverage?: number;
    permitted_equipment?: RawEquip[];
    attributes?: RawAttr[];
}

const YES = new Set(["y", "yes", "true", "1"]);
const isYes = (v: unknown) => typeof v === "string" && YES.has(v.trim().toLowerCase());

function deriveType(equip: RawEquip[], campsiteType?: string): { type: SiteDetail["type"]; maxRvLength?: number } {
    const names = equip.map((e) => (e.equipment_name ?? "").toLowerCase());
    const ct = (campsiteType ?? "").toLowerCase();
    if (ct.includes("walk") || ct.includes("hike")) return { type: "walkin" };
    const rv = equip.find((e) => /rv|trailer/i.test(e.equipment_name ?? ""));
    if (rv) return { type: "rv", maxRvLength: rv.max_length || undefined };
    if (names.some((n) => n.includes("tent"))) return { type: "tent" };
    return { type: "other" };
}

function attr(attrs: RawAttr[], name: string): string | undefined {
    const a = attrs.find((x) => (x.attribute_name ?? "").toLowerCase() === name.toLowerCase());
    return a?.attribute_value != null ? String(a.attribute_value) : undefined;
}

/** Map one recreation.gov campsite object to a SiteDetail. Returns null if it has no name. */
export function parseCampsite(raw: unknown): SiteDetail | null {
    if (!raw || typeof raw !== "object") return null;
    const c = raw as RawCampsite;
    const name = (c.name ?? "").trim();
    if (!name) return null;

    const equip = Array.isArray(c.permitted_equipment) ? c.permitted_equipment : [];
    const attrs = Array.isArray(c.attributes) ? c.attributes : [];
    const { type, maxRvLength } = deriveType(equip, c.campsite_type);

    const shadeRaw = (attr(attrs, "Shade") ?? "").toLowerCase();
    const shade: SiteDetail["shade"] =
        shadeRaw.startsWith("full") ? "full" : shadeRaw.startsWith("part") ? "partial" : shadeRaw.includes("sun") ? "sun" : undefined;

    return {
        id: name,
        campsiteId: String(c.campsite_id ?? ""),
        lat: typeof c.latitude === "number" ? c.latitude : null,
        lng: typeof c.longitude === "number" ? c.longitude : null,
        type,
        ...(maxRvLength ? { maxRvLength } : {}),
        rating: typeof c.average_rating === "number" ? c.average_rating : null,
        reviews: typeof c.number_of_ratings === "number" ? c.number_of_ratings : 0,
        cell: typeof c.aggregate_cell_coverage === "number" ? c.aggregate_cell_coverage : null,
        ...(shade ? { shade } : {}),
        amenities: {
            firePit: isYes(attr(attrs, "Fire Pit")),
            picnicTable: isYes(attr(attrs, "Picnic Table")),
            accessible: isYes(attr(attrs, "Accessibility")),
            tentPad: isYes(attr(attrs, "Tent Pad")),
            campfire: isYes(attr(attrs, "Campfire Allowed")),
        },
    };
}
```

(Note `exactOptionalPropertyTypes` is on — that's why optional fields use conditional spreads rather than assigning `undefined`.)

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/lib/site-details.test.ts && npx tsc --noEmit`
Expected: 6 tests PASS, clean.

- [ ] **Step 5: Format + commit**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx prettier --write src/lib/site-details.ts src/lib/site-details.test.ts && npm run format:check
cd /Users/mikeroberts/Code/campwatch
git add next/src/lib/site-details.ts next/src/lib/site-details.test.ts
git commit -m "feat: recreation.gov campsite -> SiteDetail mapper"
```

---

### Task 2: site-details API endpoint

**Files:**
- Create: `next/src/app/api/campgrounds/[id]/site-details/route.ts`
- Test: `next/src/app/api/campgrounds/[id]/site-details/route.test.ts`

READ `next/src/app/api/campgrounds/[id]/sites/route.ts` first — mirror its structure exactly (id validation, KV cache get/put with `expirationTtl`, upstream fetch with `User-Agent`, `withErrorLogging`/`jsonResponse`/`withCors`). This route differs only in: cache key `site-details:{id}`, and it maps full objects via `parseCampsite` instead of extracting names.

- [ ] **Step 1: Write the failing tests**

Create `route.test.ts` (mirror the sibling sites route's mock idiom — `vi.mock("@/lib/cloudflare")`, mock `getKv`, mock `globalThis.fetch`):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/cloudflare", () => ({ getKv: vi.fn() }));
import { getKv } from "@/lib/cloudflare";

function mockKv(initial: Record<string, unknown> = {}) {
    const store = new Map(Object.entries(initial));
    return {
        get: vi.fn(async (k: string, _t?: string) => store.get(k) ?? null),
        put: vi.fn(async (k: string, v: string) => void store.set(k, JSON.parse(v))),
    };
}

async function doGet(id: string): Promise<Response> {
    const { GET } = await import("./route");
    return GET(new Request(`https://campwatch.dev/api/campgrounds/${id}/site-details`), {
        params: Promise.resolve({ id }),
    } as never);
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/campgrounds/[id]/site-details", () => {
    it("400s a non-numeric id", async () => {
        vi.mocked(getKv).mockReturnValue(mockKv() as never);
        expect((await doGet("abc")).status).toBe(400);
    });

    it("returns parsed sites from a fresh upstream fetch and caches them", async () => {
        const kv = mockKv();
        vi.mocked(getKv).mockReturnValue(kv as never);
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    campsites: [
                        { campsite_id: "1", name: "002", latitude: 44.1, longitude: -114.9, average_rating: 4, number_of_ratings: 2, aggregate_cell_coverage: 3, permitted_equipment: [{ equipment_name: "Tent", max_length: 0 }], attributes: [{ attribute_category: "site_details", attribute_name: "Shade", attribute_value: "Full" }] },
                    ],
                }),
                { status: 200 },
            ),
        );
        const res = await doGet("232358");
        expect(res.status).toBe(200);
        const body = (await res.json()) as { sites: Array<{ id: string; lat: number; shade?: string }> };
        expect(body.sites).toHaveLength(1);
        expect(body.sites[0]).toMatchObject({ id: "002", shade: "full" });
        expect(kv.put).toHaveBeenCalled(); // cached
    });

    it("serves from cache without fetching", async () => {
        const kv = mockKv({ "site-details:232358": [{ id: "002", campsiteId: "1", lat: null, lng: null, type: "tent", rating: null, reviews: 0, cell: null, amenities: {} }] });
        vi.mocked(getKv).mockReturnValue(kv as never);
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        const res = await doGet("232358");
        expect(res.status).toBe(200);
        expect(((await res.json()) as { sites: unknown[] }).sites).toHaveLength(1);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("returns empty sites (no cache write) when upstream fails", async () => {
        const kv = mockKv();
        vi.mocked(getKv).mockReturnValue(kv as never);
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
        const res = await doGet("232358");
        expect(res.status).toBe(200);
        expect(((await res.json()) as { sites: unknown[] }).sites).toEqual([]);
        expect(kv.put).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/app/api/campgrounds/[id]/site-details/route.test.ts`
Expected: FAIL — `./route` missing.

- [ ] **Step 3: Implement**

Create `route.ts` (adapt exactly from the sibling `sites/route.ts`):

```ts
import { getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { withErrorLogging } from "@/lib/route-helpers";
import { parseCampsite, type SiteDetail } from "@/lib/site-details";

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const cacheKey = (id: string) => `site-details:${id}`;

async function getHandler(_req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
    const { id } = await context.params;
    if (!/^\d+$/.test(id)) {
        return withCors(jsonResponse({ error: "Invalid campground id" }, 400));
    }

    const kv = getKv();
    const cached = (await kv.get(cacheKey(id), "json")) as SiteDetail[] | null;
    if (cached) return withCors(jsonResponse({ sites: cached }));

    const url = `https://www.recreation.gov/api/search/campsites?fq=asset_id%3A${id}&size=1000&include_non_site_specific_campsites=true`;
    let sites: SiteDetail[] = [];
    try {
        const r = await fetch(url, {
            headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (CampWatch)" },
        });
        if (r.ok) {
            const data = (await r.json()) as { campsites?: unknown[] };
            sites = (data.campsites ?? []).map(parseCampsite).filter((s): s is SiteDetail => s !== null);
        }
    } catch {
        // Network/parse failure → empty; the modal degrades to "site data unavailable".
    }

    if (sites.length > 0) {
        await kv.put(cacheKey(id), JSON.stringify(sites), { expirationTtl: CACHE_TTL_SECONDS });
    }
    return withCors(jsonResponse({ sites }));
}
export const GET = withErrorLogging(getHandler, "GET /api/campgrounds/[id]/site-details");
```

- [ ] **Step 4: Run + typecheck**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run "src/app/api/campgrounds/[id]/site-details/route.test.ts" && npx tsc --noEmit`
Expected: 4 PASS, clean.

- [ ] **Step 5: Format + commit**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx prettier --write "src/app/api/campgrounds/[id]/site-details/" && npm run format:check
cd /Users/mikeroberts/Code/campwatch
git add "next/src/app/api/campgrounds/[id]/site-details/"
git commit -m "feat: cached site-details endpoint (per-site rec.gov detail)"
```

---

### Task 3: MapSite merge helper

**Files:**
- Create: `next/src/lib/map-sites.ts`
- Test: `next/src/lib/map-sites.test.ts`

The modal needs one list per site combining: (a) `SiteDetail` (coords/rating/type/shade/cell/amenities), (b) availability (open + openCount) from the dashboard's `ProcessedCampground.siteAvailability`, (c) favorite/worthwhile from user config (`sites.favorites`/`sites.worthwhile`, which are site NAMES). Join on **normalized site name** (trim; the common key — availability has `siteName`, favorites are names, details have `id`=name).

- [ ] **Step 1: Write the failing tests**

Create `next/src/lib/map-sites.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mergeMapSites } from "./map-sites";
import type { SiteDetail } from "./site-details";

const details: SiteDetail[] = [
    { id: "002", campsiteId: "1", lat: 44.1, lng: -114.9, type: "tent", rating: 4, reviews: 2, cell: 3, shade: "full", amenities: {} },
    { id: "014", campsiteId: "2", lat: 44.2, lng: -114.8, type: "rv", rating: null, reviews: 0, cell: null, amenities: {} },
    { id: "020", campsiteId: "3", lat: null, lng: null, type: "other", rating: null, reviews: 0, cell: null, amenities: {} },
];

// availability keyed by siteId, each carries siteName + a count of open windows
const availability = {
    s1: { siteId: "s1", siteName: "002", matches: [{ from: "2026-07-04", to: "2026-07-06", nights: 2 }] },
    s2: { siteId: "s2", siteName: "014", matches: [] },
};

it("merges open state + favorite tier by site name", () => {
    const merged = mergeMapSites(details, availability as never, { favorites: ["014"], worthwhile: ["002"] });
    const byId = Object.fromEntries(merged.map((m) => [m.id, m]));
    expect(byId["002"].open).toBe(true);
    expect(byId["002"].openCount).toBe(1);
    expect(byId["002"].tier).toBe("worth");
    expect(byId["014"].open).toBe(false);
    expect(byId["014"].tier).toBe("fav");
    expect(byId["020"].tier).toBe("other");
    expect(byId["020"].open).toBe(false);
});

it("keeps a detail row even with no availability entry", () => {
    const merged = mergeMapSites(details, {} as never, { favorites: [], worthwhile: [] });
    expect(merged).toHaveLength(3);
    expect(merged.every((m) => m.open === false && m.openCount === 0)).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/lib/map-sites.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `next/src/lib/map-sites.ts`:

```ts
import type { SiteDetail } from "./site-details";

export interface MapSite extends SiteDetail {
    open: boolean;
    openCount: number;
    tier: "fav" | "worth" | "other";
}

interface AvailabilityLike {
    siteName?: string;
    matches?: unknown[];
}

const norm = (s: string) => s.trim();

/** Join site details + availability (by siteName) + favorites/worthwhile (names) into MapSite[]. */
export function mergeMapSites(
    details: SiteDetail[],
    availabilityById: Record<string, AvailabilityLike>,
    tiers: { favorites: string[]; worthwhile: string[] },
): MapSite[] {
    const openByName = new Map<string, number>();
    for (const a of Object.values(availabilityById ?? {})) {
        if (!a?.siteName) continue;
        openByName.set(norm(a.siteName), Array.isArray(a.matches) ? a.matches.length : 0);
    }
    const fav = new Set((tiers.favorites ?? []).map(norm));
    const worth = new Set((tiers.worthwhile ?? []).map(norm));

    return details.map((d) => {
        const key = norm(d.id);
        const openCount = openByName.get(key) ?? 0;
        const tier: MapSite["tier"] = fav.has(key) ? "fav" : worth.has(key) ? "worth" : "other";
        return { ...d, open: openCount > 0, openCount, tier };
    });
}
```

- [ ] **Step 4: Run + typecheck**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/lib/map-sites.test.ts && npx tsc --noEmit`
Expected: 2 PASS, clean.

- [ ] **Step 5: Format + commit**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx prettier --write src/lib/map-sites.ts src/lib/map-sites.test.ts && npm run format:check
cd /Users/mikeroberts/Code/campwatch
git add next/src/lib/map-sites.ts next/src/lib/map-sites.test.ts
git commit -m "feat: mergeMapSites — join detail + availability + favorites"
```

---

### Task 4: Site-info components

**Files:**
- Create: `next/src/components/dashboard/map-modal/site-info.tsx`
- Test: `next/src/components/dashboard/map-modal/site-info.test.tsx`

Mirror the design's `site-map-shared.jsx` visuals (StarRating partial-fill, CellSignal bars, TypeBadge). Use the Field Notes fonts/colors (match the import a sibling dashboard component uses for the tokens — verify before writing). These are presentational; props below are the contract.

- [ ] **Step 1: Write the failing tests**

Create `site-info.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StarRating, CellSignal, TypeBadge, ListMarker } from "./site-info";

afterEach(cleanup);

describe("StarRating", () => {
    it("shows the numeric value and review count", () => {
        render(<StarRating value={4} reviews={12} />);
        expect(screen.getByText(/4/)).toBeTruthy();
        expect(screen.getByText(/\(12\)/)).toBeTruthy();
    });
    it("renders nothing meaningful when no rating", () => {
        const { container } = render(<StarRating value={null} reviews={0} />);
        expect(container.textContent).toContain("No ratings");
    });
});

describe("CellSignal", () => {
    it("labels an aggregate level", () => {
        render(<CellSignal level={3} />);
        expect(screen.getByText(/Good/i)).toBeTruthy();
    });
    it("labels none for 0/null", () => {
        render(<CellSignal level={0} />);
        expect(screen.getByText(/None/i)).toBeTruthy();
    });
});

describe("TypeBadge", () => {
    it("shows RV with max length", () => {
        render(<TypeBadge type="rv" maxRvLength={35} />);
        expect(screen.getByText(/RV/)).toBeTruthy();
        expect(screen.getByText(/35/)).toBeTruthy();
    });
    it("shows Walk-in / Tent", () => {
        const { rerender } = render(<TypeBadge type="walkin" />);
        expect(screen.getByText(/Walk-in/i)).toBeTruthy();
        rerender(<TypeBadge type="tent" />);
        expect(screen.getByText(/Tent/i)).toBeTruthy();
    });
});

describe("ListMarker", () => {
    it("renders the site id and reflects open/favorite via data attrs", () => {
        render(<ListMarker id="A-07" open favorite selected={false} />);
        const el = screen.getByText("A-07");
        expect(el).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/components/dashboard/map-modal/site-info.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `site-info.tsx` (`"use client"` not required — presentational; but add it if the project marks leaf components client). Implement, matching the design's look (mustard stars over faint track; aggregate cell → bars + word; type icon + label). Bucket the aggregate cell: `>=3 → "Good"`, `>=1 → "Weak"`, else `"None"`. Component signatures (the test contract):

```tsx
export function StarRating({ value, reviews }: { value: number | null; reviews: number }): JSX.Element;
export function CellSignal({ level }: { level: number | null }): JSX.Element;
export function TypeBadge({ type, maxRvLength }: { type: "tent" | "rv" | "walkin" | "other"; maxRvLength?: number }): JSX.Element;
export function SiteInfoChips({ site }: { site: import("@/lib/map-sites").MapSite }): JSX.Element; // rating · type · shade · cell · amenities
export function ListMarker({ id, open, favorite, selected }: { id: string; open: boolean; favorite: boolean; selected: boolean }): JSX.Element;
```

`StarRating` with `value===null` renders the text "No ratings". `CellSignal` renders bars + the word. Keep markup simple and themed; the tests assert text presence, not exact styling. `SiteInfoChips` composes StarRating + TypeBadge + shade label + CellSignal + amenity glyphs (fire pit / accessible) — render `null`-safe (skip a chip when its datum is absent).

- [ ] **Step 4: Run + typecheck**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/components/dashboard/map-modal/site-info.test.tsx && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 5: Format + commit**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx prettier --write src/components/dashboard/map-modal/site-info.tsx src/components/dashboard/map-modal/site-info.test.tsx && npm run format:check
cd /Users/mikeroberts/Code/campwatch
git add next/src/components/dashboard/map-modal/site-info.tsx next/src/components/dashboard/map-modal/site-info.test.tsx
git commit -m "feat: site-info components (rating, cell, type, chips, marker)"
```

---

### Task 5: Modal shell + dashboard trigger

**Files:**
- Create: `next/src/components/dashboard/map-modal/campground-map-modal.tsx`
- Modify: `next/src/components/dashboard/timeline/campground-timeline-row.tsx`
- Modify: `next/src/components/dashboard/timeline/availability-timeline.tsx`

READ all three (or the two existing) first. `campground-timeline-row.tsx` already has a settings-gear control region in its header — add the trigger beside it. `availability-timeline.tsx` renders the rows and is the natural owner of modal state.

- [ ] **Step 1: Modal shell (no map/list yet)**

Create `campground-map-modal.tsx` (`"use client"`). Use the `Dialog`/`DialogContent` primitive (mirror `add-campground-dialog.tsx`). Props:

```tsx
import type { ProcessedCampground } from "@/types/campground";
export function CampgroundMapModal({
    campground,
    open,
    onClose,
}: {
    campground: ProcessedCampground | null;
    open: boolean;
    onClose: () => void;
}): JSX.Element | null;
```

On open with a non-null campground, fetch `/api/campgrounds/${campground.id}/site-details` (credentials include), `mergeMapSites` with `campground.siteAvailability` + `campground.sites`, store `MapSite[]` in state. Render header (kicker `§ Watchlist · Site map & details`, name in `font-poster`, location, meta row: status + "N of M sites bookable"), a body placeholder (`<div>` for now), and footer (Close ghost + "Recreation.gov →" forest solid linking `https://www.recreation.gov/camping/campgrounds/${campground.id}`). Loading + empty (`sites.length === 0` → "Site details unavailable") states. Match the modal shell styling from `Configure Campgrounds Modal` (paper bg, offset shadow) — reuse the same classes site-config-dialog uses.

- [ ] **Step 2: Trigger on the row**

In `campground-timeline-row.tsx`: add prop `onOpenMap?: (campgroundId: string) => void`. Add a "Map & sites" control in the header control region (next to the gear) — a small button, `font-mono-field` uppercase label or a map-pin icon, `onClick` calls `e.stopPropagation()` then `onOpenMap?.(campground.id)` (stopPropagation so it doesn't also toggle the row expand). Only render when `campground.id` is set.

In `availability-timeline.tsx`: add `const [mapCgId, setMapCgId] = useState<string | null>(null);`, pass `onOpenMap={setMapCgId}` to each row, and render once:

```tsx
<CampgroundMapModal
    campground={rows.find((c) => c.id === mapCgId) ?? null}
    open={mapCgId !== null}
    onClose={() => setMapCgId(null)}
/>
```

(use the actual prop/var name the timeline uses for its campground array; `rows`/`campgrounds` — verify.)

- [ ] **Step 3: Verify (no new test harness for the timeline change beyond existing)**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx tsc --noEmit && npx vitest run && npm run lint && npm run format:check`
Expected: all green; existing `timeline.test.tsx` still passes (the new prop is optional). If timeline.test renders rows, optionally assert the Map control exists.

- [ ] **Step 4: Commit**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx prettier --write src/components/dashboard/map-modal/campground-map-modal.tsx src/components/dashboard/timeline/campground-timeline-row.tsx src/components/dashboard/timeline/availability-timeline.tsx
cd /Users/mikeroberts/Code/campwatch
git add next/src/components/dashboard/map-modal/campground-map-modal.tsx next/src/components/dashboard/timeline/campground-timeline-row.tsx next/src/components/dashboard/timeline/availability-timeline.tsx
git commit -m "feat: campground map modal shell + dashboard trigger"
```

---

### Task 6: Site list + popover

**Files:**
- Create: `next/src/components/dashboard/map-modal/site-list.tsx`
- Test: `next/src/components/dashboard/map-modal/site-list.test.tsx`
- Modify: `next/src/components/dashboard/map-modal/campground-map-modal.tsx` (render the list in the body)

- [ ] **Step 1: Write failing tests**

Create `site-list.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SiteList } from "./site-list";
import type { MapSite } from "@/lib/map-sites";

afterEach(cleanup);

const sites: MapSite[] = [
    { id: "A-07", campsiteId: "1", lat: 44.1, lng: -114.9, type: "tent", rating: 4, reviews: 3, cell: 3, amenities: {}, open: true, openCount: 5, tier: "fav" },
    { id: "B-23", campsiteId: "2", lat: 44.2, lng: -114.8, type: "rv", maxRvLength: 35, rating: null, reviews: 0, cell: 1, amenities: {}, open: false, openCount: 0, tier: "worth" },
];

it("renders a row per site with the header count", () => {
    render(<SiteList sites={sites} selectedId={null} hoveredId={null} onSelect={() => {}} onHover={() => {}} />);
    expect(screen.getByText("A-07")).toBeTruthy();
    expect(screen.getByText("B-23")).toBeTruthy();
    expect(screen.getByText(/2 .*sites/i)).toBeTruthy();
});

it("shows Book only for open sites", () => {
    render(<SiteList sites={sites} selectedId={null} hoveredId={null} onSelect={() => {}} onHover={() => {}} />);
    const books = screen.getAllByText(/Book/i);
    expect(books).toHaveLength(1); // only A-07 is open
});

it("fires onSelect when a row is clicked", () => {
    const onSelect = vi.fn();
    render(<SiteList sites={sites} selectedId={null} hoveredId={null} onSelect={onSelect} onHover={() => {}} />);
    fireEvent.click(screen.getByText("A-07"));
    expect(onSelect).toHaveBeenCalledWith("A-07");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/components/dashboard/map-modal/site-list.test.tsx`
Expected: FAIL — missing module.

- [ ] **Step 3: Implement**

Create `site-list.tsx` exporting `SiteList` and `SitePopover`:

```tsx
export function SiteList(props: {
    sites: import("@/lib/map-sites").MapSite[];
    selectedId: string | null;
    hoveredId: string | null;
    onSelect: (id: string) => void;
    onHover: (id: string | null) => void;
}): JSX.Element;

export function SitePopover(props: {
    site: import("@/lib/map-sites").MapSite;
    campgroundId: string;
    onClose: () => void;
}): JSX.Element;
```

`SiteList`: header `"{open} of {total} sites · {open} open"` (use the count text the test greps — include "sites"); one `SiteRow` per site = `ListMarker` + id + `TypeBadge` + `SiteInfoChips` + right side (open count + "Book →" link to `https://www.recreation.gov/camping/campsites/${campsiteId}` when `open`, else "Watching"/"Booked"). Favorite rows tint clay, others forest; active (`selectedId`) and hovered rows highlight; row `onClick`→`onSelect(id)`, `onMouseEnter`→`onHover(id)`, `onMouseLeave`→`onHover(null)`. `SitePopover`: 248px cream card, `5px 5px 0 forest`; site id + star + type; StarRating; amenity grid (shade / cell / fire pit / accessible / max RV); "Book on recreation.gov →" if open else "Booked — watching".

Then in `campground-map-modal.tsx` render `<SiteList .../>` in the right column of the body, wired to `selectedSiteId`/`hoveredSiteId` state.

- [ ] **Step 4: Run + full verify**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/components/dashboard/map-modal/site-list.test.tsx && npx tsc --noEmit && npx vitest run && npm run lint && npm run format:check`
Expected: PASS, all green.

- [ ] **Step 5: Commit**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx prettier --write src/components/dashboard/map-modal/site-list.tsx src/components/dashboard/map-modal/site-list.test.tsx src/components/dashboard/map-modal/campground-map-modal.tsx
cd /Users/mikeroberts/Code/campwatch
git add next/src/components/dashboard/map-modal/
git commit -m "feat: site list + popover in the map modal"
```

---

### Task 7: Live satellite map + pins + summary

**Files:**
- Modify: `next/package.json` (deps)
- Create: `next/src/components/dashboard/map-modal/site-map.tsx` (client-only vanilla Leaflet)
- Create: `next/src/components/dashboard/map-modal/map-summary.tsx`
- Modify: `next/src/components/dashboard/map-modal/campground-map-modal.tsx` (left column = map + summary, dynamic import)

- [ ] **Step 1: Add Leaflet**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npm install leaflet && npm install -D @types/leaflet
```

(Vanilla Leaflet only — no react-leaflet.)

- [ ] **Step 2: Map summary (cheap, testable)**

Create `map-summary.tsx` — `MapSummary({ sites }: { sites: MapSite[] })`: three hairline tiles — Sites open (`{open}/{total}`, forest), Favorites (count of `tier==='fav'`, clay, ★), Avg rating (mean of non-null ratings, mustard, ★). Big Shoulders number + mono label each. Pure/presentational.

- [ ] **Step 3: The Leaflet map component (client-only)**

Create `site-map.tsx` with `"use client"`. Vanilla Leaflet, imperative in `useEffect`:

```tsx
"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapSite } from "@/lib/map-sites";

const ESRI_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTR = "Imagery © Esri, Maxar, Earthstar Geographics";

export function SiteMap({
    sites,
    selectedId,
    hoveredId,
    onSelect,
    onHover,
}: {
    sites: MapSite[];
    selectedId: string | null;
    hoveredId: string | null;
    onSelect: (id: string | null) => void;
    onHover: (id: string | null) => void;
}) {
    const elRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const markersRef = useRef<Map<string, L.Marker>>(new Map());

    // init once
    useEffect(() => {
        if (!elRef.current || mapRef.current) return;
        const withCoords = sites.filter((s) => s.lat != null && s.lng != null);
        const center: [number, number] = withCoords.length
            ? [
                  withCoords.reduce((a, s) => a + (s.lat as number), 0) / withCoords.length,
                  withCoords.reduce((a, s) => a + (s.lng as number), 0) / withCoords.length,
              ]
            : [44.14, -114.91];
        const map = L.map(elRef.current, { attributionControl: true, scrollWheelZoom: true }).setView(center, 16);
        L.tileLayer(ESRI_URL, { attribution: ESRI_ATTR, maxZoom: 19 }).addTo(map);
        map.on("click", () => onSelect(null));
        mapRef.current = map;
        // fit to pins
        if (withCoords.length > 1) {
            map.fitBounds(L.latLngBounds(withCoords.map((s) => [s.lat as number, s.lng as number])).pad(0.3));
        }
        return () => {
            map.remove();
            mapRef.current = null;
            markersRef.current.clear();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // (re)draw markers when sites/selection/hover change
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        markersRef.current.forEach((m) => m.remove());
        markersRef.current.clear();
        for (const s of sites) {
            if (s.lat == null || s.lng == null) continue;
            const isSel = s.id === selectedId;
            const isFav = s.tier === "fav";
            const html = `<div class="cw-pin ${s.open ? "open" : "booked"} ${isFav ? "fav" : ""} ${isSel ? "sel" : ""}">${isFav ? "★" : ""}<span>${s.id}</span></div>`;
            const icon = L.divIcon({ html, className: "cw-pin-wrap", iconSize: [34, 34], iconAnchor: [17, 34] });
            const marker = L.marker([s.lat, s.lng], { icon }).addTo(map);
            marker.on("click", () => onSelect(s.id));
            marker.on("mouseover", () => onHover(s.id));
            marker.on("mouseout", () => onHover(null));
            markersRef.current.set(s.id, marker);
        }
    }, [sites, selectedId, hoveredId, onSelect, onHover]);

    return <div ref={elRef} style={{ width: "100%", height: "100%", minHeight: 430 }} />;
}
```

Add `.cw-pin` styles (teardrop, forest fill when `.open`, cream+outline when `.booked`, clay star badge when `.fav`, clay ring when `.sel`, scale 1.12 on hover) — put them in a co-located `<style>` injected once, or append to `globals.css` under a `/* map pins */` block using the `--cw-*` vars. Legibility scrim gradient over the map container per the design.

- [ ] **Step 4: Wire into the modal via dynamic import (ssr:false)**

In `campground-map-modal.tsx`:

```tsx
import dynamic from "next/dynamic";
const SiteMap = dynamic(() => import("./site-map").then((m) => m.SiteMap), {
    ssr: false,
    loading: () => <div style={{ minHeight: 430 }} aria-label="Loading map" />,
});
```

Left body column = `<SiteMap .../>` (sharing the same `selectedSiteId`/`hoveredSiteId` state as the list) + legend (● Open / ○ Booked / ★ Favorite) + `<MapSummary sites={sites} />`. When `selectedSiteId` is set, render `<SitePopover>` for that site. Right column = the `SiteList` from Task 6.

- [ ] **Step 5: Verify**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx tsc --noEmit && npx vitest run && npm run lint && npm run format:check`
Expected: all green. (The map itself isn't unit-tested — jsdom has no Leaflet canvas; the `ssr:false` dynamic boundary keeps it out of the test render. If a test imports the modal and the map errors in jsdom, confirm the dynamic import keeps `SiteMap` from loading in the test environment; if needed, the modal test asserts the loading placeholder.)

Run a real build to catch SSR issues the unit tests can't:
Run: `cd /Users/mikeroberts/Code/campwatch/next && npm run build`
Expected: build completes; no "window is not defined" from Leaflet (the `ssr:false` dynamic import prevents server evaluation).

- [ ] **Step 6: Commit**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx prettier --write src/components/dashboard/map-modal/ src/app/globals.css
cd /Users/mikeroberts/Code/campwatch
git add next/package.json next/package-lock.json next/src/components/dashboard/map-modal/ next/src/app/globals.css
git commit -m "feat: live satellite site map (Leaflet + Esri) + at-a-glance summary"
```

---

### Task 8: Mobile reflow

**Files:**
- Modify: `next/src/components/dashboard/map-modal/campground-map-modal.tsx`
- Possibly: `site-list.tsx` (stacked card variant)

- [ ] **Step 1: Implement responsive layout**

Below ~640px: the modal body switches from the 2-col grid (`520px 1fr`) to a single column — compact header → full-width map (~280px) → stacked site cards (the design's `MobileSiteCard`: marker + id + type + open count, then rating + wrapped chips + full-width "Book on recreation.gov →" when open). Use the project's responsive idiom (the codebase has `use-is-mobile`; check how other dashboard components branch — e.g. `mobile-timeline.tsx`). Reuse `SiteInfoChips`/markers; don't fork data logic.

- [ ] **Step 2: Verify + commit**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx tsc --noEmit && npx vitest run && npm run lint && npm run format:check`

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx prettier --write src/components/dashboard/map-modal/
cd /Users/mikeroberts/Code/campwatch
git add next/src/components/dashboard/map-modal/
git commit -m "feat: mobile reflow for the campground map modal"
```

---

### Task 9: Full verification + gated rollout

- [ ] **Step 1: Full check + build**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx tsc --noEmit && npx vitest run && npm run lint && npm run format:check && npm run build
cd /Users/mikeroberts/Code/campwatch/notifier && npx tsc --noEmit
```

Expected: all green; build succeeds (the Leaflet `ssr:false` boundary is the one real SSR risk — the build is the gate).

- [ ] **Step 2: STOP — deploy needs Mike's OK, and this one has new external surface**

Flag at handoff:
- **New npm deps** (`leaflet`, `@types/leaflet`) — bundle size + a new client dependency.
- **Esri World Imagery tiles** fetched at view-time — the first runtime third-party tile call in the app. Free tier is generous and personal-scale use is well within Esri's terms, but confirm before deploy.
- next-app-only change → `git push` deploys it; no worker deploy needed.
After approval: `git push`, watch CI.

---

## Self-review notes

- **Spec coverage:** endpoint (T2) + mapper (T1) + merge (T3); info components (T4); modal shell + dashboard trigger (T5); site list + popover (T6); satellite map + pins + summary + legend (T7); mobile (T8); verification + gated deploy (T9). Architecture (click row → modal), favorites-as-source-of-truth, and all three data adaptations (aggregate cell, drop water/restroom, no drawn loop) are encoded.
- **Type consistency:** `SiteDetail` (T1) → consumed by `parseCampsite`/route (T2) and `mergeMapSites` (T3) → `MapSite` (T3) flows into info components (T4), list/popover (T6), map (T7), summary (T7). Join key = normalized site name throughout.
- **Library decision** (vanilla Leaflet, client-only dynamic) deviates from the spec's "Leaflet + react-leaflet" wording — deliberate, for React 19 peer-dep safety; same library, same visual result. Noted in Tech Stack.
- **Known soft spots flagged for implementers:** token import module varies by file (match the sibling); the timeline's campground-array prop name must be verified; the modal-with-map test must keep `SiteMap` behind the `ssr:false` boundary so jsdom never evaluates Leaflet. The `npm run build` step in T7/T9 is the real SSR gate.
