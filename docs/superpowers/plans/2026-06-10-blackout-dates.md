# Blackout Dates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User-entered blackout date ranges grey out across calendar surfaces, exclude planner suggestions, and suppress alert emails for conflicting stays.

**Architecture:** `GlobalSettings.blackoutDates` (optional, sparse) rides the existing campgrounds record through the dialog save → PUT validation → site-settings context → views, and through the targets API → notifier. One pure helper lib (`next/src/lib/blackout.ts`) owns the overlap math: a day is blacked out if inside any inclusive range; a stay conflicts when any *night* (`from ≤ d < to`) is blacked out.

**Tech Stack:** TypeScript, React (existing component conventions), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-10-blackout-dates-design.md`

**Repo rules (campwatch):** Commit to `main`; **NEVER push or deploy without Mike's explicit OK**. Worktree is currently CLEAN (the previously-dirty files were committed in 9a3a64c) — but still stage only the files your task touches. Gates before every commit: `cd next && npx tsc --noEmit && npx vitest run && npm run lint && npm run format:check` (prettier --write your files first); tasks touching `notifier/` additionally run `cd notifier && npx tsc --noEmit && npx vitest run` (no CI coverage there).

---

## File structure

| File | Change | Task |
|---|---|---|
| `next/src/types/campground.ts` | `BlackoutRange` type + `GlobalSettings.blackoutDates?` | 1 |
| `next/src/lib/blackout.ts` (create) | `isDateBlackedOut`, `stayOverlapsBlackout` | 1 |
| `next/src/lib/blackout.test.ts` (create) | Helper units | 1 |
| `next/src/app/api/users/me/campgrounds/route.ts` | Validate `globalSettings.blackoutDates` | 2 |
| `next/src/app/api/users/me/campgrounds/route.test.ts` | Validation tests | 2 |
| `next/src/components/site-config-dialog/general-settings.tsx` | "Blackout dates" section | 3 |
| `next/src/components/site-config-dialog/index.tsx` | State/hydrate/save wiring | 3 |
| `next/src/context/site-settings.tsx` | `dates.blackoutDates?` on `SiteSettingsValue` | 4 |
| `next/src/app/app/page.tsx`, `next/src/app/discover/discover-client.tsx` | Provider construction passes the field | 4 |
| `next/src/components/campsites-calendar-helpers.ts` + `campsites-calendar.tsx` | `blackout` day variant | 4 |
| `next/src/components/campsites-calendar-helpers.test.ts` | Variant tests | 4 |
| `next/src/components/availability-strip.tsx` | Muted blackout day cells | 5 |
| `next/src/components/dashboard/timeline/availability-block.tsx` + its row/parent | Grey overlay on blackout nights | 5 |
| `next/src/lib/summer-planner.ts` + `summer-planner.test.ts` | `PlanOptions.blackoutDates` filter | 6 |
| `next/src/components/dashboard/summer-plan/summer-plan.tsx` | Pass blackouts to `planSummer` | 6 |
| `notifier/check.ts` + `notifier/check.test.ts` | Suppress conflicting matches | 7 |

---

### Task 1: Types + blackout helper lib

**Files:**
- Modify: `next/src/types/campground.ts` (GlobalSettings, ~line 94)
- Create: `next/src/lib/blackout.ts`
- Test: `next/src/lib/blackout.test.ts`

- [ ] **Step 1: Add the types**

In `next/src/types/campground.ts`, directly above the `GlobalSettings` interface:

```ts
/** A user-level "I'm busy/booked" range. Inclusive calendar days, ISO dates. */
export interface BlackoutRange {
    from: string; // YYYY-MM-DD
    to: string; // YYYY-MM-DD, >= from
    label?: string;
}
```

and inside `GlobalSettings`:

```ts
/** Dates the user can't camp: greyed in views, excluded from the planner,
 *  and alert emails are suppressed for stays overlapping these nights. */
