# Phase 4: UI-Driven Catalog Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adding a campground stops requiring code edits. Inside Configure Sites, a single input accepts a recreation.gov URL or ID; the app fetches the facility's metadata server-side (with KV caching), shows an editable preview, and one click adds it to the user's watchlist (or to the curated default when curators edit it from `/app/admin`). Every campground card in the dialog becomes fully editable — no more "custom-only" fields hidden from catalog entries. The static `campgroundCatalog.js` and `siteConfigurations.js` files become a one-time seed for an empty KV, nothing more.

This is the phase that fixes the original pain point that started this whole rebuild.

**Non-goals:**
- Migrating users currently in the system. The static files were already merged into KV; users hitting `/api/users/me/campgrounds/clone-default` get whatever KV has.
- Image upload to R2 (per the original brainstorm decision). New campgrounds either auto-pull a hero image URL from rec.gov's media or get the default gradient.
- Bulk-import or paste-many-URLs UX.
- Notifier rewire — that's Phase 5.

**Architecture:**

```
User in /app or /app/admin (curator)
        |
        ▼
+-----------------------------------------+
|  Configure Sites dialog                  |
|  Add panel: paste rec.gov URL or ID      |
|     [ Fetch ] → preview card             |
|     edit name/area/type/description      |
|     [ Add ] → appends to the list        |
|  Per-card editor: every field editable   |
|     (no more isCustom gate)              |
+-----------------------------------------+
        |
        ▼ GET /api/recgov/facility/:id
+-----------------------------------------+
|  Worker route handler                    |
|  1. Validate ID (digits only)            |
|  2. Check KV cache (recgov:facility:<id>)|
|  3. If miss, fetch                       |
|     https://www.recreation.gov/api/      |
|     camps/campgrounds/:id                |
|  4. Map response to a small shape:       |
|     { id, name, area, type, description, |
|       imageUrl }                         |
|  5. Cache with 24h TTL                   |
|  6. Return JSON                          |
+-----------------------------------------+
```

**Tech Stack:** No new technology. Same Next.js + Cloudflare Workers + KV. New Route Handler, new dialog sub-component, type tweaks.

