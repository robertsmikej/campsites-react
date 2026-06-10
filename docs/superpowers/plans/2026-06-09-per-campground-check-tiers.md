# Per-Campground Check Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each watched campground be checked every 1, 5, or 10 minutes (high/normal/low tier), with high tier capped at 3 campgrounds.

**Architecture:** The notifier's cron moves from `*/5 * * * *` to `* * * * *`; a minute-modulo filter in `buildDedupedFetchPlan` decides which campgrounds are due each minute (high = every minute, normal = `minute % 5 === 0`, low = `minute % 10 === 0`). Campgrounds not due this minute already take the existing failed-fetch carry-forward path, so snapshots and dedup state are untouched. The tier is a new optional `checkPriority` field on `Campground`, set via a SegmentedControl in the campground editor and validated (cap of 3 "high") in the save API.

**Tech Stack:** TypeScript, Cloudflare Workers (cron), Next.js App Router, Vitest, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-09-per-campground-check-tiers-design.md`

**Repo rules (campwatch):** Commit directly to `main` is OK. **NEVER `git push` or `wrangler deploy` without Mike's explicit go-ahead** — a push deploys the next app to prod (deploy-next.yml fires on ANY branch push). Notifier is NOT covered by CI; run its `tsc` + `vitest` manually.

---

## File structure

| File | Change |
|---|---|
| `next/src/types/campground.ts` | Add `CheckPriority` type, interval map, cap constant, `Campground.checkPriority` field |
| `next/src/components/site-config-dialog/serialize.ts` | Persist `checkPriority` in `sanitizeCampground` (whitelist — would otherwise be silently stripped on save) |
| `next/src/components/site-config-dialog/serialize.test.ts` | Tests for persistence/omission |
| `notifier/check.ts` | Minute-modulo filter in `buildDedupedFetchPlan`, early-exit on empty plan, forceEmail bypass |
| `notifier/check.test.ts` | Tier filtering, carry-forward, early-exit, forceEmail tests |
| `notifier/worker.ts` | Use `controller.scheduledTime` as `now` |
| `notifier/wrangler.jsonc` | Cron `* * * * *` |
| `next/src/app/api/users/me/campgrounds/route.ts` | Reject >3 enabled high-tier campgrounds |
| `next/src/app/api/users/me/campgrounds/route.test.ts` | Cap validation tests |
| `next/src/components/site-config-dialog/field-primitives.tsx` | `disabled` support on SegmentedControl options |
| `next/src/components/site-config-dialog/field-primitives.test.tsx` | Disabled-option tests |
| `next/src/components/site-config-dialog/campground-editor.tsx` | "Check frequency" control + `highTierCount` prop |
| `next/src/components/site-config-dialog/index.tsx` | Compute and pass `highTierCount` |
| `next/src/types/user.ts` | Allow `frequencyMinutes: 1` |
| `next/src/app/api/me/route.ts` | Accept `frequencyMinutes: 1` |
| `next/src/app/api/me/route.test.ts` | Test for `1` |
| `next/src/app/app/account/page.tsx` | "Every minute" option + updated hint copy |

---

### Task 1: Tier type, constants, and save persistence

**Files:**
- Modify: `next/src/types/campground.ts:41-64`
- Modify: `next/src/components/site-config-dialog/serialize.ts` (`sanitizeCampground`, end of returned object)
- Test: `next/src/components/site-config-dialog/serialize.test.ts`

- [ ] **Step 1: Add the type, constants, and field**

In `next/src/types/campground.ts`, after the `NOTIFY_SCOPES` const (line 42), add:

```ts
export type CheckPriority = "high" | "normal" | "low";
/** Minutes between notifier checks for each tier. */
export const CHECK_PRIORITY_INTERVAL_MINUTES: Record<CheckPriority, number> = {
    high: 1,
    normal: 5,
    low: 10,
};
/** Max campgrounds a user may set to "high" (every-minute) checking. */
export const HIGH_PRIORITY_CAP = 3;
```

In the `Campground` interface, after the `notifyAll` field (line 60), add:

```ts
/** How often the notifier checks this campground. Absent = "normal" (every 5 min). */
checkPriority?: CheckPriority;
```

- [ ] **Step 2: Write the failing serialize test**

In `next/src/components/site-config-dialog/serialize.test.ts`, inside the existing `describe("sanitizeCampground", ...)` block, add (build the input the same way the neighboring tests do — `createEmptyCampground()` merged with overrides; match the existing import list):

```ts
it("persists checkPriority high/low and omits normal/unset", () => {
    const base = { ...createEmptyCampground(), name: "X", id: "1" };

    expect(sanitizeCampground({ ...base, checkPriority: "high" }).checkPriority).toBe("high");
    expect(sanitizeCampground({ ...base, checkPriority: "low" }).checkPriority).toBe("low");
    expect("checkPriority" in sanitizeCampground({ ...base, checkPriority: "normal" })).toBe(false);
    expect("checkPriority" in sanitizeCampground(base)).toBe(false);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/components/site-config-dialog/serialize.test.ts`
Expected: FAIL — `checkPriority` is stripped by the whitelist (`.toBe("high")` gets `undefined`).

- [ ] **Step 4: Persist the field in sanitizeCampground**

In `next/src/components/site-config-dialog/serialize.ts`, in `sanitizeCampground`'s returned object, after the `notifyAll` spread line, add:

```ts
...(campground.checkPriority && campground.checkPriority !== "normal"
    ? { checkPriority: campground.checkPriority }
    : {}),
```

(Omitting `"normal"` keeps stored data clean — absent means normal. `toEditableCampground` needs no change; its `...cg` spread carries the field.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/components/site-config-dialog/serialize.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/mikeroberts/Code/campwatch
git add next/src/types/campground.ts next/src/components/site-config-dialog/serialize.ts next/src/components/site-config-dialog/serialize.test.ts
git commit -m "feat: add checkPriority tier field to Campground and persist it on save"
```

---

### Task 2: Notifier minute-modulo tier filtering

**Files:**
- Modify: `notifier/check.ts` (`buildDedupedFetchPlan` ~line 170, `run()` ~lines 577-579, imports ~line 15)
- Test: `notifier/check.test.ts`

- [ ] **Step 1: Generalize the existing mockFetch helper**

In `notifier/check.test.ts`, change `mockFetch` (line 53) to accept targets, defaulting to the existing fixture so the dry-run test is untouched:

```ts
function mockFetch(targets: unknown[] = [target]) {
    return vi.fn(async (url: string | URL, _init?: RequestInit) => {
        const u = String(url);
        if (u.includes("/api/admin/notification-targets")) {
            return new Response(JSON.stringify({ targets }), { status: 200 });
        }
        if (u.includes("/api/admin/first-seen")) {
            return new Response(JSON.stringify({}), { status: 200 });
        }
        if (u.includes("/api/openings/recent")) {
            return new Response(JSON.stringify([]), { status: 200 });
        }
        if (u.includes("recreation.gov")) {
            return new Response(JSON.stringify(RECGOV_WITH_MATCH), { status: 200 });
        }
        return new Response("{}", { status: 200 });
    });
}
```

- [ ] **Step 2: Write the failing tier tests**

Append to `notifier/check.test.ts`:

```ts
import type { KvAdapter } from "../next/src/lib/recgov/cache"; // already imported at top — do not duplicate

function tierCampground(id: string, name: string, checkPriority?: string) {
    return {
        id,
        name,
        enabled: true,
        notifyScope: "all",
        ...(checkPriority ? { checkPriority } : {}),
        dates: { startDate: "2026-07-01", endDate: "2026-07-10" },
        sites: { favorites: [], worthwhile: [] },
    };
}

function tierTarget(campgrounds: unknown[]) {
    return {
        email: "boss@example.com",
        roles: ["curator"],
        notifications: { enabled: true, frequencyMinutes: 0 },
        defaultNotifyScope: "all",
        campgrounds: { "recreation.gov": campgrounds },
        globalSettings: { stayLengths: [2], validStartDays: ["Saturday"] },
        notifierState: { signatures: [] },
    };
}

describe("per-campground check tiers", () => {
    beforeEach(() => vi.restoreAllMocks());

    const HIGH = tierCampground("111", "High Camp", "high");
    const NORMAL = tierCampground("222", "Normal Camp"); // no field = normal
    const LOW = tierCampground("333", "Low Camp", "low");

    async function runAt(
        isoNow: string,
        opts: { targets?: unknown[]; kv?: KvAdapter; forceEmail?: boolean } = {},
    ): Promise<string[]> {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(mockFetch(opts.targets ?? [tierTarget([HIGH, NORMAL, LOW])]) as never);
        vi.spyOn(console, "log").mockImplementation(() => {});
        await run({
            subscriberApiUrl: "https://campwatch.dev",
            subscriberApiSecret: "secret",
            resendApiKey: "re_x",
            siteUrl: "https://campwatch.dev",
            forceEmail: opts.forceEmail ?? false,
            dryRun: true,
            kvAdapter: opts.kv ?? stubKv(),
            now: new Date(isoNow),
        });
        return fetchSpy.mock.calls.map((c) => String(c[0]));
    }

    it("fetches only high-tier campgrounds on an off minute", async () => {
        const urls = await runAt("2026-07-06T00:03:00Z");
        expect(urls.some((u) => u.includes("/campground/111/"))).toBe(true);
        expect(urls.some((u) => u.includes("/campground/222/"))).toBe(false);
        expect(urls.some((u) => u.includes("/campground/333/"))).toBe(false);
    });

    it("fetches high+normal on a %5 minute, but not low", async () => {
        const urls = await runAt("2026-07-06T00:05:00Z");
        expect(urls.some((u) => u.includes("/campground/111/"))).toBe(true);
        expect(urls.some((u) => u.includes("/campground/222/"))).toBe(true);
        expect(urls.some((u) => u.includes("/campground/333/"))).toBe(false);
    });

    it("fetches all tiers on a %10 minute", async () => {
        const urls = await runAt("2026-07-06T00:10:00Z");
        for (const id of ["111", "222", "333"]) {
            expect(urls.some((u) => u.includes(`/campground/${id}/`))).toBe(true);
        }
    });

    it("short-circuits with no rec.gov calls or snapshot writes when nothing is due", async () => {
        const kv = stubKv();
        const urls = await runAt("2026-07-06T00:03:00Z", {
            targets: [tierTarget([NORMAL, LOW])],
            kv,
        });
        expect(urls.some((u) => u.includes("recreation.gov"))).toBe(false);
        expect(kv.putSnapshot).not.toHaveBeenCalled();
    });

    it("forceEmail bypasses the tier filter (manual runs check everything)", async () => {
        const urls = await runAt("2026-07-06T00:03:00Z", { forceEmail: true });
        expect(urls.some((u) => u.includes("/campground/333/"))).toBe(true);
    });

    it("carries forward last-good snapshot data for campgrounds skipped this minute", async () => {
        const kv = stubKv();
        const priorNormal = {
            id: "222",
            name: "Normal Camp",
            sites: { favorites: [], worthwhile: [] },
            siteAvailability: {},
            totalSitesCount: 7,
        };
        (kv.getSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue({
            updatedAt: "2026-07-06T00:00:00.000Z",
            campgrounds: [priorNormal],
        });
        await runAt("2026-07-06T00:03:00Z", { kv });

        const calls = (kv.putSnapshot as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        const written = calls[calls.length - 1][1] as {
            campgrounds: Array<{ id: string; totalSitesCount?: number }>;
        };
        const carried = written.campgrounds.find((c) => c.id === "222");
        expect(carried?.totalSitesCount).toBe(7);
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /Users/mikeroberts/Code/campwatch/notifier && npx vitest run check.test.ts`
Expected: the three filtering tests, the short-circuit test, and the carry-forward test FAIL (everything is fetched at every minute today). The forceEmail test may already pass — that's fine, it pins behavior.

- [ ] **Step 4: Implement the tier filter in check.ts**

In `notifier/check.ts`:

a) Add a value import next to the existing type import (line 15):

```ts
import { CHECK_PRIORITY_INTERVAL_MINUTES } from "../next/src/types/campground";
```

b) Above `buildDedupedFetchPlan` (line 170), add:

```ts
function tierIntervalMinutes(c: Campground): number {
    return CHECK_PRIORITY_INTERVAL_MINUTES[c.checkPriority ?? "normal"];
}
```

c) Change `buildDedupedFetchPlan` to take the minute and skip not-due campgrounds:

```ts
function buildDedupedFetchPlan(targets: NotificationTarget[], minute: number): FetchPlanItem[] {
    // campgroundId → Set<"YYYY-MM">
    const ranges = new Map<string, Set<string>>();
    for (const target of targets) {
        for (const c of target.campgrounds["recreation.gov"] ?? []) {
            if (c.enabled === false) continue;
            // Tier gate: high fires every minute, normal every 5th, low every 10th.
            // The plan is a union across users, so the fastest watcher's tier wins.
            if (minute % tierIntervalMinutes(c) !== 0) continue;
            const start = c.dates?.startDate;
            const end = c.dates?.endDate;
            if (!start || !end) continue;
            const months = monthsBetween(start, end);
            if (!ranges.has(c.id)) ranges.set(c.id, new Set());
            for (const m of months) ranges.get(c.id)!.add(m);
        }
    }
    const plan: FetchPlanItem[] = [];
    for (const [campgroundId, monthSet] of ranges) {
        for (const month of monthSet) plan.push({ campgroundId, month });
    }
    return plan;
}
```

