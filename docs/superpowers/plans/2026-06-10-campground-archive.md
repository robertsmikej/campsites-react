# Previously-Watched Campground Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Removed campgrounds are auto-archived server-side and can be re-added (full config, fresh season dates) from a "Previously watched" section in the Add Campground modal.

**Architecture:** The PUT save handler diffs prior vs incoming campground IDs and upserts dropped ones (full config + `removedAt`) into a per-user KV archive — best-effort, never failing the save. A session-authed GET route serves the archive. The CampgroundLookup dashboard variant fetches it, lists entries not currently on the watchlist, and re-adds via the existing save flow with `restoreCampground()` (keeps sites/scopes, resets dates via `defaultDates()`, strips `checkPriority`).

**Tech Stack:** Next.js App Router routes, Cloudflare KV via `getKv()`, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-10-campground-archive-design.md`

**Repo rules (campwatch):** Commit directly to `main`. **NEVER `git push` or deploy without Mike's explicit go-ahead.** Stage only files you change (worktree has unrelated dirty files: `.gitignore`, `next/src/components/dashboard/timeline/availability-block.tsx`). Before any commit involving `next/`: `npx tsc --noEmit && npx vitest run && npm run format:check` from `next/` — CI runs Prettier and will fail on unformatted files.

---

## File structure

| File | Responsibility |
|---|---|
| `next/src/lib/campground-archive.ts` (create) | Archive types, KV get/upsert helpers, 50-cap, `restoreCampground()` |
| `next/src/lib/campground-archive.test.ts` (create) | Unit tests for the lib |
| `next/src/app/api/users/me/campgrounds/route.ts` (modify) | Diff prior vs incoming in `putHandler`, best-effort archive write |
| `next/src/app/api/users/me/campgrounds/route.test.ts` (modify) | Archival-on-removal tests |
| `next/src/app/api/users/me/campgrounds/archive/route.ts` (create) | Session-authed GET returning the archive |
| `next/src/app/api/users/me/campgrounds/archive/route.test.ts` (create) | GET route tests |
| `next/src/components/campground-lookup.tsx` (modify) | "Previously watched" section in the dashboard variant + re-add handler |
| `next/src/components/campground-lookup.test.tsx` (modify) | Section render/re-add/homepage-exclusion tests |

---

### Task 1: Archive storage lib

**Files:**
- Create: `next/src/lib/campground-archive.ts`
- Test: `next/src/lib/campground-archive.test.ts`

- [ ] **Step 1: Write the failing tests**

Look at `next/src/lib/user-campgrounds.test.ts` first and mirror its mocking approach for `@/lib/cloudflare` (vi.mock + `createMockKv` from `@/lib/__mocks__/cloudflare-test-helpers`, `vi.mocked(cloudflare.getKv).mockReturnValue(kv)`). Create `next/src/lib/campground-archive.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));

import * as cloudflare from "@/lib/cloudflare";
import {
    getCampgroundArchive,
    archiveRemovedCampgrounds,
    restoreCampground,
    ARCHIVE_CAP,
    type ArchivedCampground,
} from "./campground-archive";
import { defaultDates } from "./default-dates";
import type { Campground } from "@/types/campground";

beforeEach(() => {
    vi.clearAllMocks();
});

function cg(id: string, extra: Partial<Campground> = {}): Campground {
    return {
        id,
        name: `Camp ${id}`,
        sites: { favorites: [`${id}-fav`], worthwhile: [] },
        ...extra,
    };
}

const KEY = "user:mike@example.com:campground-archive";

describe("getCampgroundArchive", () => {
    it("returns an empty archive when none exists", async () => {
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const a = await getCampgroundArchive("mike@example.com");
        expect(a.campgrounds).toEqual([]);
    });

    it("returns entries sorted by removedAt descending", async () => {
        const stored = {
            campgrounds: [
                { ...cg("1"), removedAt: "2026-01-01T00:00:00.000Z" },
                { ...cg("2"), removedAt: "2026-06-01T00:00:00.000Z" },
            ],
        };
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv({ [KEY]: JSON.stringify(stored) }));
        const a = await getCampgroundArchive("mike@example.com");
        expect(a.campgrounds.map((c) => c.id)).toEqual(["2", "1"]);
    });
});