**Pre-conditions:** Phase 3 merged. The dialog already has multiple modes (user's list vs. default list — both routed through `onSave`).

---

## Pre-flight

### Task 0: Branch + state check

- [ ] **Step 1: Branch from main**

```bash
cd "/Users/mikeroberts/Library/Mobile Documents/com~apple~CloudDocs/Desktop/Websites/campsites-react"
git checkout main && git pull --ff-only
git checkout -b feature/phase-4-ui-driven-catalog
git status -s
```

- [ ] **Step 2: Confirm `next/` is green**

```bash
cd next && pnpm install --frozen-lockfile && pnpm test 2>&1 | tail -3 && pnpm exec tsc --noEmit && pnpm run cf:build 2>&1 | tail -3
```

Expected: 189 tests pass, tsc clean, cf:build complete.

---

## Section A: rec.gov facility proxy

### Task A1: URL/ID parser + rec.gov client (pure functions)

**Files:**
- Create: `next/src/lib/recgov-facility.ts`
- Test: `next/src/lib/recgov-facility.test.ts`

**Exports:**

```ts
export interface FacilitySummary {
    id: string;
    name: string;
    area?: string;
    type: "campground" | "cabin" | "lookout";
    description?: string;
    imageUrl?: string;
}

// Returns the facility ID extracted from a URL, a bare ID, or null if invalid.
export function parseFacilityId(input: string): string | null;

// Fetches rec.gov directly (no caching here — caching lives in the route handler).
// Returns null when the API returns 4xx; throws on network errors so the caller
// can log them.
export async function fetchFacilitySummary(id: string): Promise<FacilitySummary | null>;
```

**`parseFacilityId` behavior:**
- `"232358"` → `"232358"`
- `"   232358 \n"` → `"232358"` (trim)
- `"https://www.recreation.gov/camping/campgrounds/232358"` → `"232358"`
- `"https://www.recreation.gov/camping/campgrounds/232358?some=query"` → `"232358"`
- `"https://www.recreation.gov/camping/campgrounds/232358/availability"` → `"232358"` (path continues but the digit run is what we want)
- `"abc"` → `null`
- `"https://example.com/something"` → `null`
- `"232358extra"` → `null` (the digit run isn't alone)

Implementation:

```ts
export function parseFacilityId(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // Bare integer ID.
    if (/^\d+$/.test(trimmed)) return trimmed;

    // Try a rec.gov URL.
    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        return null;
    }
    if (!url.hostname.endsWith("recreation.gov")) return null;
    const match = url.pathname.match(/\/campgrounds\/(\d+)(?:\/|$)/);
    return match ? match[1] : null;
}
```

**`fetchFacilitySummary` behavior:**
- Calls `https://www.recreation.gov/api/camps/campgrounds/<id>`.
- Returns `null` if rec.gov returns a non-2xx (and logs the status). Throws on a network error (caller catches).
- Maps the response:
  - `id` ← path-extracted (or the input id)
  - `name` ← title-case-ish cleanup of `campground.facility_name`. Cleanup rule: keep the first cluster of letters/numbers/spaces, drop parenthetical state suffixes like `"OUTLET CAMPGROUND (ID)"` → `"Outlet Campground"`. Use `toLocaleLowerCase()` then capitalize each word.
  - `area` ← `campground.addresses[0].city` title-cased; null if absent.
  - `type` — heuristic from `facility_name`:
    - includes `"LOOKOUT"` or `"FIRE LOOKOUT"` → `"lookout"`
    - includes `"CABIN"` → `"cabin"`
    - otherwise → `"campground"`
  - `description` ← first non-empty value from `campground.facility_description_map.Overview` or `campground.facility_description_map.Description` (strip HTML tags with a simple regex, trim to ~300 chars).
  - `imageUrl` ← first item in `campground.media` whose `media_type === "Image"` and `url` starts with `https://`. If absent, omit.

Implementation:

```ts
function cleanFacilityName(raw: string): string {
    if (!raw) return "";
    // Drop trailing parenthetical state suffix like "(ID)" or "(MT)".
    const withoutSuffix = raw.replace(/\s*\([^)]+\)\s*$/, "").trim();
    // Title-case word-by-word.
    return withoutSuffix
        .toLocaleLowerCase()
        .split(/\s+/)
        .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
        .join(" ");
}

function inferType(rawName: string): "campground" | "cabin" | "lookout" {
    const upper = rawName.toUpperCase();
    if (upper.includes("LOOKOUT")) return "lookout";
    if (upper.includes("CABIN")) return "cabin";
    return "campground";
}

function stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

interface RecGovResponse {
    campground?: {
        facility_id?: string;
        facility_name?: string;
        addresses?: Array<{ city?: string; state_code?: string }>;
        facility_description_map?: Record<string, string>;
        media?: Array<{ media_type?: string; url?: string }>;
    };
}

export async function fetchFacilitySummary(id: string): Promise<FacilitySummary | null> {
    const response = await fetch(
        `https://www.recreation.gov/api/camps/campgrounds/${encodeURIComponent(id)}`,
        { headers: { Accept: "application/json" } },
    );
    if (!response.ok) {
        console.warn(`[recgov] facility ${id} returned ${response.status}`);
        return null;
    }
    const data = (await response.json()) as RecGovResponse;
    const cg = data?.campground;
    if (!cg?.facility_name) return null;

    const summary: FacilitySummary = {
        id,
        name: cleanFacilityName(cg.facility_name),
        type: inferType(cg.facility_name),
    };

    const city = cg.addresses?.[0]?.city;
    if (city) summary.area = cleanFacilityName(city);

    const descRaw =
        cg.facility_description_map?.Overview ||
        cg.facility_description_map?.Description ||
        "";
    if (descRaw) {
        const cleaned = stripHtml(descRaw);
        summary.description = cleaned.slice(0, 300).trim();
    }

    const image = cg.media?.find(
        (m) => m.media_type === "Image" && typeof m.url === "string" && m.url.startsWith("https://"),
    );
    if (image?.url) summary.imageUrl = image.url;

    return summary;
}
```

**Tests (`recgov-facility.test.ts`):**

Cover `parseFacilityId` for all the input shapes listed above. For `fetchFacilitySummary`, use `vi.stubGlobal("fetch", vi.fn())` to mock fetch. Verify:
- 200 with a `campground` object → returns the mapped shape.
- 200 with missing `facility_name` → returns `null`.
- 404 → returns `null` (no throw).
- A response with HTML-tagged `Overview` → description has tags stripped.
- Lookout/Cabin/Campground type inference covers the three keyword cases.

Run tests, expect ~12 passing.

Commit:
```
git add next/src/lib/recgov-facility.ts next/src/lib/recgov-facility.test.ts
git commit -m "Add rec.gov facility URL/ID parser and summary fetcher"
```

### Task A2: GET /api/recgov/facility/[id] with KV cache

**Files:**
- Create: `next/src/app/api/recgov/facility/[id]/route.ts`
- Test: `next/src/app/api/recgov/facility/[id]/route.test.ts`

Behavior:
- 401 if no session.
- 400 if the `[id]` path param isn't a digit string. Also accept the URL form: `?url=<encoded-recreation.gov-URL>` — but priority is the path param.
- Cache key: `recgov:facility:<id>`. Cache TTL: 24h (`expirationTtl: 60*60*24` in the KV put).
- On cache hit, return `{ summary, cached: true }`.
- On cache miss, call `fetchFacilitySummary(id)`. If null → 404 with `{ error: "Facility not found" }`. Otherwise cache + return `{ summary, cached: false }`.

Implementation:

```ts
import { readSession } from "@/lib/sessions";
import { getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { fetchFacilitySummary, parseFacilityId, type FacilitySummary } from "@/lib/recgov-facility";

const CACHE_PREFIX = "recgov:facility:";
const CACHE_TTL_SECONDS = 60 * 60 * 24;

export async function GET(
    request: Request,
    context: { params: Promise<{ id: string }> },
): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    const { id: rawId } = await context.params;
    const parsed = parseFacilityId(decodeURIComponent(rawId));
    if (!parsed) {
        return withCors(jsonResponse({ error: "Invalid facility ID" }, 400));
    }

    const kv = getKv();
    const cacheKey = `${CACHE_PREFIX}${parsed}`;
    const cached = (await kv.get(cacheKey, "json")) as FacilitySummary | null;
    if (cached) {
        return withCors(jsonResponse({ summary: cached, cached: true }));
    }

    let summary: FacilitySummary | null;
    try {
        summary = await fetchFacilitySummary(parsed);
    } catch (e) {
        console.error("[recgov] fetch error:", e);
        return withCors(jsonResponse({ error: "Facility lookup failed" }, 502));
    }
    if (!summary) {
        return withCors(jsonResponse({ error: "Facility not found" }, 404));
    }

    await kv.put(cacheKey, JSON.stringify(summary), { expirationTtl: CACHE_TTL_SECONDS });
    return withCors(jsonResponse({ summary, cached: false }));
}
```

**Tests:**

- 401 unauth.
- 400 with an invalid ID path param ("abc").
- 404 when `fetchFacilitySummary` returns null.
- 200 + `cached: false` on cache miss, then cache populated.
- 200 + `cached: true` on the second request after the first populated the cache.
- 502 if `fetchFacilitySummary` throws.

Mock `vi.mock("@/lib/recgov-facility", () => ({ fetchFacilitySummary: vi.fn(), parseFacilityId: vi.fn() }))` plus mock `@/lib/sessions` and `@/lib/cloudflare`.

Commit:
```
git add next/src/app/api/recgov/facility/
git commit -m "Add GET /api/recgov/facility/[id] with 24h KV cache"
```

---

## Section B: Dialog rework

### Task B1: Replace the catalog dropdown with the rec.gov-fetch flow

**Files:**
- Modify: `next/src/components/site-config-dialog/add-campground.tsx`

The current `<AddCampground />` is a `<Select>` of catalog options + a `Custom / Not listed` choice + an Add button. Replace with:

```
+----------------------------------------------------+
| Recreation.gov URL or ID                            |
| [_____________________________________] [Fetch]   |
+----------------------------------------------------+
| Preview (populated after Fetch)                     |
|   Name:        [ Outlet Campground            ]    |
|   Area:        [ Stanley                       ]    |
|   Type:        [ Campground v ] (select)           |
|   Description: [ ...                           ]    |
|   Image URL:   [ https://...                   ]    |
|                                                     |
|   Default dates: [ 2026-06-01 ] - [ 2026-09-30 ]   |
|                                          [ Add ]   |
+----------------------------------------------------+
```

Behavior:
- Single text input + `Fetch` button. Disable Fetch when the input is empty or `parseFacilityId` returns null. The validation can run client-side using the same `parseFacilityId` from `@/lib/recgov-facility` — it's a pure function, safe to import in a Client Component.
- On Fetch: `GET /api/recgov/facility/<id>`. Show a loading spinner on the button. On success, populate the preview fields. On error, toast with the message.
- Preview fields are editable (controlled inputs). User can correct name, area, description, image URL. Type is a `<Select>` with `Campground`, `Cabin`, `Lookout`.
- Two date pickers (use shadcn `Popover` + `Calendar`) for default startDate/endDate. Default values: today's date + ~3 months out.
- Add button: builds a new `Campground` object from the preview, calls `onAdd(campground)`, clears the preview, focuses the URL input again so multiple adds are quick.
- A small "Clear" / "Cancel" link to dismiss the preview without adding.

Note on the existing prop signature: today the component takes `{ catalogOptions, selectedCatalogIds, onAdd }` where `onAdd(catalogId: string)`. The new signature is `{ existingIds, onAdd }` where `onAdd(campground: Campground)` and `existingIds: Set<string>` is used to show a friendly "Already in your list" message if the user fetches an ID they've already added.

Implementation (Client Component):

```tsx
"use client";

import { useState } from "react";
import { Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { parseFacilityId, type FacilitySummary } from "@/lib/recgov-facility";
import type { Campground, CampgroundType } from "@/types/campground";

interface AddCampgroundProps {
    existingIds: Set<string>;
    onAdd: (campground: Campground) => void;
}

const TYPE_OPTIONS: CampgroundType[] = ["campground", "cabin", "lookout"];

function defaultDates(): { startDate: string; endDate: string } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 4, 0);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return { startDate: fmt(start), endDate: fmt(end) };
}