d) In `run()`, replace steps 3 (lines 577-579):

```ts
// 3. Build dedup'd fetch plan. The minute-of-hour drives which tiers fire
//    (high=1m, normal=5m, low=10m). forceEmail acts like minute 0: all due.
const minute = forceEmail ? 0 : now.getUTCMinutes();
const plan = buildDedupedFetchPlan(eligible, minute);
console.log(`[Plan] minute=${minute} → ${plan.length} unique (campground, month) fetches`);
if (plan.length === 0) {
    console.log("[Done] No campgrounds due this minute");
    return;
}
```

No carry-forward code is needed: a campground absent from the plan never lands in `rawByCampground`, and `fetchProducedNoData(undefined)` is already `true`, so it joins `failedCampgroundIds` and `writeUserSnapshot` carries its last-good entry forward. The tests pin this.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/mikeroberts/Code/campwatch/notifier && npx vitest run`
Expected: ALL tests pass, including the pre-existing dry-run test (it runs at minute 0, so all tiers fire — unchanged behavior).

- [ ] **Step 6: Typecheck**

Run: `cd /Users/mikeroberts/Code/campwatch/notifier && npx tsc --noEmit`
Expected: clean

- [ ] **Step 7: Commit**

```bash
cd /Users/mikeroberts/Code/campwatch
git add notifier/check.ts notifier/check.test.ts
git commit -m "feat: tier-filtered fetch plan in notifier (high/normal/low check cadence)"
```

---

### Task 3: Every-minute cron + drift-free minute

**Files:**
- Modify: `notifier/wrangler.jsonc:8`
- Modify: `notifier/worker.ts:15,25`

- [ ] **Step 1: Change the cron**

In `notifier/wrangler.jsonc`, change:

```jsonc
"crons": ["*/5 * * * *"],
```

to:

```jsonc
"crons": ["* * * * *"],
```

- [ ] **Step 2: Use the scheduled time as `now`**

In `notifier/worker.ts`, rename the unused `_controller` param to `controller` and pass its scheduled time (cron fires exactly on the minute; `new Date()` could land at :59.9 or :00.1 of the wrong minute):

```ts
async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
        run({
            subscriberApiUrl: env.SUBSCRIBER_API_URL,
            subscriberApiSecret: env.SUBSCRIBER_API_SECRET,
            resendApiKey: env.RESEND_API_KEY,
            siteUrl: env.SITE_URL ?? "",
            forceEmail: false,
            dryRun: env.DRY_RUN === "true",
            kvAdapter: new WorkerKvAdapter(env.SUBSCRIBERS as never),
            now: new Date(controller.scheduledTime),
        }),
    );
},
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/mikeroberts/Code/campwatch/notifier && npx tsc --noEmit`
Expected: clean

- [ ] **Step 4: Commit**

```bash
cd /Users/mikeroberts/Code/campwatch
git add notifier/wrangler.jsonc notifier/worker.ts
git commit -m "feat: run notifier cron every minute, derive minute from scheduledTime"
```

**NOTE: do NOT `wrangler deploy` here.** The cron change only takes effect at deploy time (Task 7, with Mike's explicit OK).

---

### Task 4: Save-API cap validation (max 3 high)

**Files:**
- Modify: `next/src/app/api/users/me/campgrounds/route.ts` (`putHandler`, after the `isValidBody` check at line 56-58)
- Test: `next/src/app/api/users/me/campgrounds/route.test.ts`

- [ ] **Step 1: Write the failing tests**

In `route.test.ts`, add to the `describe("PUT /api/users/me/campgrounds", ...)` block:

```ts
function cgWithPriority(id: string, checkPriority?: string, enabled = true) {
    return {
        id,
        name: `Camp ${id}`,
        sites: { favorites: [], worthwhile: [] },
        ...(checkPriority ? { checkPriority } : {}),
        ...(enabled ? {} : { enabled: false }),
    };
}