describe("archiveRemovedCampgrounds", () => {
    it("appends removed campgrounds with removedAt", async () => {
        const kv = createMockKv();
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        await archiveRemovedCampgrounds("mike@example.com", [cg("9")], "2026-06-10T00:00:00.000Z");
        const stored = JSON.parse((await kv.get(KEY)) as string) as {
            campgrounds: ArchivedCampground[];
        };
        expect(stored.campgrounds).toHaveLength(1);
        expect(stored.campgrounds[0]).toMatchObject({
            id: "9",
            sites: { favorites: ["9-fav"], worthwhile: [] },
            removedAt: "2026-06-10T00:00:00.000Z",
        });
    });

    it("upserts by id — a newer removal replaces the older entry", async () => {
        const prior = {
            campgrounds: [{ ...cg("9", { name: "Old Name" }), removedAt: "2026-01-01T00:00:00.000Z" }],
        };
        const kv = createMockKv({ [KEY]: JSON.stringify(prior) });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        await archiveRemovedCampgrounds(
            "mike@example.com",
            [cg("9", { name: "New Name" })],
            "2026-06-10T00:00:00.000Z",
        );
        const stored = JSON.parse((await kv.get(KEY)) as string) as {
            campgrounds: ArchivedCampground[];
        };
        expect(stored.campgrounds).toHaveLength(1);
        expect(stored.campgrounds[0]).toMatchObject({ name: "New Name", removedAt: "2026-06-10T00:00:00.000Z" });
    });

    it("caps the archive at ARCHIVE_CAP newest entries", async () => {
        const prior = {
            campgrounds: Array.from({ length: ARCHIVE_CAP }, (_, i) => ({
                ...cg(`old-${i}`),
                removedAt: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
            })),
        };
        const kv = createMockKv({ [KEY]: JSON.stringify(prior) });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        await archiveRemovedCampgrounds("mike@example.com", [cg("newest")], "2026-06-10T00:00:00.000Z");
        const stored = JSON.parse((await kv.get(KEY)) as string) as {
            campgrounds: ArchivedCampground[];
        };
        expect(stored.campgrounds).toHaveLength(ARCHIVE_CAP);
        expect(stored.campgrounds[0]?.id).toBe("newest");
        // the oldest entry fell off
        expect(stored.campgrounds.some((c) => c.removedAt === "2026-01-01T00:00:00.000Z")).toBe(false);
    });
});