export function AddCampground({ existingIds, onAdd }: AddCampgroundProps) {
    const [input, setInput] = useState("");
    const [fetching, setFetching] = useState(false);
    const [preview, setPreview] = useState<FacilitySummary | null>(null);
    const [dates, setDates] = useState(defaultDates);

    const parsed = parseFacilityId(input);
    const canFetch = parsed !== null;

    async function handleFetch() {
        if (!parsed) return;
        if (existingIds.has(parsed)) {
            toast.info("That campground is already in your list");
            return;
        }
        setFetching(true);
        try {
            const r = await fetch(
                `/api/recgov/facility/${encodeURIComponent(parsed)}`,
                { credentials: "include" },
            );
            if (!r.ok) {
                const body = (await r.json().catch(() => ({}))) as { error?: string };
                toast.error(body.error ?? `Lookup failed (${r.status})`);
                return;
            }
            const data = (await r.json()) as { summary: FacilitySummary };
            setPreview(data.summary);
            setDates(defaultDates());
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Lookup failed");
        } finally {
            setFetching(false);
        }
    }

    function handleAdd() {
        if (!preview) return;
        const campground: Campground = {
            id: preview.id,
            name: preview.name.trim(),
            area: preview.area?.trim() || undefined,
            site: "recreation.gov",
            type: preview.type,
            description: preview.description?.trim() || undefined,
            image: preview.imageUrl || "",
            dates: { startDate: dates.startDate, endDate: dates.endDate },
            sites: { favorites: [], worthwhile: [] },
            showOrHide: { Favorites: true, Worthwhile: true, "All Others": true },
            enabled: true,
        };
        onAdd(campground);
        setInput("");
        setPreview(null);
        setDates(defaultDates());
    }

    function handleClear() {
        setPreview(null);
    }

    function updatePreview<K extends keyof FacilitySummary>(key: K, value: FacilitySummary[K]) {
        setPreview((p) => (p ? { ...p, [key]: value } : p));
    }

    return (
        <div className="space-y-3">
            <div className="flex items-end gap-2">
                <div className="flex-1">
                    <Label htmlFor="recgov-input" className="text-xs font-medium text-muted-foreground">
                        Recreation.gov URL or facility ID
                    </Label>
                    <Input
                        id="recgov-input"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="https://www.recreation.gov/camping/campgrounds/232358"
                    />
                </div>
                <Button onClick={handleFetch} disabled={!canFetch || fetching}>
                    {fetching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                    <span className="ml-1">Fetch</span>
                </Button>
            </div>

            {preview ? (
                <Card>
                    <CardContent className="space-y-3 p-4">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Sparkles className="size-3" />
                            From recreation.gov ID {preview.id}
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs">Name</Label>
                            <Input
                                value={preview.name}
                                onChange={(e) => updatePreview("name", e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs">Area</Label>
                            <Input
                                value={preview.area ?? ""}
                                onChange={(e) => updatePreview("area", e.target.value)}
                                placeholder="e.g. Stanley"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs">Type</Label>
                            <Select
                                value={preview.type}
                                onValueChange={(value) => updatePreview("type", value as CampgroundType)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {TYPE_OPTIONS.map((t) => (
                                        <SelectItem key={t} value={t}>
                                            {t}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs">Description</Label>
                            <Textarea
                                value={preview.description ?? ""}
                                onChange={(e) => updatePreview("description", e.target.value)}
                                rows={3}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs">Image URL (optional)</Label>
                            <Input
                                value={preview.imageUrl ?? ""}
                                onChange={(e) => updatePreview("imageUrl", e.target.value)}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-2">
                                <Label className="text-xs">Default start date</Label>
                                <Input
                                    type="date"
                                    value={dates.startDate}
                                    onChange={(e) => setDates((d) => ({ ...d, startDate: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Default end date</Label>
                                <Input
                                    type="date"
                                    value={dates.endDate}
                                    onChange={(e) => setDates((d) => ({ ...d, endDate: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                            <Button variant="ghost" onClick={handleClear}>
                                Cancel
                            </Button>
                            <Button onClick={handleAdd}>Add to list</Button>
                        </div>
                    </CardContent>
                </Card>
            ) : null}
        </div>
    );
}
```

Note the use of `<Input type="date">` for the date pickers — simpler than wiring shadcn's `Calendar` for this use case. Acceptable for v1; can be polished later.

Now update the dialog's caller (`site-config-dialog/index.tsx`) to swap the old prop:

- Old call:
  ```tsx
  <AddCampground catalogOptions={catalogOptions} selectedCatalogIds={selectedIds} onAdd={handleAddCatalogId} />
  ```
- New call:
  ```tsx
  <AddCampground existingIds={new Set(campgrounds.map((c) => c.id))} onAdd={handleAddCampground} />
  ```

`handleAddCampground` is a new function in the dialog that appends a campground object to the local `campgrounds` array.

Drop `catalogOptions` from the dialog's prop signature entirely if it's no longer used anywhere else in the dialog (verify). Same for the existing `handleAddCatalogId` and the `CUSTOM_CATALOG_OPTION` constant if it's only used by the old add flow.

Verify `pnpm exec tsc --noEmit` is clean.

Commit:
```
git add next/src/components/site-config-dialog/
git commit -m "Replace catalog dropdown with rec.gov URL/ID fetch flow"
```

### Task B2: Make all per-card metadata fields editable

**Files:**
- Modify: `next/src/components/site-config-dialog/campground-editor.tsx`

The current editor renders name/area/id/source/type/image fields as editable `<Input>`s only when `isCustom === true`. For catalog-sourced entries, they're rendered as read-only `<DetailText />` displays (or hidden).

Drop the `isCustom` branches. Every campground entry shows the same editable fields. The campground's `id` field stays editable (a curator might want to fix a typo).

Important: the dialog's `sanitizeCampground` helper trims and validates these fields on save; that doesn't change. Just lift the "you can edit this" gate.

While editing this file: remove the now-unused `catalogId` field on `EditableCampground` (Task B1's refactor likely makes it dead).

Verify `tsc --noEmit` is clean.

Commit:
```
git add next/src/components/site-config-dialog/campground-editor.tsx
git commit -m "Make all per-card metadata fields editable in Configure Sites dialog"
```

---

## Section C: Retire static catalog from runtime

### Task C1: Audit catalog imports and trim what's no longer needed

**Files (audit only — actual edits in follow-up steps below):**
- Search for imports of `@/data/campground-catalog`, `@/data/site-configurations`, `@/data/sites`, and `getCampgroundOptions` across `next/src/`.

```bash
cd next && grep -rln "@/data/campground-catalog\|@/data/site-configurations\|getCampgroundOptions" src/ | head -20
```

Expected (post-Phase-3) imports:
- `@/data/sites` is imported by `useUserCampgrounds`-related code and by `/api/users/me/campgrounds/clone-default` (fallback when KV empty).
- `getCampgroundOptions` is imported by `/app/page.tsx` and `/app/admin/page.tsx` for the dialog's `catalogOptions` prop — both calls go away in Task B1.

After Task B1 lands, neither page imports `getCampgroundOptions` anymore. Remove the now-unused import lines and stop passing `catalogOptions` to the dialog. Update `SiteConfigDialogProps` to drop the `catalogOptions` field.

The fallback in `/api/users/me/campgrounds/clone-default` (KV-empty → use static defaults) stays — that's the legitimate one-time-seed use the spec sanctions.

Verify `tsc --noEmit` is clean.

Commit:
```
git add next/src/app/app/page.tsx next/src/app/app/admin/page.tsx next/src/components/site-config-dialog/
git commit -m "Stop passing catalogOptions to Configure Sites dialog (now obsolete)"
```

---

## Section D: Deploy + smoke + PR

### Task D1: Push and watch CI

```bash
git push -u origin feature/phase-4-ui-driven-catalog
gh run watch --exit-status
```

### Task D2: Live smoke

```bash
NEW="https://campwatch.mikeroberts421.workers.dev"

echo "=== /api/recgov/facility/232358 unauth (expect 401) ==="
curl -s -o /dev/null -w "%{http_code}\n" $NEW/api/recgov/facility/232358

echo "=== /api/recgov/facility/abc unauth (expect 401) ==="
curl -s -o /dev/null -w "%{http_code}\n" $NEW/api/recgov/facility/abc

echo "=== / still loads ==="
curl -sI $NEW/ | head -1

echo "=== /discover still loads ==="
curl -s -o /dev/null -w "%{http_code}\n" $NEW/discover

echo "=== /app/admin anonymous still redirects to sign-in ==="
curl -sI $NEW/app/admin | grep -iE "^HTTP|^location" | head -2 | sed -E 's#(returnTo=)[^&]*#\1<REDACTED>#'
```

Expected: 401, 401, 200, 200, 307. The 401 confirms the new proxy is gated correctly; an authenticated curl with a session cookie would return 200 + the rec.gov summary.

### Task D3: Manual browser walk-through

1. Sign in. Open Configure Sites in the dashboard.
2. In the Add panel: type or paste a rec.gov URL (e.g. `https://www.recreation.gov/camping/campgrounds/234110`). The Fetch button enables.
3. Click Fetch → spinner → preview card appears with the fetched name, area, type guess, description, and image URL.
4. Edit any of those fields. Click Add → the campground appears in the dialog's list of campgrounds.
5. Open the newly-added campground accordion. Every field is editable — no "(read-only)" labels.
6. Save the dialog. The new campground appears in the main dashboard with its image and correct type icon.
7. As a curator, repeat the flow from /app/admin → Edit default list. Adding via the dialog writes to /api/default.

### Task D4: Open PR

```bash
gh pr create --base main --head feature/phase-4-ui-driven-catalog \
    --title "Phase 4: UI-driven catalog (paste rec.gov URL → add)" \
    --body "..."
```

PR body covers:
- New `/api/recgov/facility/[id]` proxy with 24h KV cache.
- New Add-campground UX: paste URL/ID → Fetch → editable preview → Add.
- Per-card editor: every field editable now.
- Catalog dropdown retired; `getCampgroundOptions` no longer used.
- Tests added for the parser/fetcher (pure functions) + the route handler.
- Live smoke results.

---

## Self-review checklist

- [ ] `parseFacilityId` handles both bare ID and rec.gov URL forms.
- [ ] `fetchFacilitySummary` doesn't throw on 4xx; only on network errors.
- [ ] Cache TTL is 24h (60*60*24 seconds passed as `expirationTtl`).
- [ ] Cache key namespace is `recgov:facility:<id>` so it doesn't collide with other KV usage.
- [ ] Add flow handles "already in your list" gracefully (toast, doesn't fetch).
- [ ] Per-card editor no longer gates fields by `isCustom`.
- [ ] No imports of `getCampgroundOptions` remain in `/app/page.tsx` or `/app/admin/page.tsx`.
- [ ] `SiteConfigDialogProps` no longer requires `catalogOptions`.
- [ ] Notifier (`notifier/check.mjs`) is untouched. Phase 5 is the notifier rewire.

## Future phases reminder

- **Phase 5**: notifier rewire to per-user lists with deduplication. After that, the multi-user rework is complete.
