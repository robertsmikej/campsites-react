# Trip Windows Decoupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move trip windows out of the campground config blob into their own KV key and API endpoints so campground saves never touch trip data.

**Architecture:** New KV key `user:{email}:trip-windows` with a dedicated `user-trip-windows.ts` abstraction. New `GET/PUT /api/users/me/trip-windows` endpoints. New `useTripWindows` client hook. Read-through migration on first access pulls trip windows from the old location and strips them from the campground blob. Downstream consumers (notifier, availability, timeline components) receive trip windows from the new source but their interfaces stay the same.

**Tech Stack:** Next.js (App Router on Cloudflare Workers via OpenNext), Cloudflare KV, React hooks, Vitest

**Spec:** `docs/superpowers/specs/2026-08-17-trip-windows-decoupling-design.md`

## Global Constraints

- All KV access goes through `getKv()` from `@/lib/cloudflare`
- Tests mock `@/lib/cloudflare` and use `createMockKv()` from `@/lib/__mocks__/cloudflare-test-helpers`
- Route tests use dynamic `import("./route")` after mocks are wired (module-scoped vi.mock + beforeEach resetModules)
- `TripWindow` type stays in `@/types/campground.ts` (it's referenced by the notifier via relative import)
- The notifier imports `trip-windows.ts` utilities directly from `next/src/lib/` via relative path

## File Map

### New files
| File | Responsibility |
|---|---|
| `next/src/lib/user-trip-windows.ts` | KV abstraction: read/write/migrate trip windows |
| `next/src/lib/user-trip-windows.test.ts` | Unit tests for the KV abstraction + migration |
| `next/src/app/api/users/me/trip-windows/route.ts` | GET + PUT endpoints for trip windows |
| `next/src/app/api/users/me/trip-windows/route.test.ts` | Route tests |
| `next/src/hooks/use-trip-windows.ts` | Client hook: fetch, save, expose state |

### Modified files
| File | Change |
|---|---|
| `next/src/types/campground.ts:141` | Remove `tripWindows` from `GlobalSettings` |
| `next/src/app/api/users/me/campgrounds/route.ts:106-121` | Remove tripWindows validation + pruning |
| `next/src/app/api/users/me/campgrounds/route.test.ts:551-616` | Remove tripWindows test block, add "ignores tripWindows" test |
| `next/src/app/api/availability/route.ts:60,135-139` | Read trip windows from new key |
| `next/src/app/api/availability/route.test.ts:477-480` | Mock the new `getUserTripWindows` instead |
| `next/src/app/api/admin/notification-targets/route.ts:47-59` | Read trip windows from new key |
| `next/src/app/api/admin/notification-targets/route.test.ts` | Seed trip windows in the new KV key |
| `next/src/lib/default-config.ts:43` | Remove tripWindows destructuring |
| `next/src/lib/default-config.test.ts` | Remove the tripWindows-strip assertion |
| `next/src/app/app/page.tsx:123,165-170,336-339` | Wire new hook, remove old trip-window plumbing |
| `next/src/components/site-config-dialog/index.test.tsx` | Update regression test (tripWindows no longer in globalSettings) |

---

### Task 1: KV Abstraction + Migration Logic

**Files:**
- Create: `next/src/lib/user-trip-windows.ts`
- Create: `next/src/lib/user-trip-windows.test.ts`

**Interfaces:**
- Consumes: `getKv()` from `@/lib/cloudflare`, `TripWindow` from `@/types/campground`
- Produces:
  - `getUserTripWindows(email: string): Promise<TripWindowsRecord>`
  - `putUserTripWindows(email: string, tripWindows: TripWindow[]): Promise<TripWindowsRecord>`
  - `TripWindowsRecord` type: `{ tripWindows: TripWindow[]; updatedAt: string | null }`

- [ ] **Step 1: Write the failing tests**

Create `next/src/lib/user-trip-windows.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

vi.mock("@/lib/cloudflare", () => ({
    getKv: vi.fn(),
}));

import * as cloudflare from "@/lib/cloudflare";

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
});

describe("getUserTripWindows", () => {
    it("returns data from the dedicated key when it exists", async () => {
        const record = {
            tripWindows: [{ id: "w1", from: "2026-09-04", to: "2026-09-08" }],
            updatedAt: "2026-08-17T00:00:00.000Z",
        };
        const kv = createMockKv({
            "user:u@x.com:trip-windows": JSON.stringify(record),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const { getUserTripWindows } = await import("./user-trip-windows");
        const result = await getUserTripWindows("u@x.com");
        expect(result.tripWindows).toHaveLength(1);
        expect(result.tripWindows[0]!.id).toBe("w1");
    });

    it("migrates from the campgrounds blob when the dedicated key is empty", async () => {
        const kv = createMockKv({
            "user:u@x.com:campgrounds": JSON.stringify({
                campgrounds: { "recreation.gov": [] },
                globalSettings: {
                    stayLengths: [2],
                    validStartDays: ["Friday"],
                    tripWindows: [{ id: "legacy", from: "2026-09-01", to: "2026-09-03" }],
                },
                updatedAt: "2026-01-01T00:00:00.000Z",
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const { getUserTripWindows } = await import("./user-trip-windows");
        const result = await getUserTripWindows("u@x.com");

        // Trip windows migrated to the new key
        expect(result.tripWindows).toHaveLength(1);
        expect(result.tripWindows[0]!.id).toBe("legacy");

        // New key was written
        const newKeyRaw = kv._store.get("user:u@x.com:trip-windows");
        expect(newKeyRaw).toBeDefined();
        const newKey = JSON.parse(newKeyRaw!);
        expect(newKey.tripWindows).toHaveLength(1);

        // Old blob had tripWindows stripped
        const oldRaw = kv._store.get("user:u@x.com:campgrounds");
        const old = JSON.parse(oldRaw!);
        expect(old.globalSettings.tripWindows).toBeUndefined();
    });

    it("returns empty when neither key has trip windows", async () => {
        const kv = createMockKv({
            "user:u@x.com:campgrounds": JSON.stringify({
                campgrounds: { "recreation.gov": [] },
                globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
                updatedAt: "2026-01-01T00:00:00.000Z",
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const { getUserTripWindows } = await import("./user-trip-windows");
        const result = await getUserTripWindows("u@x.com");
        expect(result.tripWindows).toEqual([]);
        expect(result.updatedAt).toBeNull();
    });

    it("returns empty when no campgrounds record exists at all", async () => {
        const kv = createMockKv({});
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const { getUserTripWindows } = await import("./user-trip-windows");
        const result = await getUserTripWindows("u@x.com");
        expect(result.tripWindows).toEqual([]);
        expect(result.updatedAt).toBeNull();
    });
});

describe("putUserTripWindows", () => {
    it("writes to the dedicated key and returns the record with updatedAt", async () => {
        const kv = createMockKv({});
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const { putUserTripWindows } = await import("./user-trip-windows");
        const result = await putUserTripWindows("u@x.com", [
            { id: "w1", from: "2026-09-04", to: "2026-09-08" },
        ]);
        expect(result.tripWindows).toHaveLength(1);
        expect(result.updatedAt).not.toBeNull();

        // Verify it was persisted
        const raw = kv._store.get("user:u@x.com:trip-windows");
        expect(raw).toBeDefined();
        const stored = JSON.parse(raw!);
        expect(stored.tripWindows[0].id).toBe("w1");
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd next && npx vitest run src/lib/user-trip-windows.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement the KV abstraction with migration**

Create `next/src/lib/user-trip-windows.ts`:

```ts
import { getKv } from "./cloudflare";
import type { TripWindow } from "@/types/campground";

export interface TripWindowsRecord {
    tripWindows: TripWindow[];
    updatedAt: string | null;
}

function key(email: string): string {
    return `user:${email}:trip-windows`;
}

const EMPTY: TripWindowsRecord = { tripWindows: [], updatedAt: null };

/**
 * Read trip windows from the dedicated key. On first access after deploy,
 * migrates from the legacy location (globalSettings.tripWindows inside
 * the campgrounds blob) and strips the old field.
 */
export async function getUserTripWindows(email: string): Promise<TripWindowsRecord> {
    const kv = getKv();

    // 1. Check the dedicated key first.
    const existing = (await kv.get(key(email), "json")) as TripWindowsRecord | null;
    if (existing && existing.tripWindows) return existing;

    // 2. Read-through migration: pull from the campgrounds blob.
    const campKey = `user:${email}:campgrounds`;
    const campRaw = (await kv.get(campKey, "json")) as {
        campgrounds: unknown;
        globalSettings: { tripWindows?: TripWindow[]; [k: string]: unknown };
        updatedAt: string;
    } | null;

    if (!campRaw?.globalSettings?.tripWindows?.length) return EMPTY;

    const migrated: TripWindowsRecord = {
        tripWindows: campRaw.globalSettings.tripWindows,
        updatedAt: new Date().toISOString(),
    };

    // Write to the new key.
    await kv.put(key(email), JSON.stringify(migrated));

    // Strip from the old blob.
    const { tripWindows: _, ...cleanGlobalSettings } = campRaw.globalSettings;
    await kv.put(
        campKey,
        JSON.stringify({
            ...campRaw,
            globalSettings: cleanGlobalSettings,
        }),
    );

    return migrated;
}

export async function putUserTripWindows(
    email: string,
    tripWindows: TripWindow[],
): Promise<TripWindowsRecord> {
    const record: TripWindowsRecord = {
        tripWindows,
        updatedAt: new Date().toISOString(),
    };
    await getKv().put(key(email), JSON.stringify(record));
    return record;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd next && npx vitest run src/lib/user-trip-windows.test.ts`
Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add next/src/lib/user-trip-windows.ts next/src/lib/user-trip-windows.test.ts
git commit -m "Add user-trip-windows KV abstraction with read-through migration

Dedicated key user:{email}:trip-windows with getUserTripWindows (read +
migrate from legacy campgrounds blob) and putUserTripWindows (write).
Migration strips tripWindows from the old globalSettings on first access."
```

---

### Task 2: Trip Windows API Endpoints

**Files:**
- Create: `next/src/app/api/users/me/trip-windows/route.ts`
- Create: `next/src/app/api/users/me/trip-windows/route.test.ts`

**Interfaces:**
- Consumes: `getUserTripWindows`, `putUserTripWindows` from `@/lib/user-trip-windows`; `readSession` from `@/lib/sessions`; `validTripWindows`, `windowIsPast`, `serverTodayIso` from `@/lib/trip-windows`
- Produces: `GET /api/users/me/trip-windows` returning `TripWindowsRecord`; `PUT /api/users/me/trip-windows` accepting `{ tripWindows: TripWindow[] }`

- [ ] **Step 1: Write the failing tests**

Create `next/src/app/api/users/me/trip-windows/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));

vi.mock("@/lib/sessions", () => ({
    readSession: vi.fn(),
    SESSION_COOKIE: "campwatch_session",
}));

import * as sessions from "@/lib/sessions";
import * as cloudflare from "@/lib/cloudflare";

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
});

function authed(kv?: ReturnType<typeof createMockKv>) {
    vi.mocked(sessions.readSession).mockResolvedValue({
        id: "x",
        email: "user@example.com",
        createdAt: "x",
        expiresAt: "x",
    });
    const kvInst = kv ?? createMockKv();
    vi.mocked(cloudflare.getKv).mockReturnValue(kvInst);
    return kvInst;
}

async function doGet(): Promise<Response> {
    const { GET } = await import("./route");
    return GET(new Request("https://example.com/api/users/me/trip-windows"));
}

async function doPut(body: unknown): Promise<Response> {
    const { PUT } = await import("./route");
    return PUT(
        new Request("https://example.com/api/users/me/trip-windows", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
    );
}

const futureFrom = "2100-09-04";
const futureTo = "2100-09-08";

describe("GET /api/users/me/trip-windows", () => {
    it("returns empty array when not signed in", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await doGet();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { tripWindows: unknown[] };
        expect(body.tripWindows).toEqual([]);
    });

    it("returns existing trip windows", async () => {
        const kv = createMockKv({
            "user:user@example.com:trip-windows": JSON.stringify({
                tripWindows: [{ id: "w1", from: futureFrom, to: futureTo }],
                updatedAt: "2026-08-17T00:00:00.000Z",
            }),
        });
        authed(kv);
        const res = await doGet();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { tripWindows: Array<{ id: string }> };
        expect(body.tripWindows).toHaveLength(1);
        expect(body.tripWindows[0]!.id).toBe("w1");
    });

    it("migrates from campgrounds blob on first access", async () => {
        const kv = createMockKv({
            "user:user@example.com:campgrounds": JSON.stringify({
                campgrounds: { "recreation.gov": [] },
                globalSettings: {
                    stayLengths: [2],
                    validStartDays: ["Friday"],
                    tripWindows: [{ id: "legacy", from: futureFrom, to: futureTo }],
                },
                updatedAt: "2026-01-01T00:00:00.000Z",
            }),
        });
        authed(kv);
        const res = await doGet();
        const body = (await res.json()) as { tripWindows: Array<{ id: string }> };
        expect(body.tripWindows[0]!.id).toBe("legacy");
    });
});

describe("PUT /api/users/me/trip-windows", () => {
    it("returns 401 when not signed in", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await doPut({ tripWindows: [] });
        expect(res.status).toBe(401);
    });

    it("returns 400 for invalid trip windows", async () => {
        authed();
        const res = await doPut({
            tripWindows: [{ id: "", from: futureFrom, to: futureTo }],
        });
        expect(res.status).toBe(400);
    });

    it("stores valid trip windows and returns them", async () => {
        const kv = authed();
        const res = await doPut({
            tripWindows: [{ id: "w1", from: futureFrom, to: futureTo, flexDays: 1 }],
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { tripWindows: Array<{ id: string }>; updatedAt: string };
        expect(body.tripWindows).toHaveLength(1);
        expect(body.updatedAt).toBeTruthy();

        // Verify persistence via GET
        const getRes = await doGet();
        const getBody = (await getRes.json()) as { tripWindows: Array<{ id: string }> };
        expect(getBody.tripWindows[0]!.id).toBe("w1");
    });

    it("prunes past windows on save", async () => {
        authed();
        const res = await doPut({
            tripWindows: [
                { id: "old", from: "2020-07-31", to: "2020-08-02" },
                { id: "new", from: futureFrom, to: futureTo },
            ],
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { tripWindows: Array<{ id: string }> };
        expect(body.tripWindows.map((w) => w.id)).toEqual(["new"]);
    });

    it("returns 400 for invalid JSON", async () => {
        authed();
        const { PUT } = await import("./route");
        const res = await PUT(
            new Request("https://example.com/api/users/me/trip-windows", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: "not json",
            }),
        );
        expect(res.status).toBe(400);
    });

    it("returns 400 when body is missing tripWindows", async () => {
        authed();
        const res = await doPut({ something: "else" });
        expect(res.status).toBe(400);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd next && npx vitest run src/app/api/users/me/trip-windows/route.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement the route handlers**

Create `next/src/app/api/users/me/trip-windows/route.ts`:

```ts
import { readSession } from "@/lib/sessions";
import { jsonResponse, withCors } from "@/lib/responses";
import { withErrorLogging } from "@/lib/route-helpers";
import { getUserTripWindows, putUserTripWindows } from "@/lib/user-trip-windows";
import { validTripWindows, windowIsPast, serverTodayIso, TRIP_MAX_NIGHTS } from "@/lib/trip-windows";
import type { TripWindow } from "@/types/campground";

const EMPTY = { tripWindows: [] as TripWindow[], updatedAt: null };

async function getHandler(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse(EMPTY));

    const record = await getUserTripWindows(session.email);
    return withCors(jsonResponse(record));
}
export const GET = withErrorLogging(getHandler, "GET /api/users/me/trip-windows");

async function putHandler(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return withCors(jsonResponse({ error: "Invalid JSON" }, 400));
    }

    if (!body || typeof body !== "object" || !Array.isArray((body as { tripWindows?: unknown }).tripWindows)) {
        return withCors(jsonResponse({ error: "Body must include tripWindows array" }, 400));
    }

    const tripWindows = (body as { tripWindows: unknown[] }).tripWindows;
    if (!validTripWindows(tripWindows)) {
        return withCors(
            jsonResponse(
                {
                    error: `tripWindows must be valid ranges (id, YYYY-MM-DD from < to, max ${TRIP_MAX_NIGHTS} nights, label <= 80, flex 0-3 leaving >= 1 core night, max 10, unique ids)`,
                },
                400,
            ),
        );
    }

    // Prune past windows on every save.
    const todayIso = serverTodayIso();
    const pruned = (tripWindows as TripWindow[]).filter((w) => !windowIsPast(w, todayIso));

    const stored = await putUserTripWindows(session.email, pruned);
    return withCors(jsonResponse(stored));
}
export const PUT = withErrorLogging(putHandler, "PUT /api/users/me/trip-windows");
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd next && npx vitest run src/app/api/users/me/trip-windows/route.test.ts`
Expected: all 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add next/src/app/api/users/me/trip-windows/
git commit -m "Add GET/PUT /api/users/me/trip-windows endpoints

Dedicated endpoints for trip window CRUD with validation, past-window
pruning, and read-through migration from the campgrounds blob."
```

