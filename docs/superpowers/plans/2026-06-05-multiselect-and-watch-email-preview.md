# Site Multi-Selector + Watch-Friendly Email Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) Make the configure-campgrounds dialog show a real site picker (multi-select of actual rec.gov site numbers) instead of a comma textbox; (B) make the notification email's hidden preview text lead with the openings — favorite + site number first — so Apple Watch/inbox snippets are useful.

**Architecture:** (A) A new KV-cached route proxies rec.gov's campsites roster; a small hook fetches a campground's roster lazily when its panel is expanded; the dialog feeds it to the existing `MultiSelectSites` component (falls back to the textbox if unavailable). (B) Rewrite `buildPreheader` in the notifier email module to summarize openings with site numbers, favorite-first, with padding so clients don't pull body boilerplate into the preview.

**Tech Stack:** Next 16 (App Router) + Cloudflare KV, TypeScript, Vitest (+ RTL/happy-dom), notifier (Node/TS, Vitest).

**Commands:** `cd next && pnpm test|exec tsc --noEmit|run format:check`. `cd notifier && npm test|run typecheck|run format:check`.

**Branch/push:** commit locally on `main`; don't push (Mike pushes/deploys).

---

## File Map

- Create `next/src/app/api/campgrounds/[id]/sites/route.ts` — GET: rec.gov campsites roster → sorted site labels, KV-cached. + test.
- Create `next/src/hooks/use-campground-sites.ts` — `useCampgroundSites()`: lazy per-campground roster fetch + cache. + test.
- Modify `next/src/components/site-config-dialog/index.tsx` — use the hook; load rosters for expanded panels; feed `availableSites` to the editor.
- Modify `notifier/lib/email.ts` — rewrite `buildPreheader` (favorite-first, site numbers, padding); pass `newMatches` to it.
- Create `notifier/lib/email.test.ts` — preheader content tests.

---

## Task 1: Watch-friendly email preview (`buildPreheader`)

**Files:**
- Modify: `notifier/lib/email.ts`
- Create: `notifier/lib/email.test.ts`

- [ ] **Step 1: Write the failing test** — Create `notifier/lib/email.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatEmail } from "./email";
import type { MatchResult } from "./diff";

function match(over: Partial<MatchResult>): MatchResult {
    return {
        campgroundId: "234007",
        campgroundName: "Outlet Campground",
        campgroundArea: "Redfish Lake",
        campgroundDescription: "",
        siteId: "1",
        siteName: "011",
        match: { from: "2026-07-10", to: "2026-07-12", nights: 2 },
        group: "all-others",
        ...over,
    } as MatchResult;
}

// The preheader uses lowercase "site"; the visible opening card uses "Site" — so
// "Outlet site 011" uniquely targets the preview text.
describe("formatEmail preheader", () => {
    it("leads with a favorite + site number when a favorite opened", () => {
        const { html } = formatEmail([
            match({ group: "all-others", siteName: "003" }),
            match({ group: "favorites", siteName: "011" }),
            match({ group: "all-others", siteName: "008" }),
        ]);
        expect(html).toContain("★ Outlet site 011");
        expect(html).toContain("more opening");
    });

    it("names a site even when nothing is a favorite", () => {
        const { html } = formatEmail([match({ group: "all-others", siteName: "003" })]);
        expect(html).toContain("Outlet site 003");
    });

    it("still renders the favorite badge on the opening card", () => {
        const { html } = formatEmail([match({ group: "favorites", siteName: "011" })]);
        expect(html).toContain("Favorite site"); // regression: email already calls out favorites
    });
});
```

- [ ] **Step 2: Run the test to verify it fails** — `cd notifier && npm test lib/email.test.ts` — Expected: the first two FAIL (current preheader is "N new openings on your watchlist · <names>", no site numbers, no ★-led site). The third already passes.

- [ ] **Step 3: Rewrite `buildPreheader`** — In `notifier/lib/email.ts`, replace the existing `buildPreheader`:

```ts
const buildPreheader = (matches: MatchResult[]): string => {
    const count = matches.length;
    const shortName = (n: string) => n.replace(/\s+campground$/i, "");
    const siteLabel = (m: MatchResult) => m.siteName.replace(/^Site\s+/i, "");

    const fav = matches.find((m) => m.group === "favorites");
    const head = fav ?? matches[0];
    const lead = head
        ? `${fav ? "★ " : ""}${shortName(head.campgroundName)} site ${siteLabel(head)}`
        : "New openings on your watchlist";

    const remaining = count - 1;
    const text =
        remaining > 0
            ? `${lead} + ${remaining} more opening${remaining === 1 ? "" : "s"}`
            : count === 1
              ? `${lead} just opened`
              : lead;

    // Padding (zero-width joiner + nbsp) so clients don't pull body boilerplate
    // (the "Polling every 5 min" meta bar) into the preview snippet.
    const pad = "&zwnj;&nbsp;".repeat(80);

    return `
                    <!-- PRE-HEADER (hidden, inbox/watch preview text) -->
                    <tr>
                        <td style="display:none;overflow:hidden;max-height:0;max-width:0;opacity:0;mso-hide:all;">${text}${pad}</td>
                    </tr>`;
};
```

Then update the call site in `formatEmail` (currently `${buildPreheader(count, uniqueCampgroundNames)}`):

```ts
${buildPreheader(newMatches)}
```

- [ ] **Step 4: Run the test + typecheck** — `cd notifier && npm test lib/email.test.ts` (expect PASS), then `cd notifier && npm run typecheck` (clean). If `uniqueCampgroundNames` is now unused by the preheader but still used for the subject/header, leave it; if tsc flags it unused, it isn't (header/subject use it).

- [ ] **Step 5: Format + commit** — `cd notifier && npm run format` then `npm run format:check`, then:

```bash
git add notifier/lib/email.ts notifier/lib/email.test.ts
git commit -m "Email: preheader leads with favorite + site numbers for watch/inbox previews"
```

---

## Task 2: `GET /api/campgrounds/[id]/sites` (roster route)

**Files:**
- Create: `next/src/app/api/campgrounds/[id]/sites/route.ts`, `next/src/app/api/campgrounds/[id]/sites/route.test.ts`

- [ ] **Step 1: Write the failing test** — Create `next/src/app/api/campgrounds/[id]/sites/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

vi.mock("@/lib/cloudflare", () => ({ getKv: vi.fn(), getEnv: vi.fn() }));
import * as cloudflare from "@/lib/cloudflare";

beforeEach(() => vi.restoreAllMocks());

async function doGet(id: string): Promise<Response> {
    const { GET } = await import("./route");
    return GET(new Request(`https://x/api/campgrounds/${id}/sites`), {
        params: Promise.resolve({ id }),
    });
}

it("returns sorted site labels from rec.gov on a cache miss and caches them", async () => {
    const kv = createMockKv();
    vi.mocked(cloudflare.getKv).mockReturnValue(kv);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
            JSON.stringify({ campsites: [{ name: "003" }, { name: "001" }, { name: "002" }, { name: "" }] }),
            { status: 200 },
        ),
    );

    const res = await doGet("234007");
    expect(res.status).toBe(200);
    expect((await res.json()).sites).toEqual(["001", "002", "003"]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // cached:
    expect(await kv.get("sites:234007", "json")).toEqual(["001", "002", "003"]);
});

it("serves from cache without calling rec.gov on a hit", async () => {
    const kv = createMockKv({ "sites:234007": JSON.stringify(["001", "002"]) });
    vi.mocked(cloudflare.getKv).mockReturnValue(kv);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await doGet("234007");
    expect((await res.json()).sites).toEqual(["001", "002"]);
    expect(fetchSpy).not.toHaveBeenCalled();
});