describe("restoreCampground", () => {
    it("keeps config, resets dates to the season default, strips checkPriority and removedAt", () => {
        const archived: ArchivedCampground = {
            ...cg("7", {
                notifyScope: "favorites",
                stayLengths: [2, 3],
                validStartDays: ["Friday"],
                checkPriority: "high",
                enabled: false,
                dates: { startDate: "2025-05-01", endDate: "2025-09-30" },
            }),
            removedAt: "2025-10-01T00:00:00.000Z",
        };
        const restored = restoreCampground(archived);
        expect(restored).toMatchObject({
            id: "7",
            sites: { favorites: ["7-fav"], worthwhile: [] },
            notifyScope: "favorites",
            stayLengths: [2, 3],
            validStartDays: ["Friday"],
            enabled: true,
        });
        expect(restored.dates).toEqual(defaultDates());
        expect("checkPriority" in restored).toBe(false);
        expect("removedAt" in restored).toBe(false);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/lib/campground-archive.test.ts`
Expected: FAIL — module `./campground-archive` does not exist.

- [ ] **Step 3: Implement the lib**

Create `next/src/lib/campground-archive.ts`:

```ts
import { getKv } from "./cloudflare";
import { defaultDates } from "./default-dates";
import type { Campground } from "@/types/campground";

export interface ArchivedCampground extends Campground {
    removedAt: string; // ISO timestamp of when it left the watchlist
}

export interface CampgroundArchive {
    campgrounds: ArchivedCampground[];
}

/** Newest-first cap — beyond this, the oldest removals fall off. */
export const ARCHIVE_CAP = 50;

function key(email: string): string {
    return `user:${email}:campground-archive`;
}

function sortNewestFirst(entries: ArchivedCampground[]): ArchivedCampground[] {
    return [...entries].sort((a, b) => b.removedAt.localeCompare(a.removedAt));
}

export async function getCampgroundArchive(email: string): Promise<CampgroundArchive> {
    const stored = (await getKv().get(key(email), "json")) as CampgroundArchive | null;
    return { campgrounds: sortNewestFirst(stored?.campgrounds ?? []) };
}

/** Upsert removed campgrounds (full config as-it-was) into the user's archive. */
export async function archiveRemovedCampgrounds(
    email: string,
    removed: Campground[],
    removedAt: string,
): Promise<void> {
    if (removed.length === 0) return;
    const existing = await getCampgroundArchive(email);
    const removedIds = new Set(removed.map((c) => c.id));
    const kept = existing.campgrounds.filter((c) => !removedIds.has(c.id));
    const added: ArchivedCampground[] = removed.map((c) => ({ ...c, removedAt }));
    const campgrounds = sortNewestFirst([...kept, ...added]).slice(0, ARCHIVE_CAP);
    await getKv().put(key(email), JSON.stringify({ campgrounds }));
}

/** Build a re-addable Campground from an archive entry: full prior config,
 *  fresh season-capped dates, Normal check tier (a stale "high" must not
 *  silently eat the 3-slot cap), enabled. */
export function restoreCampground(entry: ArchivedCampground): Campground {
    const { removedAt: _removedAt, checkPriority: _checkPriority, ...rest } = entry;
    return {
        ...rest,
        dates: defaultDates(),
        enabled: true,
    };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/lib/campground-archive.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Typecheck, format, commit**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx tsc --noEmit && npx prettier --write src/lib/campground-archive.ts src/lib/campground-archive.test.ts && npm run format:check
cd /Users/mikeroberts/Code/campwatch
git add next/src/lib/campground-archive.ts next/src/lib/campground-archive.test.ts
git commit -m "feat: campground archive storage lib"
```

---

### Task 2: Auto-archive on removal in the PUT handler

**Files:**
- Modify: `next/src/app/api/users/me/campgrounds/route.ts` (`putHandler`)
- Test: `next/src/app/api/users/me/campgrounds/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the `describe("PUT /api/users/me/campgrounds", ...)` block in `route.test.ts` (reuse the file's session/KV mock pattern; `createMockKv` seeds keys via its constructor object):

```ts
const ARCHIVE_KEY = "user:user@example.com:campground-archive";

function sessionFor(email = "user@example.com") {
    vi.mocked(sessions.readSession).mockResolvedValue({
        id: "x",
        email,
        createdAt: "x",
        expiresAt: "x",
    });
}

it("archives a removed campground with its full config", async () => {
    sessionFor();
    const prior = {
        campgrounds: {
            "recreation.gov": [
                {
                    id: "1",
                    name: "Keeper",
                    sites: { favorites: [], worthwhile: [] },
                },
                {
                    id: "2",
                    name: "Dropped",
                    notifyScope: "favorites",
                    sites: { favorites: ["007"], worthwhile: ["010"] },
                },
            ],
        },
        globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
        updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const kv = createMockKv({ "user:user@example.com:campgrounds": JSON.stringify(prior) });
    vi.mocked(cloudflare.getKv).mockReturnValue(kv);

    const res = await doPut({
        campgrounds: {
            "recreation.gov": [{ id: "1", name: "Keeper", sites: { favorites: [], worthwhile: [] } }],
        },
        globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
    });
    expect(res.status).toBe(200);

    const archive = JSON.parse((await kv.get(ARCHIVE_KEY)) as string) as {
        campgrounds: Array<{ id: string; removedAt?: string; sites?: { favorites: string[] } }>;
    };
    expect(archive.campgrounds).toHaveLength(1);
    expect(archive.campgrounds[0]).toMatchObject({
        id: "2",
        name: "Dropped",
        notifyScope: "favorites",
        sites: { favorites: ["007"], worthwhile: ["010"] },
    });
    expect(typeof archive.campgrounds[0]?.removedAt).toBe("string");
});

it("does not write the archive when nothing was removed", async () => {
    sessionFor();
    const prior = {
        campgrounds: {
            "recreation.gov": [{ id: "1", name: "Keeper", sites: { favorites: [], worthwhile: [] } }],
        },
        globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
        updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const kv = createMockKv({ "user:user@example.com:campgrounds": JSON.stringify(prior) });
    vi.mocked(cloudflare.getKv).mockReturnValue(kv);

    const res = await doPut({
        campgrounds: {
            "recreation.gov": [
                { id: "1", name: "Keeper renamed", sites: { favorites: [], worthwhile: [] } },
                { id: "3", name: "Added", sites: { favorites: [], worthwhile: [] } },
            ],
        },
        globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
    });
    expect(res.status).toBe(200);
    expect(await kv.get(ARCHIVE_KEY)).toBeNull();
});

it("save succeeds even when the archive write fails", async () => {
    sessionFor();
    const prior = {
        campgrounds: {
            "recreation.gov": [{ id: "2", name: "Dropped", sites: { favorites: [], worthwhile: [] } }],
        },
        globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
        updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const kv = createMockKv({ "user:user@example.com:campgrounds": JSON.stringify(prior) });
    const failingKv = {
        ...kv,
        put: vi.fn(async (k: string, v: string) => {
            if (k.includes("campground-archive")) throw new Error("KV boom");
            return kv.put(k, v);
        }),
    };
    vi.mocked(cloudflare.getKv).mockReturnValue(failingKv as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await doPut({
        campgrounds: { "recreation.gov": [] },
        globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
    });
    expect(res.status).toBe(200);
    expect(errSpy).toHaveBeenCalled();
});
```

(If the existing tests construct sessions inline, the `sessionFor` helper is new — place it near `cgWithPriority`. If `doPut`'s shape differs, follow the file.)

- [ ] **Step 2: Run tests to verify the first and third fail**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/app/api/users/me/campgrounds/route.test.ts`
Expected: "archives a removed campground" FAILS (archive key never written). "does not write" passes trivially. "save succeeds even when" may pass or fail depending on ordering — after implementation all three must pass.

- [ ] **Step 3: Implement the diff + best-effort archive in putHandler**

In `route.ts`, add imports:

```ts
import { archiveRemovedCampgrounds } from "@/lib/campground-archive";
import type { Campground } from "@/types/campground";
```

In `putHandler`, the current tail is:

```ts
const stored = await putUserCampgrounds(session.email, body as never);

const adapter = new WorkerKvAdapter(getKv());
await adapter.deleteSnapshot(session.email);

return withCors(jsonResponse(stored));
```

Replace with:

```ts
// Read the prior record BEFORE overwriting so removals can be archived.
const prior = await getUserCampgrounds(session.email).catch(() => null);

const stored = await putUserCampgrounds(session.email, body as never);

// Best-effort: archive campgrounds that were just removed (full prior config),
// so they can be one-click re-added next season. Never fails the save.
try {
    const priorList = (prior?.campgrounds["recreation.gov"] ?? []) as Campground[];
    const incomingIds = new Set(
        (body.campgrounds["recreation.gov"] as Array<{ id?: string }>)
            .map((c) => c?.id)
            .filter((id): id is string => typeof id === "string"),
    );
    const removed = priorList.filter((c) => !incomingIds.has(c.id));
    await archiveRemovedCampgrounds(session.email, removed, new Date().toISOString());
} catch (e) {
    console.error("[archive] failed to archive removed campgrounds:", (e as Error).message);
}

const adapter = new WorkerKvAdapter(getKv());
await adapter.deleteSnapshot(session.email);

return withCors(jsonResponse(stored));
```

(`getUserCampgrounds` is already imported in this file.)

- [ ] **Step 4: Run the route tests**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/app/api/users/me/campgrounds/route.test.ts`
Expected: ALL pass (pre-existing + 3 new).

- [ ] **Step 5: Typecheck, format, commit**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx tsc --noEmit && npx prettier --write src/app/api/users/me/campgrounds/route.ts src/app/api/users/me/campgrounds/route.test.ts && npm run format:check
cd /Users/mikeroberts/Code/campwatch
git add next/src/app/api/users/me/campgrounds/route.ts next/src/app/api/users/me/campgrounds/route.test.ts
git commit -m "feat: auto-archive removed campgrounds on save"
```

---

### Task 3: GET archive route

**Files:**
- Create: `next/src/app/api/users/me/campgrounds/archive/route.ts`
- Test: `next/src/app/api/users/me/campgrounds/archive/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `archive/route.test.ts` (same mock scaffolding as the sibling `route.test.ts`):

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

async function doGet(): Promise<Response> {
    const { GET } = await import("./route");
    return GET(new Request("https://example.com/api/users/me/campgrounds/archive"));
}

describe("GET /api/users/me/campgrounds/archive", () => {
    it("returns 401 when not signed in", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        const res = await doGet();
        expect(res.status).toBe(401);
    });

    it("returns an empty archive for a fresh user", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "user@example.com",
            createdAt: "x",
            expiresAt: "x",
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await doGet();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ campgrounds: [] });
    });

    it("returns archived entries newest first", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "user@example.com",
            createdAt: "x",
            expiresAt: "x",
        });
        const stored = {
            campgrounds: [
                {
                    id: "1",
                    name: "Older",
                    sites: { favorites: [], worthwhile: [] },
                    removedAt: "2026-01-01T00:00:00.000Z",
                },
                {
                    id: "2",
                    name: "Newer",
                    sites: { favorites: [], worthwhile: [] },
                    removedAt: "2026-06-01T00:00:00.000Z",
                },
            ],
        };
        vi.mocked(cloudflare.getKv).mockReturnValue(
            createMockKv({ "user:user@example.com:campground-archive": JSON.stringify(stored) }),
        );
        const res = await doGet();
        const body = (await res.json()) as { campgrounds: Array<{ id: string }> };
        expect(body.campgrounds.map((c) => c.id)).toEqual(["2", "1"]);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/app/api/users/me/campgrounds/archive/route.test.ts`
Expected: FAIL — `./route` does not exist.

- [ ] **Step 3: Implement the route**

Create `archive/route.ts`:

```ts
import { readSession } from "@/lib/sessions";
import { jsonResponse, withCors } from "@/lib/responses";
import { getCampgroundArchive } from "@/lib/campground-archive";
import { withErrorLogging } from "@/lib/route-helpers";

async function getHandler(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    const archive = await getCampgroundArchive(session.email);
    return withCors(jsonResponse(archive));
}
export const GET = withErrorLogging(getHandler, "GET /api/users/me/campgrounds/archive");
```

- [ ] **Step 4: Run to verify pass**

Same command as Step 2. Expected: 3 tests PASS.

- [ ] **Step 5: Typecheck, format, commit**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx tsc --noEmit && npx prettier --write "src/app/api/users/me/campgrounds/archive/" && npm run format:check
cd /Users/mikeroberts/Code/campwatch
git add next/src/app/api/users/me/campgrounds/archive/
git commit -m "feat: GET route for the campground archive"
```

---

### Task 4: "Previously watched" section in the modal

**Files:**
- Modify: `next/src/components/campground-lookup.tsx` (dashboard variant)
- Test: `next/src/components/campground-lookup.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `campground-lookup.test.tsx`, the `beforeEach` mocks `globalThis.fetch`. Extend that mock to answer the archive route, and add tests. Update the existing fetch mock implementation to:

```ts
vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes("/api/users/me/campgrounds/archive")) {
        return new Response(
            JSON.stringify({
                campgrounds: [
                    {
                        id: "888",
                        name: "Alturas Inlet",
                        sites: { favorites: ["015"], worthwhile: [] },
                        notifyScope: "favorites",
                        checkPriority: "high",
                        dates: { startDate: "2025-05-01", endDate: "2025-09-30" },
                        removedAt: "2025-10-02T00:00:00.000Z",
                    },
                ],
            }),
            { status: 200 },
        );
    }
    if (u.includes("/details")) {
        return new Response(JSON.stringify({ name: "Bench Lakes", previewImageUrl: null }), {
            status: 200,
        });
    }
    return new Response("[]", { status: 200 });
});
```

New tests in the `describe("CampgroundLookup variants", ...)` block:

```ts
it("dashboard variant lists previously watched campgrounds", async () => {
    render(<CampgroundLookup variant="dashboard" />);
    await waitFor(() => expect(screen.getByText("Alturas Inlet")).toBeTruthy());
    expect(screen.getByText(/previously watched/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /re-add/i })).toBeTruthy();
});