---

### Task 3: Remove Trip Windows from Campground Route + Type

This task strips tripWindows from `GlobalSettings`, removes the validation/pruning from the campground PUT, and updates the campground route tests plus the default-config test.

**Files:**
- Modify: `next/src/types/campground.ts:141`
- Modify: `next/src/app/api/users/me/campgrounds/route.ts:10-11,106-121`
- Modify: `next/src/app/api/users/me/campgrounds/route.test.ts:551-616`
- Modify: `next/src/lib/default-config.ts:43`
- Modify: `next/src/lib/default-config.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `GlobalSettings` without `tripWindows`; campground PUT ignores `tripWindows` if sent

- [ ] **Step 1: Remove `tripWindows` from `GlobalSettings`**

In `next/src/types/campground.ts`, delete line 141:

```ts
// REMOVE this line:
    /** Dates the user is actively trying to book. See TripWindow. */
    tripWindows?: TripWindow[];
```

The `GlobalSettings` interface becomes:

```ts
export interface GlobalSettings {
    stayLengths: number[];
    validStartDays: string[];
    /** Dates the user can't camp: greyed in views, excluded from the planner,
     *  and alert emails are suppressed for stays overlapping these nights. */
    blackoutDates?: BlackoutRange[];
}
```

- [ ] **Step 2: Remove trip window validation and pruning from the campground route**

In `next/src/app/api/users/me/campgrounds/route.ts`:

Remove the trip-window imports from line 10. Change:
```ts
import { validTripWindows, windowIsPast, serverTodayIso, TRIP_MAX_NIGHTS } from "@/lib/trip-windows";
import type { Campground, TripWindow } from "@/types/campground";
```
To:
```ts
import type { Campground } from "@/types/campground";
```

Remove lines 106-121 (the entire `gsTrips` validation and pruning block):
```ts
// DELETE this entire block:
    const gsTrips = body.globalSettings as { tripWindows?: unknown };
    if (!validTripWindows(gsTrips.tripWindows)) {
        return withCors(
            jsonResponse(
                {
                    error: `tripWindows must be valid ranges (...)`,
                },
                400,
            ),
        );
    }
    // Past windows are dead weight: drop them on every save.
    if (Array.isArray(gsTrips.tripWindows)) {
        const todayIso = serverTodayIso();
        gsTrips.tripWindows = (gsTrips.tripWindows as TripWindow[]).filter((w) => !windowIsPast(w, todayIso));
    }