it("rejects a non-numeric id", async () => {
    vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
    const res = await doGet("abc");
    expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run to verify it fails** — `cd next && pnpm test "src/app/api/campgrounds/[id]/sites/route.test.ts"` — Expected: FAIL (`Cannot find module './route'`).

- [ ] **Step 3: Write the route** — Create `next/src/app/api/campgrounds/[id]/sites/route.ts`:

```ts
import { getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { withErrorLogging } from "@/lib/route-helpers";

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days; rosters rarely change
const cacheKey = (id: string) => `sites:${id}`;

interface RecCampsite {
    name?: string;
}

async function getHandler(_req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
    const { id } = await context.params;
    if (!/^\d+$/.test(id)) {
        return withCors(jsonResponse({ error: "Invalid campground id" }, 400));
    }

    const kv = getKv();
    const cached = (await kv.get(cacheKey(id), "json")) as string[] | null;
    if (cached) return withCors(jsonResponse({ sites: cached }));

    const url = `https://www.recreation.gov/api/search/campsites?fq=asset_id%3A${id}&size=1000&include_non_site_specific_campsites=true`;
    let labels: string[] = [];
    try {
        const r = await fetch(url, {
            headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (CampWatch)" },
        });
        if (r.ok) {
            const data = (await r.json()) as { campsites?: RecCampsite[] };
            labels = [...new Set((data.campsites ?? []).map((c) => (c.name ?? "").trim()).filter(Boolean))].sort();
        }
    } catch {
        // Network/parse failure → return empty; the client falls back to the textbox.
    }

    if (labels.length > 0) {
        await kv.put(cacheKey(id), JSON.stringify(labels), { expirationTtl: CACHE_TTL_SECONDS });
    }
    return withCors(jsonResponse({ sites: labels }));
}
export const GET = withErrorLogging(getHandler, "GET /api/campgrounds/[id]/sites");
```

- [ ] **Step 4: Run to verify it passes** — `cd next && pnpm test "src/app/api/campgrounds/[id]/sites/route.test.ts"` (expect 3 pass), then `cd next && pnpm exec tsc --noEmit` (clean).

- [ ] **Step 5: Commit**

```bash
git add "next/src/app/api/campgrounds/[id]/sites/route.ts" "next/src/app/api/campgrounds/[id]/sites/route.test.ts"
git commit -m "Add GET /api/campgrounds/[id]/sites: KV-cached rec.gov roster of site labels"
```

---

## Task 3: `useCampgroundSites` hook

**Files:**
- Create: `next/src/hooks/use-campground-sites.ts`, `next/src/hooks/use-campground-sites.test.ts`

- [ ] **Step 1: Write the failing test** — Create `next/src/hooks/use-campground-sites.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCampgroundSites } from "./use-campground-sites";

beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ sites: ["001", "002"] }), { status: 200 }),
    );
});
afterEach(() => vi.restoreAllMocks());

it("loads a campground's roster once and exposes it by id", async () => {
    const { result } = renderHook(() => useCampgroundSites());
    act(() => result.current.ensureLoaded("234007"));
    await waitFor(() => expect(result.current.sitesById["234007"]).toEqual(["001", "002"]));

    act(() => result.current.ensureLoaded("234007")); // dedup
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/campgrounds/234007/sites", expect.any(Object));
});