const GLOBAL_SETTINGS = { stayLengths: [2], validStartDays: ["Friday"] };

it("returns 400 when more than 3 campgrounds are high priority", async () => {
    vi.mocked(sessions.readSession).mockResolvedValue({
        id: "x",
        email: "user@example.com",
        createdAt: "x",
        expiresAt: "x",
    });
    vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());

    const res = await doPut({
        campgrounds: {
            "recreation.gov": [
                cgWithPriority("1", "high"),
                cgWithPriority("2", "high"),
                cgWithPriority("3", "high"),
                cgWithPriority("4", "high"),
            ],
        },
        globalSettings: GLOBAL_SETTINGS,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("3");
});

it("accepts exactly 3 high-priority campgrounds", async () => {
    vi.mocked(sessions.readSession).mockResolvedValue({
        id: "x",
        email: "user@example.com",
        createdAt: "x",
        expiresAt: "x",
    });
    vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());

    const res = await doPut({
        campgrounds: {
            "recreation.gov": [
                cgWithPriority("1", "high"),
                cgWithPriority("2", "high"),
                cgWithPriority("3", "high"),
                cgWithPriority("4", "low"),
            ],
        },
        globalSettings: GLOBAL_SETTINGS,
    });
    expect(res.status).toBe(200);
});