```

- [ ] **Step 3: Update the campground route tests**

In `next/src/app/api/users/me/campgrounds/route.test.ts`, replace the entire `PUT tripWindows validation` describe block (lines 551-616) with a single test:

```ts
    it("ignores tripWindows in globalSettings without error", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "user@example.com",
            createdAt: "x",
            expiresAt: "x",
        });
        const kv = createMockKv();
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const res = await doPut({
            campgrounds: { "recreation.gov": [] },
            globalSettings: {
                stayLengths: [2],
                validStartDays: ["Friday"],
                tripWindows: [{ id: "w1", from: "2100-09-04", to: "2100-09-08" }],
            },
        });
        expect(res.status).toBe(200);
    });
```

- [ ] **Step 4: Update default-config.ts**

In `next/src/lib/default-config.ts`, replace line 43:
```ts
            const { tripWindows: _tripWindows, ...sharedGlobalSettings } = record.globalSettings;
            return { campgrounds: record.campgrounds, globalSettings: sharedGlobalSettings };
```
With:
```ts
            return { campgrounds: record.campgrounds, globalSettings: record.globalSettings };
```

- [ ] **Step 5: Update default-config.test.ts**

Replace the `"strips the curator's tripWindows"` test. Since `GlobalSettings` no longer has `tripWindows`, the test should verify that `globalSettings` passes through cleanly:

```ts
    it("passes globalSettings through without modification", async () => {
        const kv = createMockKv({
            "user:boss@example.com:profile": curatorProfile("boss@example.com"),
            "user:boss@example.com:campgrounds": JSON.stringify({
                campgrounds: {
                    "recreation.gov": [{ id: "A", name: "Camp A", sites: { favorites: [], worthwhile: [] } }],
                },
                globalSettings: {
                    stayLengths: [4, 5],
                    validStartDays: ["Friday"],
                    blackoutDates: [{ from: "2026-08-01", to: "2026-08-03" }],
                },
                updatedAt: "2024-01-02",
            }),
        });
        wire(kv, "boss@example.com");
        const { getDefaultConfig } = await import("./default-config");
        const cfg = await getDefaultConfig();
        expect(cfg.globalSettings.blackoutDates).toEqual([{ from: "2026-08-01", to: "2026-08-03" }]);
        expect(cfg.globalSettings.stayLengths).toEqual([4, 5]);
    });