blackoutDates?: BlackoutRange[];
```

- [ ] **Step 2: Write the failing helper tests**

Create `next/src/lib/blackout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isDateBlackedOut, stayOverlapsBlackout } from "./blackout";
import type { BlackoutRange } from "@/types/campground";

const RANGES: BlackoutRange[] = [
    { from: "2026-07-10", to: "2026-07-12", label: "Redfish booked" },
    { from: "2026-08-01", to: "2026-08-01" }, // single day, no label
];

describe("isDateBlackedOut", () => {
    it("inside, boundary, and outside days", () => {
        expect(isDateBlackedOut("2026-07-10", RANGES)).toBe(true); // first day
        expect(isDateBlackedOut("2026-07-11", RANGES)).toBe(true); // middle
        expect(isDateBlackedOut("2026-07-12", RANGES)).toBe(true); // last day (inclusive)
        expect(isDateBlackedOut("2026-07-09", RANGES)).toBe(false);
        expect(isDateBlackedOut("2026-07-13", RANGES)).toBe(false);
        expect(isDateBlackedOut("2026-08-01", RANGES)).toBe(true); // single-day range
    });

    it("empty and absent ranges", () => {
        expect(isDateBlackedOut("2026-07-10", [])).toBe(false);
        expect(isDateBlackedOut("2026-07-10", undefined)).toBe(false);
    });
});