it("re-add saves the restored config with fresh dates and no checkPriority", async () => {
    const save = vi.fn(async (_config: unknown, _gs: unknown) => {});
    vi.mocked(useUserCampgrounds).mockReturnValue({
        isHydrating: false,
        siteConfig: { "recreation.gov": [] },
        globalSettings: { stayLengths: [2, 3], validStartDays: ["Friday"] },
        missingFromDefault: [],
        save,
    } as never);

    render(<CampgroundLookup variant="dashboard" />);
    await waitFor(() => expect(screen.getByText("Alturas Inlet")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /re-add/i }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    const savedConfig = save.mock.calls[0]?.[0] as {
        "recreation.gov": Array<Record<string, unknown>>;
    };
    const readded = savedConfig["recreation.gov"].find((c) => c.id === "888");
    expect(readded).toMatchObject({
        name: "Alturas Inlet",
        sites: { favorites: ["015"], worthwhile: [] },
        notifyScope: "favorites",
        enabled: true,
    });
    expect(readded?.dates).toEqual(defaultDates());
    expect(readded && "checkPriority" in readded).toBe(false);
    expect(readded && "removedAt" in readded).toBe(false);
});

it("hides previously watched entries already on the watchlist", async () => {
    vi.mocked(useUserCampgrounds).mockReturnValue({
        isHydrating: false,
        siteConfig: {
            "recreation.gov": [{ id: "888", name: "Alturas Inlet", sites: { favorites: [], worthwhile: [] } }],
        },
        globalSettings: { stayLengths: [2, 3], validStartDays: ["Friday"] },
        missingFromDefault: [],
        save: vi.fn(async () => {}),
    } as never);

    render(<CampgroundLookup variant="dashboard" />);
    // Give the archive fetch a tick to land, then confirm nothing rendered.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/previously watched/i)).toBeNull();
});

it("homepage variant never fetches or shows the archive", async () => {
    render(<CampgroundLookup />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/previously watched/i)).toBeNull();
    const fetchCalls = vi.mocked(globalThis.fetch).mock.calls.map((c) => String(c[0]));
    expect(fetchCalls.some((u) => u.includes("/campgrounds/archive"))).toBe(false);
});
```

Note: the per-test `useUserCampgrounds` overrides require resetting to the default in the module-level mock between tests — the existing file already defines the default in `vi.mock`; use `vi.mocked(useUserCampgrounds).mockReturnValue(...)` per test and rely on `vi.restoreAllMocks`/the mock factory default in `afterEach` (follow whatever the file already does for the season-cap test, which uses the same pattern).

- [ ] **Step 2: Run to verify the new tests fail**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/components/campground-lookup.test.tsx`
Expected: the 4 new tests FAIL (no archive fetch, no section); pre-existing tests still pass.