```

- [ ] **Step 6: Run all affected tests**

Run: `cd next && npx vitest run src/app/api/users/me/campgrounds/route.test.ts src/lib/default-config.test.ts`
Expected: PASS

- [ ] **Step 7: Type-check the entire project**

Run: `cd next && npx tsc --noEmit 2>&1 | head -40`
Expected: Type errors in `availability/route.ts`, `notification-targets/route.ts`, and `app/page.tsx` (these reference `globalSettings.tripWindows` which no longer exists). This is expected and will be fixed in Tasks 4-6. Confirm there are no OTHER unexpected errors beyond those files.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Remove tripWindows from GlobalSettings and campground route

GlobalSettings is now campground-only settings. The campground PUT no
longer validates or prunes trip windows. Default config stops stripping
a field that no longer exists."
```

---

### Task 4: Update Availability Route

**Files:**
- Modify: `next/src/app/api/availability/route.ts:17,20,60,135-139`
- Modify: `next/src/app/api/availability/route.test.ts`

**Interfaces:**
- Consumes: `getUserTripWindows` from `@/lib/user-trip-windows`
- Produces: no interface changes (same response shape)

- [ ] **Step 1: Update the availability route to read trip windows from the new key**

In `next/src/app/api/availability/route.ts`:

Add the import at the top:
```ts
import { getUserTripWindows } from "@/lib/user-trip-windows";
```