it("does not count disabled campgrounds against the high cap", async () => {
    vi.mocked(sessions.readSession).mockResolvedValue({
        id: "x",
        email: "user@example.com",
        createdAt: "x",
        expiresAt: "x",
    });
    vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());

    const res = await doPut({
        campgrounds: {
            "recreation.gov": [
                cgWithPriority("1", "high"),
                cgWithPriority("2", "high"),
                cgWithPriority("3", "high"),
                cgWithPriority("4", "high", false), // disabled — not fetched, doesn't count
            ],
        },
        globalSettings: GLOBAL_SETTINGS,
    });
    expect(res.status).toBe(200);
});
```

- [ ] **Step 2: Run tests to verify the first fails**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/app/api/users/me/campgrounds/route.test.ts`
Expected: "returns 400 when more than 3" FAILS (gets 200); the other two new tests pass trivially.

- [ ] **Step 3: Implement the cap check**

In `route.ts`, add the import:

```ts
import { HIGH_PRIORITY_CAP } from "@/types/campground";
```

In `putHandler`, after the `isValidBody` guard (line 58), add:

```ts
const highCount = body.campgrounds["recreation.gov"].filter((cg) => {
    if (!cg || typeof cg !== "object") return false;
    const c = cg as { checkPriority?: string; enabled?: boolean };
    return c.checkPriority === "high" && c.enabled !== false;
}).length;
if (highCount > HIGH_PRIORITY_CAP) {
    return withCors(
        jsonResponse(
            { error: `At most ${HIGH_PRIORITY_CAP} campgrounds can be set to every-minute checking` },
            400,
        ),
    );
}
```