- [ ] **Step 3: Implement the section**

In `campground-lookup.tsx`:

a) Imports — add `useEffect` to the React import; add:

```ts
import { restoreCampground, type ArchivedCampground } from "@/lib/campground-archive";
```

b) State + fetch + derived list (inside `CampgroundLookup`, after the existing state declarations; hooks must run on both variants, so the gate lives inside the effect):

```ts
const [archive, setArchive] = useState<ArchivedCampground[]>([]);

// Previously-watched archive (dashboard variant only).
useEffect(() => {
    if (!isDashboard) return;
    let cancelled = false;
    void (async () => {
        try {
            const r = await fetch("/api/users/me/campgrounds/archive", { credentials: "include" });
            if (!r.ok) return;
            const data = (await r.json()) as { campgrounds: ArchivedCampground[] };
            if (!cancelled) setArchive(data.campgrounds ?? []);
        } catch {
            // Best-effort — the section just doesn't render.
        }
    })();
    return () => {
        cancelled = true;
    };
}, [isDashboard]);

const activeIds = useMemo(
    () => new Set((userCampgrounds.siteConfig["recreation.gov"] ?? []).map((c) => c.id)),
    [userCampgrounds.siteConfig],
);
const previouslyWatched = archive.filter((a) => !activeIds.has(a.id));

const handleReadd = useCallback(
    async (entry: ArchivedCampground) => {
        const existing = userCampgrounds.siteConfig["recreation.gov"] ?? [];
        const nextConfig: SiteConfig = {
            ...userCampgrounds.siteConfig,
            "recreation.gov": [...existing, restoreCampground(entry)],
        };
        setAdding(true);
        try {
            await userCampgrounds.save(nextConfig, userCampgrounds.globalSettings);
        } finally {
            setAdding(false);
        }
    },
    [userCampgrounds],
);
```