Remove `GlobalSettings` from the `@/types/campground` import (line 17) since it's no longer used in `SourceConfig`. Keep the `Campground` import if still needed elsewhere or remove it if only `GlobalSettings` was used. Check usage: `GlobalSettings` is used in the `SourceConfig` interface (line 23-25). Update `SourceConfig`:

```ts
// Before:
interface SourceConfig {
    campgrounds: { "recreation.gov"?: Campground[] };
    globalSettings: GlobalSettings;
}

// After:
interface SourceConfig {
    campgrounds: { "recreation.gov"?: Campground[] };
    globalSettings: { stayLengths: number[]; validStartDays: string[]; blackoutDates?: import("@/types/campground").BlackoutRange[] };
    tripWindows: import("@/types/campground").TripWindow[];
}
```

Update `buildSnapshot` to use `config.tripWindows` instead of `config.globalSettings.tripWindows`:

Line 60, change:
```ts
const tripWins = activeWindowsFor(config.globalSettings.tripWindows, cg.id, todayIso);
```
To:
```ts
const tripWins = activeWindowsFor(config.tripWindows, cg.id, todayIso);
```

Lines 135-139, change:
```ts
        const tripMatches = tripHitsForCampground(
            rawResults,
            cg,
            config.globalSettings.tripWindows,
            todayIso,
        );
```
To:
```ts
        const tripMatches = tripHitsForCampground(
            rawResults,
            cg,
            config.tripWindows,
            todayIso,
        );
```

In the `getHandler` function (lines 159-173), update the authenticated path to fetch trip windows from the new key:

```ts
    if (session) {
        const cached = await adapter.getSnapshot(session.email);
        if (cached) return withCors(jsonResponse(cached));

        const userRecord = await getUserCampgrounds(session.email);
        const tripWindowsRecord = await getUserTripWindows(session.email);
        const config: SourceConfig = {
            campgrounds: userRecord?.campgrounds ?? { "recreation.gov": [] },
            globalSettings: (userRecord?.globalSettings ?? {
                stayLengths: [2, 3, 4, 5],
                validStartDays: ["Friday", "Saturday"],
            }) as SourceConfig["globalSettings"],
            tripWindows: tripWindowsRecord.tripWindows,
        };
        const snapshot = await buildSnapshot(config, adapter);
        await adapter.putSnapshot(session.email, snapshot);
        return withCors(jsonResponse(snapshot));
    }
```