(Note: `body` is narrowed by `isValidBody` to have `campgrounds: { "recreation.gov": unknown[] }`, so `.filter` is available without casts.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/app/api/users/me/campgrounds/route.test.ts`
Expected: PASS (all, including pre-existing)

- [ ] **Step 5: Commit**

```bash
cd /Users/mikeroberts/Code/campwatch
git add next/src/app/api/users/me/campgrounds/route.ts next/src/app/api/users/me/campgrounds/route.test.ts
git commit -m "feat: reject more than 3 high-priority campgrounds in campgrounds save API"
```

---

### Task 5: Check-frequency control in the campground editor

**Files:**
- Modify: `next/src/components/site-config-dialog/field-primitives.tsx:57-93` (SegmentedControl)
- Modify: `next/src/components/site-config-dialog/campground-editor.tsx` (props ~line 31, derived consts ~line 262, new block after the Email-scope div ending at line 586)
- Modify: `next/src/components/site-config-dialog/index.tsx` (SortableCampgroundEditor props ~line 40, usage ~line 375)
- Test: `next/src/components/site-config-dialog/field-primitives.test.tsx`

- [ ] **Step 1: Write the failing SegmentedControl disabled tests**

In `field-primitives.test.tsx`, add to `describe("SegmentedControl", ...)`:

```ts
it("renders a disabled option that does not fire onChange", () => {
    const onChange = vi.fn();
    render(
        <SegmentedControl
            options={[
                { value: "high", label: "Every minute", disabled: true },
                { value: "normal", label: "Every 5 min" },
            ]}
            value="normal"
            onChange={onChange}
        />,
    );
    const disabledBtn = screen.getByRole("button", { name: "Every minute" });
    expect((disabledBtn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(disabledBtn);
    expect(onChange).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/components/site-config-dialog/field-primitives.test.tsx`
Expected: FAIL — TypeScript/runtime: option `disabled` is ignored, button is not disabled, onChange fires.

- [ ] **Step 3: Add disabled support to SegmentedControl**

In `field-primitives.tsx`, update the props and button:

```tsx
interface SegmentedControlProps<T extends string> {
    options: Array<{ value: T; label: string; disabled?: boolean }>;
    value: T | undefined;
    onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
    return (
        <div
            className="inline-flex overflow-hidden rounded-[3px]"
            style={{ border: `1.5px solid ${CW.ink}` }}
        >
            {options.map((opt, i) => {
                const active = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        aria-pressed={active}
                        disabled={opt.disabled}
                        onClick={() => onChange(opt.value)}
                        className="cursor-pointer whitespace-nowrap font-mono-field font-bold uppercase transition-colors"
                        style={{
                            fontSize: 11,
                            letterSpacing: "0.1em",
                            padding: "11px 15px",
                            borderRight: i < options.length - 1 ? `1.5px solid ${CW.ink}` : undefined,
                            background: active ? CW.forest : CW.cream,
                            color: active ? CW.cream : CW.inkSoft,
                            opacity: opt.disabled ? 0.45 : undefined,
                            cursor: opt.disabled ? "not-allowed" : undefined,
                        }}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/components/site-config-dialog/field-primitives.test.tsx`
Expected: PASS

- [ ] **Step 5: Add the Check frequency control to the editor**

In `campground-editor.tsx`:

a) Extend imports from `@/types/campground` (add to whatever it already imports from there; if it doesn't import from `@/types/campground` directly, add the line):

```ts
import { HIGH_PRIORITY_CAP, type CheckPriority } from "@/types/campground";
```

b) Add to `CampgroundEditorProps` (line 31):

```ts
/** Count of enabled high-tier campgrounds across the whole list (for the 3-max gate). */
highTierCount: number;
```

and destructure `highTierCount` in the component signature alongside the other props.

c) Near the other derived consts (around line 262, next to `isEnabled`):

```ts
const highTierFull = highTierCount >= HIGH_PRIORITY_CAP && campground.checkPriority !== "high";
```

d) After the Email-scope `</div>` (line 586), insert:

```tsx
{/* Check frequency tier */}
<div>
    <FieldLabel>Check frequency</FieldLabel>
    <div className="mt-2">
        <SegmentedControl<CheckPriority>
            options={[
                { value: "high", label: "Every minute", disabled: highTierFull },
                { value: "normal", label: "Every 5 min" },
                { value: "low", label: "Every 10 min" },
            ]}
            value={campground.checkPriority ?? "normal"}
            onChange={(value) =>
                onFieldChange("checkPriority", value === "normal" ? undefined : value)
            }
        />
    </div>
    <Hint>
        {highTierFull
            ? `High tier is full — at most ${HIGH_PRIORITY_CAP} campgrounds can be checked every minute.`
            : "How often the notifier polls rec.gov for this campground."}
    </Hint>
</div>
```

- [ ] **Step 6: Wire highTierCount through index.tsx**

In `index.tsx`:

a) Add `highTierCount: number;` to the `SortableCampgroundEditor` wrapper's props interface (~line 40-49) — it spreads `{...props}` into `CampgroundEditor`, so no other wrapper change is needed.

b) In the dialog component body (before the JSX return), compute:

```ts
const highTierCount = campgrounds.filter(
    (c) => c.checkPriority === "high" && c.enabled !== false,
).length;
```

c) Pass `highTierCount={highTierCount}` to `<SortableCampgroundEditor ...>` (~line 375).

d) Run `npx tsc --noEmit` — if any other `<CampgroundEditor>` usage exists, TypeScript will flag the missing prop; pass `highTierCount` there the same way.

- [ ] **Step 7: Typecheck + full next test run**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx tsc --noEmit && npx vitest run`
Expected: clean, all tests pass

- [ ] **Step 8: Commit**

```bash
cd /Users/mikeroberts/Code/campwatch
git add next/src/components/site-config-dialog/
git commit -m "feat: check-frequency tier control in campground editor with high-tier cap"
```

---

### Task 6: "Every minute" account notification frequency

The account-level `frequencyMinutes` is a post-email pause: after an email is sent, ALL of the user's checks stop until it elapses. High-tier rechecks need this at 1 minute, and `1` isn't currently an allowed value.

**Files:**
- Modify: `next/src/types/user.ts:13`
- Modify: `next/src/app/api/me/route.ts:18,34-37`
- Modify: `next/src/app/app/account/page.tsx:25,331-340`
- Test: `next/src/app/api/me/route.test.ts`

- [ ] **Step 1: Write the failing API test**

In `next/src/app/api/me/route.test.ts`, add (mirror the file's existing pattern for a successful notifications update — same session mocking and request helper the neighboring tests use):

```ts
it("accepts frequencyMinutes: 1", async () => {
    // Copy the setup of the existing "accepts valid notifications" / happy-path
    // PATCH/PUT test in this file verbatim, changing only the payload:
    //   notifications: { enabled: true, frequencyMinutes: 1 }
    // and assert the response status is 200.
});
```

(The executor should open the file and clone the nearest passing notifications-update test — the file already has session + KV mock scaffolding; only the payload differs.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/app/api/me/route.test.ts`
Expected: FAIL — validation rejects `1` (400)

- [ ] **Step 3: Allow 1 everywhere**

a) `next/src/types/user.ts` line 13:

```ts
frequencyMinutes: 1 | 5 | 15 | 60 | 240;
```

b) `next/src/app/api/me/route.ts` line 18:

```ts
notifications?: { enabled: boolean; frequencyMinutes: 1 | 5 | 15 | 60 | 240 };
```

and in the validation condition (lines 34-37), add `n.frequencyMinutes !== 1 &&` as the first clause.

c) `next/src/app/app/account/page.tsx`:

```ts
type Frequency = 1 | 5 | 15 | 60 | 240;
```

Add above the existing 5-minute item (line 332):

```tsx
<SelectItem value="1">Every minute</SelectItem>
```

And replace the stale hint copy (line 339, "The notifier runs every 5 minutes. Faster cadence = faster alerts."):

```tsx
Checks run every 1–10 minutes depending on each campground&apos;s check frequency.
This setting is the minimum gap between alert emails.
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/app/api/me/route.test.ts && npx tsc --noEmit`
Expected: PASS, clean typecheck

- [ ] **Step 5: Commit**

```bash
cd /Users/mikeroberts/Code/campwatch
git add next/src/types/user.ts next/src/app/api/me/route.ts next/src/app/api/me/route.test.ts "next/src/app/app/account/page.tsx"
git commit -m "feat: allow 1-minute account notification frequency"
```

---

### Task 7: Full verification + rollout (GATED — requires Mike's explicit OK)

**Files:** none (verification + ops)

- [ ] **Step 1: Full local verification**

```bash
cd /Users/mikeroberts/Code/campwatch/notifier && npx tsc --noEmit && npx vitest run
cd /Users/mikeroberts/Code/campwatch/next && npx tsc --noEmit && npx vitest run && npm run lint
```

Expected: everything clean. (Notifier is NOT covered by CI — these manual runs are the only gate.)

- [ ] **Step 2: STOP — ask Mike before any push or deploy**

Pushing `main` deploys the next app to prod (deploy-next.yml fires on any branch push). `wrangler deploy` flips the cron to every-minute. Neither happens without explicit approval. Present: commits ready, tests green, ask to proceed.

- [ ] **Step 3 (after OK): Deploy**

```bash
cd /Users/mikeroberts/Code/campwatch && git push
cd /Users/mikeroberts/Code/campwatch/notifier && npx wrangler deploy
```

Expected: wrangler reports the `* * * * *` trigger. (Personal Cloudflare account ONLY — never company accounts.)

- [ ] **Step 4 (post-deploy, Mike's actions in the UI)**

1. Account page → Check frequency → "Every minute" (lifts the post-email pause to 1 min).
2. Site config dialog → set `Every minute` on up to 3 must-have campgrounds, `Every 10 min` on the don't-cares.

- [ ] **Step 5: Observe a few cycles**

```bash
cd /Users/mikeroberts/Code/campwatch/notifier && npx wrangler tail campwatch-notifier --format pretty
```

Expected per minute: `[Plan] minute=N → X unique (campground, month) fetches` — off-minutes show only high-tier fetches or "No campgrounds due this minute"; %5 minutes show normal-tier fetches too. Watch for any 429 mentions; if 429s appear persistently, the mitigation is demoting high-tier campgrounds (auto-backoff was deliberately left out of scope).

---

## Self-review notes

- **Spec coverage:** tiers+constants (T1), modulo scheduler + carry-forward + forceEmail (T2), cron+scheduledTime (T3), API cap (T4), UI control+cap gate (T5), frequencyMinutes=1 (T6), manual notifier verification + gated deploy + tail observation (T7). Out-of-scope items (auto-backoff, DO alarms, per-site tiers) excluded, matching spec.
- **Carry-forward needs no code change** — verified `fetchProducedNoData(undefined) === true` routes skipped campgrounds into the existing `failedCampgroundIds` path; Task 2's last test pins it.
- **Known judgment call:** the cap counts only *enabled* campgrounds (UI and API agree), since disabled campgrounds are never fetched.
- **Task 6 Step 1 is intentionally a clone-the-neighbor instruction** rather than full code: the me-route test file's mock scaffolding is established there and duplicating it blind risks drift. Only the payload changes.