c) Render block — in the dashboard variant's JSX, directly after the input-row `</div>` and before the search-results block:

```tsx
{previouslyWatched.length > 0 && (
    <div className="mt-[18px] bg-cw-cream border-[1.5px] border-cw-ink">
        <div className="font-mono-field text-[12px] leading-none tracking-[0.18em] uppercase text-cw-clay py-3 px-[18px] border-b border-cw-rule font-bold">
            Previously watched
        </div>
        <ul className="list-none m-0 p-0">
            {previouslyWatched.map((a) => (
                <li
                    key={a.id}
                    className="flex items-center justify-between gap-3 border-t border-dashed border-cw-rule py-[12px] px-[18px] first:border-t-0"
                >
                    <div className="min-w-0">
                        <div className="font-poster text-[16px] leading-[1.05] uppercase tracking-[0.005em] font-black truncate">
                            {a.name}
                        </div>
                        <div className="font-mono-field text-[11px] leading-none text-cw-ink-soft tracking-[0.14em] mt-[5px] uppercase font-medium">
                            ID {a.id} · removed {new Date(a.removedAt).toLocaleDateString()}
                        </div>
                    </div>
                    <button
                        onClick={() => void handleReadd(a)}
                        disabled={adding}
                        className="font-poster text-[11px] leading-none tracking-[0.14em] uppercase text-cw-cream border-none rounded-[2px] cursor-pointer whitespace-nowrap font-extrabold"
                        style={{
                            background: adding ? C.inkSoft : C.forest,
                            padding: "10px 14px",
                            cursor: adding ? "not-allowed" : "pointer",
                        }}
                    >
                        Re-add
                    </button>
                </li>
            ))}
        </ul>
    </div>
)}
```