For the anonymous/default path, pass empty trip windows:
```ts
    const defaultConfig = await getDefaultConfig();
    const snapshot = await buildSnapshot({ ...defaultConfig, tripWindows: [] }, adapter);
```

- [ ] **Step 2: Update the availability route test**

In `next/src/app/api/availability/route.test.ts`:

Add the mock for the new module. After the existing mocks:
```ts
vi.mock("@/lib/user-trip-windows");
```

Add the import:
```ts
import * as userTripWindows from "@/lib/user-trip-windows";
```

In the trip-matches test (around line 465), split the mock. Keep the campground mock but remove `tripWindows` from `globalSettings`, and add the trip windows mock:

```ts
        vi.mocked(userCampgrounds.getUserCampgrounds).mockResolvedValue({
            campgrounds: {
                "recreation.gov": [
                    {
                        id: "232358",
                        name: "Test CG",
                        enabled: true,
                        dates: { startDate: "2100-07-01", endDate: "2100-07-31" },
                        sites: { favorites: ["001"], worthwhile: [] },
                    },
                ],
            },
            globalSettings: {
                stayLengths: [7],
                validStartDays: ["Monday"],
            },
            updatedAt: "2026-05-01T00:00:00Z",
        } as never);
        vi.mocked(userTripWindows.getUserTripWindows).mockResolvedValue({
            tripWindows: [{ id: "w1", from: "2100-07-10", to: "2100-07-12" }],
            updatedAt: "2026-08-17T00:00:00.000Z",
        });
```

Also ensure the default `beforeEach` mocks `getUserTripWindows` to return empty so other tests don't break:
```ts
vi.mocked(userTripWindows.getUserTripWindows).mockResolvedValue({
    tripWindows: [],
    updatedAt: null,
});
```

- [ ] **Step 3: Run tests**

Run: `cd next && npx vitest run src/app/api/availability/route.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add next/src/app/api/availability/route.ts next/src/app/api/availability/route.test.ts
git commit -m "Availability route reads trip windows from the dedicated key

SourceConfig now carries tripWindows as a top-level field sourced from
getUserTripWindows instead of globalSettings."
```

---

### Task 5: Update Notification Targets Route

**Files:**
- Modify: `next/src/app/api/admin/notification-targets/route.ts:1-2,6,9-21,47-59`
- Modify: `next/src/app/api/admin/notification-targets/route.test.ts`

**Interfaces:**
- Consumes: `getUserTripWindows` from `@/lib/user-trip-windows`
- Produces: `NotificationTarget` still carries `globalSettings` (for notifier compat) but trip windows come from the new key. Add `tripWindows: TripWindow[]` as a top-level field on `NotificationTarget`.

- [ ] **Step 1: Update the notification-targets route**

In `next/src/app/api/admin/notification-targets/route.ts`:

Add the import:
```ts
import { getUserTripWindows } from "@/lib/user-trip-windows";
import type { TripWindow } from "@/types/campground";
```

Add `tripWindows` to the `NotificationTarget` interface:
```ts
interface NotificationTarget {
    email: string;
    name: string;
    roles: UserRole[];
    notifications: { enabled: boolean; frequencyMinutes: 1 | 5 | 15 | 60 | 240 };
    defaultNotifyScope?: NotifyScope;
    lastNotifiedAt?: string;
    notificationEmail?: string;
    campgrounds: SiteConfig;
    globalSettings: GlobalSettings;
    tripWindows: TripWindow[];
    notifierState: unknown | null;
    pushSubscriptions: PushSubscriptionRecord[];
}
```

In the handler, fetch trip windows from the new key and include them:

```ts
            const userList = await getUserCampgrounds(profile.email);
            const entries = userList?.campgrounds?.["recreation.gov"] ?? [];
            if (entries.length === 0) continue;

            const tripWindowsRecord = await getUserTripWindows(profile.email);
            const notifierState = await kv.get(`user:${profile.email}:notifier-state`, "json");

            const target: NotificationTarget = {
                email: profile.email,
                name: profile.name ?? profile.email,
                roles: profile.roles ?? [],
                notifications: profile.notifications ?? { enabled: true, frequencyMinutes: 15 },
                campgrounds: userList!.campgrounds,
                globalSettings: userList!.globalSettings,
                tripWindows: tripWindowsRecord.tripWindows,
                notifierState: notifierState ?? null,
                pushSubscriptions: await readPushSubs(profile.email),
            };
```

- [ ] **Step 2: Update the notification-targets test**

In the test that checks the happy path (`"excludes users with empty campground lists; sorts by email"`), add trip windows in the new key:

```ts
            "user:bob@x.com:trip-windows": JSON.stringify({
                tripWindows: [{ id: "w1", from: "2100-09-04", to: "2100-09-08" }],
                updatedAt: "2026-08-17T00:00:00.000Z",
            }),
```

Then assert the new field appears on the target:
```ts
        expect(body.targets[0]!.tripWindows).toHaveLength(1);
```

For other tests that don't seed trip windows, assert `tripWindows` is an empty array (the `getUserTripWindows` fallback returns `[]`).

- [ ] **Step 3: Run tests**