describe("stayOverlapsBlackout", () => {
    it("a stay whose nights are fully inside conflicts", () => {
        expect(stayOverlapsBlackout("2026-07-10", "2026-07-12", RANGES)).toBe(true);
    });

    it("a stay straddling one blackout night conflicts", () => {
        // Nights Jul 9, 10, 11 — Jul 10 is blacked out.
        expect(stayOverlapsBlackout("2026-07-09", "2026-07-12", RANGES)).toBe(true);
    });

    it("checkout on the blackout's first morning does NOT conflict", () => {
        // Nights Jul 8, 9 — checkout morning Jul 10 is the blackout start.
        expect(stayOverlapsBlackout("2026-07-08", "2026-07-10", RANGES)).toBe(false);
    });

    it("check-in the day a blackout ends DOES conflict (that night is blacked out)", () => {
        // Night of Jul 12 is the blackout's last inclusive day.
        expect(stayOverlapsBlackout("2026-07-12", "2026-07-13", RANGES)).toBe(true);
    });

    it("check-in the day AFTER a blackout ends does not conflict", () => {
        expect(stayOverlapsBlackout("2026-07-13", "2026-07-15", RANGES)).toBe(false);
    });

    it("no ranges → never conflicts", () => {
        expect(stayOverlapsBlackout("2026-07-10", "2026-07-12", [])).toBe(false);
        expect(stayOverlapsBlackout("2026-07-10", "2026-07-12", undefined)).toBe(false);
    });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/lib/blackout.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement**

Create `next/src/lib/blackout.ts`:

```ts
import type { BlackoutRange } from "@/types/campground";

// ISO YYYY-MM-DD strings compare correctly as strings — no Date parsing needed.

/** True when the calendar day falls inside any inclusive blackout range. */
export function isDateBlackedOut(isoDate: string, ranges: BlackoutRange[] | undefined): boolean {
    if (!ranges || ranges.length === 0) return false;
    return ranges.some((r) => r.from <= isoDate && isoDate <= r.to);
}

/** True when any NIGHT of the stay (dates d with from <= d < to) is blacked out.
 *  Checkout on a blackout's first morning is fine; so is check-in the day after
 *  one ends. Walks nights without Date math by comparing range bounds:
 *  a range overlaps the night-interval [from, to) iff r.from < to && from <= r.to. */
export function stayOverlapsBlackout(
    stayFrom: string,
    stayTo: string,
    ranges: BlackoutRange[] | undefined,
): boolean {
    if (!ranges || ranges.length === 0) return false;
    return ranges.some((r) => r.from < stayTo && stayFrom <= r.to);
}
```

(Sanity-check the interval logic against the tests: nights are `[stayFrom, stayTo)`; blackout days are `[r.from, r.to]`. Overlap of a half-open and a closed interval: `r.from < stayTo && stayFrom <= r.to`. The boundary tests in Step 2 pin every edge.)

- [ ] **Step 5: Run to verify pass**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/lib/blackout.test.ts && npx tsc --noEmit`
Expected: 8 tests PASS, clean.

- [ ] **Step 6: Format + commit**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx prettier --write src/lib/blackout.ts src/lib/blackout.test.ts src/types/campground.ts && npm run format:check
cd /Users/mikeroberts/Code/campwatch
git add next/src/lib/blackout.ts next/src/lib/blackout.test.ts next/src/types/campground.ts
git commit -m "feat: blackout range types and overlap helpers"
```

---

### Task 2: Save-API validation

**Files:**
- Modify: `next/src/app/api/users/me/campgrounds/route.ts` (`isValidBody` / putHandler validation region)
- Test: `next/src/app/api/users/me/campgrounds/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Read the test file's existing helpers (`doPut`, `sessionFor`, `GLOBAL_SETTINGS`, `createMockKv`) and add to the PUT describe block:

```ts
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/; // reference for the route's validation

it("accepts valid blackoutDates and persists them", async () => {
    sessionFor();
    vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
    const res = await doPut({
        campgrounds: { "recreation.gov": [] },
        globalSettings: {
            ...GLOBAL_SETTINGS,
            blackoutDates: [
                { from: "2026-07-10", to: "2026-07-12", label: "Redfish booked" },
                { from: "2026-08-01", to: "2026-08-01" },
            ],
        },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
        globalSettings: { blackoutDates?: Array<{ from: string }> };
    };
    expect(body.globalSettings.blackoutDates).toHaveLength(2);
});

it("rejects blackoutDates with from after to", async () => {
    sessionFor();
    vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
    const res = await doPut({
        campgrounds: { "recreation.gov": [] },
        globalSettings: {
            ...GLOBAL_SETTINGS,
            blackoutDates: [{ from: "2026-07-12", to: "2026-07-10" }],
        },
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error.toLowerCase()).toContain("blackout");
});

it("rejects malformed dates, oversized labels, and oversized lists", async () => {
    sessionFor();
    vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());

    const bad = async (blackoutDates: unknown) =>
        (
            await doPut({
                campgrounds: { "recreation.gov": [] },
                globalSettings: { ...GLOBAL_SETTINGS, blackoutDates },
            })
        ).status;

    expect(await bad([{ from: "July 10", to: "2026-07-12" }])).toBe(400);
    expect(await bad([{ from: "2026-07-10", to: "2026-07-12", label: "x".repeat(81) }])).toBe(400);
    expect(await bad([{ from: "2026-07-10" }])).toBe(400); // missing to
    expect(
        await bad(Array.from({ length: 51 }, () => ({ from: "2026-07-10", to: "2026-07-12" }))),
    ).toBe(400);
    expect(await bad("not-an-array")).toBe(400);
});
```

- [ ] **Step 2: Run to verify the reject tests fail**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/app/api/users/me/campgrounds/route.test.ts`
Expected: the accept test passes (unknown fields flow through today); the two reject tests FAIL (200 instead of 400).

- [ ] **Step 3: Implement validation**

In `route.ts`, module scope:

```ts
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const BLACKOUT_MAX_RANGES = 50;
const BLACKOUT_MAX_LABEL = 80;

function validBlackoutDates(v: unknown): boolean {
    if (v === undefined) return true;
    if (!Array.isArray(v) || v.length > BLACKOUT_MAX_RANGES) return false;
    return v.every((r) => {
        if (!r || typeof r !== "object") return false;
        const b = r as { from?: unknown; to?: unknown; label?: unknown };
        if (typeof b.from !== "string" || !ISO_DAY.test(b.from)) return false;
        if (typeof b.to !== "string" || !ISO_DAY.test(b.to)) return false;
        if (b.from > b.to) return false;
        if (b.label !== undefined && (typeof b.label !== "string" || b.label.length > BLACKOUT_MAX_LABEL))
            return false;
        return true;
    });
}
```

In `putHandler`, after the existing checkPriority validations (before the high-cap count), add:

```ts
const gs = body.globalSettings as { blackoutDates?: unknown };
if (!validBlackoutDates(gs.blackoutDates)) {
    return withCors(
        jsonResponse({ error: "blackoutDates must be valid YYYY-MM-DD ranges (from <= to, label <= 80 chars, max 50)" }, 400),
    );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/app/api/users/me/campgrounds/route.test.ts && npx tsc --noEmit`
Expected: ALL pass (pre-existing + 3 new).

- [ ] **Step 5: Format + commit**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx prettier --write src/app/api/users/me/campgrounds/route.ts src/app/api/users/me/campgrounds/route.test.ts && npm run format:check
cd /Users/mikeroberts/Code/campwatch
git add next/src/app/api/users/me/campgrounds/route.ts next/src/app/api/users/me/campgrounds/route.test.ts
git commit -m "feat: validate blackoutDates on campgrounds save"
```

---

### Task 3: Dialog entry UI

**Files:**
- Modify: `next/src/components/site-config-dialog/general-settings.tsx`
- Modify: `next/src/components/site-config-dialog/index.tsx`

READ BOTH FILES FIRST. `general-settings.tsx` receives `stayRange`/`validStartDays` + change callbacks as props; `index.tsx` owns the state and assembles `globalSettings` on save (find where `stayLengths` and `validStartDays` are read from state into the saved object, and where `initialData`/incoming `globalSettings` hydrate state on open).

- [ ] **Step 1: Wire state in index.tsx**

a) State next to the other global-settings state:

```ts
const [blackoutDates, setBlackoutDates] = useState<BlackoutRange[]>([]);
```

(import `type BlackoutRange` from `@/types/campground`.)

b) Hydration: wherever the dialog seeds `stayRange`/`validStartDays` from the incoming `globalSettings` prop (on open / prop change), add `setBlackoutDates(globalSettings.blackoutDates ?? []);` following the same pattern.

c) Save: wherever the outgoing `GlobalSettings` object is assembled, add the sparse field:

```ts
...(blackoutDates.length > 0 ? { blackoutDates } : {}),
```

d) Pass `blackoutDates` and `onBlackoutDatesChange={setBlackoutDates}` to `<GeneralSettings ...>`.

- [ ] **Step 2: Add the section in general-settings.tsx**

Extend the props interface:

```ts
blackoutDates: BlackoutRange[];
onBlackoutDatesChange: (next: BlackoutRange[]) => void;
```

After the valid-start-days block, add a "Blackout dates" section following the file's existing label/typography conventions:

```tsx
{/* Blackout dates */}
<div>
    <div className="mb-1 flex items-center gap-2">
        <p className="text-sm">Blackout Dates</p>
        <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() =>
                onBlackoutDatesChange([...blackoutDates, { from: "", to: "", label: "" }])
            }
        >
            Add blackout
        </Button>
    </div>
    <p className="text-xs text-muted-foreground mb-2">
        Dates you&apos;re already booked or busy — greyed out on calendars, skipped by the
        planner, and no alert emails for stays that overlap them.
    </p>
    {blackoutDates.map((b, i) => (
        <div key={i} className="flex items-center gap-2 mb-2">
            <input
                type="date"
                value={b.from}
                onChange={(e) =>
                    onBlackoutDatesChange(
                        blackoutDates.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)),
                    )
                }
                className="border rounded px-2 py-1 text-sm bg-cw-cream"
            />
            <span className="text-xs">→</span>
            <input
                type="date"
                value={b.to}
                onChange={(e) =>
                    onBlackoutDatesChange(
                        blackoutDates.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)),
                    )
                }
                className="border rounded px-2 py-1 text-sm bg-cw-cream"
            />
            <input
                type="text"
                placeholder="label (optional)"
                value={b.label ?? ""}
                maxLength={80}
                onChange={(e) =>
                    onBlackoutDatesChange(
                        blackoutDates.map((x, j) =>
                            j === i ? { ...x, label: e.target.value || undefined } : x,
                        ),
                    )
                }
                className="border rounded px-2 py-1 text-sm bg-cw-cream flex-1 min-w-0"
            />
            <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Remove blackout"
                onClick={() => onBlackoutDatesChange(blackoutDates.filter((_, j) => j !== i))}
            >
                <Trash2 className="size-3.5" />
            </Button>
        </div>
    ))}