After a successful re-add, `userCampgrounds.siteConfig` updates (the hook refreshes its local state on save), `activeIds` recomputes, and the row disappears. No extra success state needed.

- [ ] **Step 4: Run the component tests**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/components/campground-lookup.test.tsx`
Expected: ALL pass (pre-existing 5 + new 4). If the row doesn't disappear in the re-add test, that's fine — the test only asserts the save payload.

- [ ] **Step 5: Typecheck, format, commit**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx tsc --noEmit && npx prettier --write src/components/campground-lookup.tsx src/components/campground-lookup.test.tsx && npm run format:check
cd /Users/mikeroberts/Code/campwatch
git add next/src/components/campground-lookup.tsx next/src/components/campground-lookup.test.tsx
git commit -m "feat: previously-watched re-add section in the add-campground modal"
```

---

### Task 5: Full verification (deploy gated)

- [ ] **Step 1: Full check**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx tsc --noEmit && npx vitest run && npm run lint && npm run format:check
```

Expected: everything clean (≈515+ tests). The notifier is untouched by this feature — no notifier run needed, but `cd ../notifier && npx tsc --noEmit` is cheap insurance against accidental cross-imports.

- [ ] **Step 2: STOP — no push/deploy without Mike's explicit OK**

A push deploys the next app to prod. Present: commits ready, tests green, ask to ship. (No worker deploy needed — this feature is next-app only.)

---

## Self-review notes

- **Spec coverage:** storage+cap+restore (T1), PUT diff + best-effort (T2), GET route (T3), modal section + re-add + active-ID filtering + homepage exclusion (T4), verification + gate (T5).
- **Type consistency:** `ArchivedCampground`/`getCampgroundArchive`/`archiveRemovedCampgrounds`/`restoreCampground`/`ARCHIVE_CAP` defined in T1 and used with those exact names in T2–T4.
- **Judgment calls encoded:** archive entries never deleted on re-add (UI filters); `restoreCampground` strips `checkPriority` and forces `enabled: true`; archive write happens after the main save so a failed save archives nothing.