Run: `cd next && npx vitest run src/app/api/admin/notification-targets/route.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add next/src/app/api/admin/notification-targets/
git commit -m "Notification targets route reads trip windows from the dedicated key

Adds tripWindows as a top-level field on NotificationTarget, sourced
from getUserTripWindows. The notifier will read from target.tripWindows
instead of target.globalSettings.tripWindows."
```

---

### Task 6: Client Hook + Page Wiring

**Files:**
- Create: `next/src/hooks/use-trip-windows.ts`
- Modify: `next/src/app/app/page.tsx:10,30,36-46,117-129,165-170,336-339`
- Modify: `next/src/components/site-config-dialog/index.test.tsx`

**Interfaces:**
- Consumes: `TripWindow` from `@/types/campground`
- Produces:
  - `useTripWindows()` hook returning `{ tripWindows: TripWindow[]; isLoading: boolean; saveTripWindows: (windows: TripWindow[]) => Promise<void>; syncStatus: "success" | "error" | null; clearSyncStatus: () => void }`
  - `app/page.tsx` wires the new hook into `SiteSettingsContext` and `TripsCard`

- [ ] **Step 1: Create the `useTripWindows` hook**

Create `next/src/hooks/use-trip-windows.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import type { TripWindow } from "@/types/campground";

interface TripWindowsRecord {
    tripWindows: TripWindow[];
    updatedAt: string | null;
}

const ENDPOINT = "/api/users/me/trip-windows";

export interface UseTripWindowsState {
    tripWindows: TripWindow[];
    isLoading: boolean;
    syncStatus: "success" | "error" | null;
    syncError: string | null;
    clearSyncStatus: () => void;
    saveTripWindows: (windows: TripWindow[]) => Promise<void>;
}

export function useTripWindows(): UseTripWindowsState {
    const [record, setRecord] = useState<TripWindowsRecord>({ tripWindows: [], updatedAt: null });
    const [isLoading, setIsLoading] = useState(true);
    const [syncStatus, setSyncStatus] = useState<"success" | "error" | null>(null);
    const [syncError, setSyncError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const r = await fetch(ENDPOINT, { credentials: "include" });
                if (!r.ok) {
                    console.warn(`[useTripWindows] GET returned ${r.status}`);
                    return;
                }
                const data = (await r.json()) as TripWindowsRecord;
                if (!cancelled) setRecord(data);
            } catch (e) {
                console.warn("[useTripWindows] fetch failed:", e);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const saveTripWindows = useCallback(async (windows: TripWindow[]) => {
        try {
            const r = await fetch(ENDPOINT, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tripWindows: windows }),
                credentials: "include",
            });
            if (!r.ok) {
                let message: string | null = null;
                try {
                    const body = (await r.json()) as { error?: string };
                    if (typeof body.error === "string") message = body.error;
                } catch {
                    // ignore parse failure
                }
                setSyncError(message);
                setSyncStatus("error");
                return;
            }
            setSyncError(null);
            const stored = (await r.json()) as TripWindowsRecord;
            setRecord(stored);
            setSyncStatus("success");
        } catch {
            setSyncError(null);
            setSyncStatus("error");
        }
    }, []);

    return {
        tripWindows: record.tripWindows,
        isLoading,
        syncStatus,
        syncError,
        clearSyncStatus: () => {
            setSyncStatus(null);
            setSyncError(null);
        },
        saveTripWindows,
    };
}
```

- [ ] **Step 2: Wire the new hook into `app/page.tsx`**

In `next/src/app/app/page.tsx`:

Add the import:
```ts
import { useTripWindows } from "@/hooks/use-trip-windows";
```