it("ignores non-numeric ids", async () => {
    const { result } = renderHook(() => useCampgroundSites());
    act(() => result.current.ensureLoaded("abc"));
    await new Promise((r) => setTimeout(r, 0));
    expect(globalThis.fetch).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify it fails** — `cd next && pnpm test src/hooks/use-campground-sites.test.ts` — Expected: FAIL (`Cannot find module './use-campground-sites'`).

- [ ] **Step 3: Write the hook** — Create `next/src/hooks/use-campground-sites.ts`:

```ts
"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Lazily fetches a recreation.gov campground's site-label roster (one fetch per
 * id per mount) and exposes the results by campground id. Used by the configure
 * dialog to populate the site multi-select only for campgrounds you actually open.
 */
export function useCampgroundSites() {
    const [sitesById, setSitesById] = useState<Record<string, string[]>>({});
    const requested = useRef<Set<string>>(new Set());

    const ensureLoaded = useCallback((id: string | undefined) => {
        if (!id || !/^\d+$/.test(id) || requested.current.has(id)) return;
        requested.current.add(id);
        void (async () => {
            try {
                const r = await fetch(`/api/campgrounds/${id}/sites`, { credentials: "include" });
                if (!r.ok) {
                    requested.current.delete(id); // allow a later retry
                    return;
                }
                const data = (await r.json()) as { sites?: string[] };
                setSitesById((cur) => ({ ...cur, [id]: data.sites ?? [] }));
            } catch {
                requested.current.delete(id);
            }
        })();
    }, []);

    return { sitesById, ensureLoaded };
}
```

- [ ] **Step 4: Run to verify it passes** — `cd next && pnpm test src/hooks/use-campground-sites.test.ts` (expect 2 pass), then `cd next && pnpm exec tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add next/src/hooks/use-campground-sites.ts next/src/hooks/use-campground-sites.test.ts
git commit -m "Add useCampgroundSites hook: lazy per-campground roster fetch"
```

---

## Task 4: Wire the picker into the configure dialog

**Files:**
- Modify: `next/src/components/site-config-dialog/index.tsx`

- [ ] **Step 1: Import the hook** — add near the other imports:

```ts
import { useCampgroundSites } from "@/hooks/use-campground-sites";
```

- [ ] **Step 2: Use the hook + load rosters for expanded panels** — inside `SiteConfigDialog`, after the `expandedPanels` state is declared, add:

```ts
    const { sitesById, ensureLoaded } = useCampgroundSites();
    // Fetch a campground's site roster the first time its panel is open, so the
    // multi-select shows real site numbers (lazy = gentle on rec.gov).
    useEffect(() => {
        if (!open) return;
        for (const i of expandedPanels) {
            const id = campgrounds[i]?.id;
            if (id) ensureLoaded(id);
        }
    }, [open, expandedPanels, campgrounds, ensureLoaded]);
```

(Add `useEffect` to the existing `react` import if not already imported.)

- [ ] **Step 3: Feed rosters to the editor** — change the editor's `availableSites` prop (currently `availableSites={availableSites[campground.id] ?? []}`) to prefer the hook's freshly-fetched roster, falling back to the prop then empty:

```tsx
                                            availableSites={
                                                sitesById[campground.id] ??
                                                availableSites[campground.id] ??
                                                []
                                            }
```

- [ ] **Step 4: Type-check + full suite** — `cd next && pnpm exec tsc --noEmit` (clean), then `cd next && pnpm test` (all pass; the dialog has no unit test — the hook and route are covered, and tsc verifies the wiring).

- [ ] **Step 5: Format + commit** — `cd next && pnpm run format` then `pnpm run format:check`, then:

```bash
git add next/src/components/site-config-dialog/index.tsx
git commit -m "Configure dialog: show real site multi-select via lazy roster fetch"
```

---

## Task 5: Full verification

**Files:** none.

- [ ] **Step 1: next** — `cd next && pnpm exec tsc --noEmit && pnpm test && pnpm run format:check` (all green; report totals).
- [ ] **Step 2: notifier** — `cd notifier && npm run typecheck && npm test && npm run format:check` (all green).
- [ ] **Step 3: build** — `cd next && pnpm run cf:build` (succeeds).
- [ ] **Step 4: manual smoke (local dev, optional)** — `cd next && pnpm dev`, open the configure dialog for a watched campground, expand a panel → it should show a multi-select of that campground's real site numbers; pick a few, save, reopen → they persist. (The save persistence itself is already covered by the serialize fix + tests.)

---

## Self-Review Notes

- **Spec coverage:** (A) multi-selector — roster route (Task 2) + lazy hook (Task 3) + dialog wiring to the existing `MultiSelectSites` with textbox fallback (Task 4) ✓; (B) watch preview — favorite-first, site-numbered preheader with padding (Task 1) ✓; favorites-callout question — covered as a regression assertion in Task 1 (already worked) ✓.
- **Type consistency:** route returns `{ sites: string[] }`; the hook reads `data.sites` and stores `Record<string,string[]>`; the dialog indexes `sitesById[campground.id]` (string[]) into the editor's `availableSites: string[]` prop — consistent. `buildPreheader(matches: MatchResult[])` matches its single call site.
- **Placeholders:** none — full code for every new file; the dialog edit gives exact before/after.
- **rec.gov politeness:** roster fetched only for expanded panels, KV-cached 7 days → at most one rec.gov call per campground per week, on a rare user action.