</div>
```

ADAPT to the file's actual conventions (it may use `DatePickerField`-style pickers like campground-editor, or shadcn `Input` — match what's there; the contract is: add/edit/remove ranges with from/to/label). Rows with empty `from`/`to` must be dropped at save time — add that filter in index.tsx's save assembly: `blackoutDates.filter((b) => b.from && b.to && b.from <= b.to)`.

- [ ] **Step 3: Verify**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx tsc --noEmit && npx vitest run && npm run lint && npm run format:check`
Expected: all clean (prettier --write the two files first). No new component tests (dialog has no test harness); Task 2's route tests + the final manual pass cover the save contract.

- [ ] **Step 4: Commit**

```bash
cd /Users/mikeroberts/Code/campwatch
git add next/src/components/site-config-dialog/general-settings.tsx next/src/components/site-config-dialog/index.tsx
git commit -m "feat: blackout dates entry in site config dialog"
```

---

### Task 4: Context + per-site calendar greying

**Files:**
- Modify: `next/src/context/site-settings.tsx`
- Modify: `next/src/app/app/page.tsx` and `next/src/app/discover/discover-client.tsx` (provider construction)
- Modify: `next/src/components/campsites-calendar-helpers.ts` and `campsites-calendar.tsx`
- Test: `next/src/components/campsites-calendar-helpers.test.ts`