Remove `TripWindow` from the type import on line 30 (it's no longer needed in this file since `handleTripWindowsChange` goes away).

Inside `AppPage()`, add the hook call after `useUserCampgrounds()`:

```ts
    const { tripWindows, saveTripWindows } = useTripWindows();
```

Update the `settings` useMemo (lines 117-129) to source trip windows from the new hook:

```ts
    const settings = useMemo<SiteSettingsValue>(
        () => ({
            dates: {
                stayLengths: globalSettings.stayLengths,
                validStartDays: globalSettings.validStartDays,
                blackoutDates: globalSettings.blackoutDates,
                tripWindows,
            },
            views: { type: "calendar" as const },
            dev: { useMockData },
        }),
        [globalSettings, tripWindows, useMockData],
    );
```

Remove the `handleTripWindowsChange` callback entirely (lines 165-170).

Update the `TripsCard` render (lines 335-342):

```tsx
                                    <TripsCard
                                        tripWindows={tripWindows}
                                        campgrounds={siteConfig["recreation.gov"] ?? []}
                                        campgroundsByAreas={campgroundsByAreas}
                                        onChange={saveTripWindows}
                                        isMobile={isMobile}
                                    />
```

- [ ] **Step 3: Update the config dialog regression test**

In `next/src/components/site-config-dialog/index.test.tsx`, the `"carries tripWindows through when saving"` test is now moot since `GlobalSettings` doesn't carry `tripWindows`. Replace it with a simpler assertion that the dialog doesn't inject unexpected fields:

```ts
    it("does not inject extra fields into globalSettings on save", () => {
        const onSave = vi.fn();
        const gs = {
            stayLengths: [2, 3],
            validStartDays: ["Friday"],
        } as GlobalSettings;
        const data: SiteConfig = {
            "recreation.gov": [{ id: "232447", name: "Test Campground", enabled: true }],
        };
        const { getByRole } = render(
            <SiteConfigDialog
                {...baseProps}
                initialData={data}
                globalSettings={gs}
                onSave={onSave}
                open
                onClose={vi.fn()}
            />,
        );
        getByRole("button", { name: /^save$/i }).click();
        expect(onSave).toHaveBeenCalledTimes(1);
        const [, savedGlobal] = onSave.mock.calls[0]!;
        // Only the fields the dialog manages should be present
        expect(Object.keys(savedGlobal).sort()).toEqual(
            expect.arrayContaining(["stayLengths", "validStartDays"]),
        );
    });
```

- [ ] **Step 4: Type-check the full project**

Run: `cd next && npx tsc --noEmit`
Expected: clean (no errors). All `globalSettings.tripWindows` references have been removed or migrated.

- [ ] **Step 5: Run the full test suite**

Run: `cd next && npx vitest run`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add next/src/hooks/use-trip-windows.ts next/src/app/app/page.tsx next/src/components/site-config-dialog/index.test.tsx
git commit -m "Add useTripWindows hook and wire into the dashboard

Trip windows are now fetched and saved via the dedicated endpoint,
fully independent of the campground config lifecycle."
```

---

### Task 7: Update Notifier to Use Top-Level tripWindows

The notifier reads trip windows from the `notification-targets` response. Task 5 added `target.tripWindows` as a top-level field. This task updates the notifier code to read from that field instead of `target.globalSettings.tripWindows`.

**Files:**
- Modify: `notifier/fetch-jobs.ts:17-18,75-82`
- Modify: `notifier/check.ts:409-422,971`

**Interfaces:**
- Consumes: `NotificationTarget` from the API (now has `tripWindows: TripWindow[]` at top level)
- Produces: no interface changes to downstream consumers

- [ ] **Step 1: Update `PlannableTarget` in fetch-jobs.ts**

In `notifier/fetch-jobs.ts`, the `PlannableTarget` type (line 17-18) references `globalSettings?.tripWindows`. Add `tripWindows` as a top-level field and update the usage:

```ts
// Before:
interface PlannableTarget {
    // ... other fields
    globalSettings?: { tripWindows?: TripWindow[] };
}

// After:
interface PlannableTarget {
    // ... other fields
    tripWindows?: TripWindow[];
    /** @deprecated Read from target.tripWindows instead. Kept for backward compat. */
    globalSettings?: { tripWindows?: TripWindow[] };
}
```

Update `buildPlan` (around line 75) to prefer `target.tripWindows`:

```ts
// Before:
const tripWins = activeWindowsFor(target.globalSettings?.tripWindows, cg.id, todayIso);

// After:
const tripWins = activeWindowsFor(target.tripWindows, cg.id, todayIso);
```

- [ ] **Step 2: Update check.ts**

In `notifier/check.ts`, update `computeMatchesForUser` (around line 409) to read from `target.tripWindows`:

```ts
// Before:
const tripHits = tripHitsForCampground(rawResults, cg, target.globalSettings?.tripWindows, todayIso);

// After:
const tripHits = tripHitsForCampground(rawResults, cg, target.tripWindows, todayIso);
```

Update the `buildTripDigests` call (around line 971) similarly:

```ts
// Before:
const tripDigests = buildTripDigests(newTrips, target.globalSettings?.tripWindows);

// After:
const tripDigests = buildTripDigests(newTrips, target.tripWindows);
```

Search for any other `target.globalSettings?.tripWindows` references in the notifier and update them all.

- [ ] **Step 3: Run notifier tests**

Run: `cd notifier && npx vitest run`
Expected: PASS. The tests construct mock targets; they may need `tripWindows` added at the top level if they currently set `globalSettings.tripWindows`. Check the test fixtures and update as needed, adding `tripWindows: [...]` at the target top level wherever `globalSettings: { tripWindows: [...] }` was used.

- [ ] **Step 4: Run the full next/ test suite too**

Run: `cd next && npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add notifier/
git commit -m "Notifier reads tripWindows from the top-level target field

Matches the updated notification-targets API response. The notifier
no longer digs into target.globalSettings for trip windows."
```

---

### Task 8: Final Verification

Full-project type check and test run to confirm everything is clean.

**Files:** none (verification only)

- [ ] **Step 1: Type-check both packages**

Run: `cd next && npx tsc --noEmit && cd ../notifier && npx tsc --noEmit`
Expected: clean (both pass with no errors, or the pre-existing 2 errors documented in `reference_ab_testing_verification_baseline.md` if that applies to this repo — check)

- [ ] **Step 2: Run all next/ tests**

Run: `cd next && npx vitest run`
Expected: all pass

- [ ] **Step 3: Run all notifier/ tests**

Run: `cd notifier && npx vitest run`
Expected: all pass

- [ ] **Step 4: Run prettier**

Run: `cd next && npx prettier --check 'src/**/*.{ts,tsx}' && cd ../notifier && npx prettier --check '**/*.ts'`
Expected: clean (no formatting issues). If there are issues, run `npx prettier --write` and commit.

- [ ] **Step 5: Final commit (if any formatting fixes)**

```bash
git add -A
git commit -m "Format"
```