- [ ] **Step 1: Context field**

In `site-settings.tsx`, add to `SiteSettingsValue.dates`:

```ts
blackoutDates?: BlackoutRange[];
```

(import the type). In `app/page.tsx` and `discover-client.tsx`, find where the `SiteSettingsValue` object is built from `globalSettings` (the survey: app/page.tsx ~98-108, discover-client ~53-63) and add `blackoutDates: globalSettings.blackoutDates` into `dates`.

- [ ] **Step 2: Failing variant tests**

READ `campsites-calendar-helpers.ts` (and its test file) first — it owns `buildVariantMap`. The contract to implement: the function (or a wrapper) accepts blackout ranges and maps any blacked-out day to a new `"blackout"` variant that WINS over availability variants. Write tests in the helpers test file following its existing fixture style, e.g.:

```ts
it("maps blacked-out days to the blackout variant over availability", () => {
    const map = buildVariantMap(values, {
        blackoutDates: [{ from: "2026-07-10", to: "2026-07-11" }],
    });
    expect(map["2026-07-10"]).toBe("blackout");
    expect(map["2026-07-11"]).toBe("blackout");
});

it("no blackouts → map unchanged", () => {
    expect(buildVariantMap(values)).toEqual(buildVariantMap(values, { blackoutDates: [] }));
});
```

(ADAPT the call signature to the real `buildVariantMap` — if it doesn't take an options bag today, add an optional second param; `values` = whatever fixture the existing tests use, with a date inside the blackout.)

- [ ] **Step 3: Implement**

- `campsites-calendar-helpers.ts`: extend the `DayVariant` union with `"blackout"`; in `buildVariantMap`, after computing the base map, overwrite entries for days where `isDateBlackedOut(day, opts?.blackoutDates)` (import from `@/lib/blackout`).
- `campsites-calendar.tsx`: add to `VARIANT_CLASS`:

```ts
blackout: "rounded-none bg-muted/60 text-muted-foreground opacity-50 line-through",
```

(match the class-string style of its neighbors; the visual contract: clearly muted/grey, distinct from `excluded`'s rust accent). Pass blackouts into `buildVariantMap` from the component — it should read them via `useSiteSettings()?.dates.blackoutDates` or an explicit prop, WHICHEVER matches how the component already receives settings (read it; prefer the context if the component is under the provider).
- Add `title={...label}` on blackout day buttons if the day button already supports a title; skip if not (don't add tooltip infra).

- [ ] **Step 4: Verify + commit**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/components/campsites-calendar-helpers.test.ts && npx tsc --noEmit && npx vitest run && npm run lint && npm run format:check`
Expected: all green.

```bash
cd /Users/mikeroberts/Code/campwatch
git add next/src/context/site-settings.tsx next/src/app/app/page.tsx next/src/app/discover/discover-client.tsx next/src/components/campsites-calendar-helpers.ts next/src/components/campsites-calendar.tsx next/src/components/campsites-calendar-helpers.test.ts
git commit -m "feat: blackout day variant in site calendars"
```

---

### Task 5: Strip + timeline greying

**Files:**
- Modify: `next/src/components/availability-strip.tsx`
- Modify: `next/src/components/dashboard/timeline/availability-block.tsx` (and its parent row if blackouts must be passed down — read `campground-timeline-row.tsx` / `timeline-track.tsx` to find where day-level data flows)

READ BOTH SURFACES FIRST; each must mimic its own muted precedent (the survey notes: strip's `showExcluded` treatment at ~line 225 renders `bg-cw-clay/15`; the block's `segBackground` at ~line 17-20,71 computes per-night colors).

- [ ] **Step 1: Strip**

In `availability-strip.tsx`: obtain blackouts (via `useSiteSettings()?.dates.blackoutDates` if the component runs under the provider — verify; else thread a prop from its parents). In the cell-render loop, before the availability styling, check `isDateBlackedOut(cell.iso, blackoutDates)`; blacked-out cells render a muted grey bar (`bg-muted/40` family or inline equivalent matching the file's style) regardless of counts, with `title` = the range's label when present.

- [ ] **Step 2: Timeline**

In `availability-block.tsx` (or the segment-render site found in the read): for each night segment, if `isDateBlackedOut(nightIso, blackoutDates)`, compose a grey/overlaid background instead of the open/limited color (e.g. desaturate via a fixed grey from the `C`/token palette used in the file). Thread `blackoutDates` from wherever the timeline already receives settings/props — find the nearest parent that can read `useSiteSettings()` and pass down.

- [ ] **Step 3: Verify + commit**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx tsc --noEmit && npx vitest run && npm run lint && npm run format:check`
Expected: all green (timeline has tests — `timeline.test.tsx` must still pass; if it renders blocks with fixtures, add one assertion that a blacked-out night gets the grey treatment IF the harness makes that cheap; otherwise rely on type-safety + manual pass).

```bash
cd /Users/mikeroberts/Code/campwatch
git add next/src/components/availability-strip.tsx next/src/components/dashboard/timeline/
git commit -m "feat: grey blackout days on availability strip and timeline"
```

---

### Task 6: Planner exclusion

**Files:**
- Modify: `next/src/lib/summer-planner.ts` (`PlanOptions` ~line 39, `planSummer` ~line 181)
- Modify: `next/src/components/dashboard/summer-plan/summer-plan.tsx` (the `planSummer` call, ~line 98-105)
- Test: `next/src/lib/summer-planner.test.ts`

- [ ] **Step 1: Failing test**

READ the existing test file's fixture style. Add:

```ts
it("excludes candidate trips overlapping a blackout", () => {
    // Build the same fixture the neighboring tests use, with a known candidate
    // spanning e.g. 2026-07-10 → 2026-07-12, then:
    const plan = planSummer(campgrounds, {
        ...baseOptions,
        blackoutDates: [{ from: "2026-07-10", to: "2026-07-10" }],
    });
    const all = plan.trips.map((t) => `${t.from}|${t.to}`);
    expect(all).not.toContain("2026-07-10|2026-07-12");
});
```

(ADAPT fixture/assertion names to the real shapes — `SummerPlan.trips` field names per the lib.)

- [ ] **Step 2: Implement**

`PlanOptions` gains:

```ts
/** User blackout ranges — trips overlapping any blacked-out night are excluded. */
blackoutDates?: BlackoutRange[];
```

In `planSummer`, next to the existing filters (~line 186-187):

```ts
if (opts.blackoutDates?.length)
    candidates = candidates.filter((c) => !stayOverlapsBlackout(c.from, c.to, opts.blackoutDates));
```

(check the candidate's actual date field names — `CandidateTrip` — and use those; import `stayOverlapsBlackout` from `@/lib/blackout`). In `summer-plan.tsx`, pass `blackoutDates` from the settings source the component already uses (likely `useSiteSettings()?.dates.blackoutDates` or a prop from the dashboard page).

- [ ] **Step 3: Verify + commit**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/lib/summer-planner.test.ts && npx tsc --noEmit && npx vitest run && npm run lint && npm run format:check`

```bash
cd /Users/mikeroberts/Code/campwatch
git add next/src/lib/summer-planner.ts next/src/lib/summer-planner.test.ts next/src/components/dashboard/summer-plan/summer-plan.tsx
git commit -m "feat: summer planner skips blackout-overlapping trips"
```

---

### Task 7: Notifier alert suppression

**Files:**
- Modify: `notifier/check.ts` (`computeMatchesForUser`, the scope-filter region ~line 354-362)
- Test: `notifier/check.test.ts`

- [ ] **Step 1: Failing tests**

Append to `check.test.ts` (module helpers `tierTarget`/`tierCampground`/`mockFetch`/`runAt` exist; the rec.gov fixture `RECGOV_WITH_MATCH` produces a match for the 2-night stay starting Sat 2026-07-04, i.e. nights Jul 4–5, stay from=2026-07-04 to=2026-07-06):

```ts
describe("blackout alert suppression", () => {
    beforeEach(() => vi.restoreAllMocks());

    function targetWithBlackouts(blackoutDates: unknown) {
        return {
            ...tierTarget([tierCampground("232358", "Outlet")]),
            notifierState: { sites: {} },
            globalSettings: {
                stayLengths: [2],
                validStartDays: ["Saturday"],
                ...(blackoutDates ? { blackoutDates } : {}),
            },
        };
    }

    async function resendCallsAt(targets: unknown[]): Promise<number> {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(mockFetch(targets) as never);
        vi.spyOn(console, "log").mockImplementation(() => {});
        await run({
            subscriberApiUrl: "https://campwatch.dev",
            subscriberApiSecret: "secret",
            resendApiKey: "re_x",
            siteUrl: "https://campwatch.dev",
            forceEmail: false,
            dryRun: false,
            kvAdapter: stubKv(),
            now: new Date("2026-07-06T00:00:00Z"),
        });
        return fetchSpy.mock.calls.filter((c) => String(c[0]).includes("api.resend.com")).length;
    }

    it("suppresses an alert whose stay night falls in a blackout", async () => {
        // Stay nights Jul 4–5; blackout covers Jul 5.
        const n = await resendCallsAt([
            targetWithBlackouts([{ from: "2026-07-05", to: "2026-07-05" }]),
        ]);
        expect(n).toBe(0);
    });

    it("does not suppress when the blackout starts on checkout day", async () => {
        // Stay to=2026-07-06 (checkout morning); blackout starts that day.
        const n = await resendCallsAt([
            targetWithBlackouts([{ from: "2026-07-06", to: "2026-07-08" }]),
        ]);
        expect(n).toBeGreaterThan(0);
    });

    it("does not suppress without blackouts", async () => {
        const n = await resendCallsAt([targetWithBlackouts(undefined)]);
        expect(n).toBeGreaterThan(0);
    });
});
```

- [ ] **Step 2: Run to verify the first test fails**

Run: `cd /Users/mikeroberts/Code/campwatch/notifier && npx vitest run check.test.ts`
Expected: suppression test FAILS (1 resend call instead of 0); the other two pass; pre-existing tests pass.

- [ ] **Step 3: Implement**

In `notifier/check.ts`:

a) Import: `import { stayOverlapsBlackout } from "../next/src/lib/blackout";`

b) In `computeMatchesForUser`, after the notify-scope filter (`const filtered = allMatches.filter(...)` block ending ~line 358), add:

```ts
// Blackout suppression: the user can't take a stay whose nights overlap their
// blackout dates — don't email it. (Views still show it, greyed.)
const blackouts = target.globalSettings?.blackoutDates;
const sendable = blackouts?.length
    ? filtered.filter((m) => !stayOverlapsBlackout(m.match.from, m.match.to, blackouts))
    : filtered;
```

and return / pass `sendable` where `filtered` was used (read the tail of the function — `writeUserSnapshot` keeps receiving the UN-suppressed `syntheticResults` so dashboards still show everything; only the returned matches change).

c) `GlobalSettings` is imported as a type from next — the new field flows automatically (Task 1 added it to the shared type).

- [ ] **Step 4: Run to verify pass**

Run: `cd /Users/mikeroberts/Code/campwatch/notifier && npx vitest run && npx tsc --noEmit`
Expected: ALL pass (42 incl. 3 new), clean.

- [ ] **Step 5: Format + commit**

```bash
cd /Users/mikeroberts/Code/campwatch && npx prettier --write notifier/check.ts notifier/check.test.ts
git add notifier/check.ts notifier/check.test.ts
git commit -m "feat: suppress alerts for stays overlapping blackout dates"
```

---

### Task 8: Full verification + gated rollout

- [ ] **Step 1: Full check**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx tsc --noEmit && npx vitest run && npm run lint && npm run format:check
cd /Users/mikeroberts/Code/campwatch/notifier && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 2: STOP — deploy needs Mike's explicit OK**

Both halves changed: `git push` (next app) + `cd notifier && npx wrangler deploy` (personal-account env sourced, whoami-verified). After deploy, Mike enters his real blackout ranges in the dialog and eyeballs the greyed days on the dashboard.

---

## Self-review notes

- **Spec coverage:** types+helpers+semantics (T1), validation (T2), dialog UI + sparse save (T3), context+calendar (T4), strip+timeline (T5), planner (T6), notifier suppression with snapshot-unaffected guarantee (T7), gated rollout (T8). Out-of-scope items absent.
- **Type consistency:** `BlackoutRange`, `blackoutDates`, `isDateBlackedOut(isoDate, ranges)`, `stayOverlapsBlackout(stayFrom, stayTo, ranges)` used identically in T1/T4/T5/T6/T7.
- **Anchored-not-exact code in T3/T4/T5/T6 UI internals** is deliberate: those files' internals weren't fully read at plan time; each task opens with READ-FIRST instructions, and the contracts + tests pin behavior. The interval math, validation, and notifier code are exact.
- **Overlap formula sanity:** nights `[from, to)` vs inclusive blackout `[r.from, r.to]` → conflict iff `r.from < stayTo && stayFrom <= r.to`. Verified against all six boundary tests in T1.
