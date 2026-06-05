# Unify Default List and Curator Watchlist — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public default campground list and the curator's logged-in watchlist the same data, read live from one KV record, so they can never drift.

**Architecture:** A new `lib/default-config.ts` resolves "the default" to the primary curator's `user:{email}:campgrounds` record (catalog fallback). Every default reader calls it; the separate `config:campgrounds` key, its `PUT /api/default` writer, the curator write-through, and the admin "Edit default list" editor are removed. A one-time `POST /api/admin/migrate` reconcile merges the two drifted lists into the curator record (union by id, dashboard wins) then deletes the old key.

**Tech Stack:** Next.js 16 App Router on Cloudflare Workers, TypeScript, Cloudflare KV, Vitest. Run from `next/`: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm run cf:build`.

**Working dir for all commands:** `/Users/mikeroberts/Code/campwatch/next`

**Branch / push policy (CampWatch):** Committing directly to `main` locally is fine; do NOT `git push` — Mike pushes/deploys explicitly. The production data reconcile (Task 8) is operational and Mike-triggered.

---

## File Map

**Create:**
- `next/src/lib/default-config.ts` — `resolveDefaultOwnerEmail()`, `getDefaultConfig()`. Single seam for "what is the default."
- `next/src/lib/default-config.test.ts` — unit/integration tests for the resolver.

**Modify (readers → call `getDefaultConfig()`):**
- `next/src/app/api/default/route.ts` — `GET` delegates; delete `PUT`.
- `next/src/app/api/availability/route.ts` — anonymous branch.
- `next/src/app/api/users/me/campgrounds/clone-default/route.ts`
- `next/src/app/api/users/me/campgrounds/items/route.ts`
- `next/src/app/api/admin/users/route.ts` — new-user clone.

**Modify (writers removed / repurposed):**
- `next/src/app/api/users/me/campgrounds/route.ts` — delete curator write-through.
- `next/src/app/api/admin/migrate/route.ts` — rewrite as one-time reconcile.
- `next/src/app/app/admin/page.tsx` — remove "Edit default list" dialog/state/handlers; update migrate copy + `MigrateResult` type.

**Modify (tests):**
- `next/src/app/api/default/route.test.ts`
- `next/src/app/api/availability/route.test.ts`
- `next/src/app/api/users/me/campgrounds/clone-default/route.test.ts`
- `next/src/app/api/users/me/campgrounds/items/route.test.ts`
- `next/src/app/api/users/me/campgrounds/route.test.ts`
- `next/src/app/api/admin/users/route.test.ts`
- `next/src/app/api/admin/migrate/route.test.ts`

---

## Task 1: `getDefaultConfig()` resolver + tests

**Files:**
- Create: `next/src/lib/default-config.ts`
- Test: `next/src/lib/default-config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `next/src/lib/default-config.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

// Mock only the Cloudflare seam; lib/users + lib/user-campgrounds run for real
// against the mock KV so we exercise the real resolution path.
vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));

import * as cloudflare from "@/lib/cloudflare";

beforeEach(() => {
    vi.clearAllMocks();
});

function wire(kv: ReturnType<typeof createMockKv>, bootstrap?: string) {
    vi.mocked(cloudflare.getKv).mockReturnValue(kv);
    vi.mocked(cloudflare.getEnv).mockReturnValue({
        BOOTSTRAP_ADMIN_EMAIL: bootstrap,
        SUBSCRIBERS: kv,
    } as never);
}

const curatorProfile = (email: string) =>
    JSON.stringify({ email, name: "C", roles: ["curator"], createdAt: "2024-01-01" });
const record = (campgroundIds: string[], stayLengths = [2, 3]) =>
    JSON.stringify({
        campgrounds: {
            "recreation.gov": campgroundIds.map((id) => ({
                id,
                name: `Camp ${id}`,
                sites: { favorites: [], worthwhile: [] },
            })),
        },
        globalSettings: { stayLengths, validStartDays: ["Friday"] },
        updatedAt: "2024-01-02",
    });

describe("resolveDefaultOwnerEmail", () => {
    it("returns the bootstrap admin when they hold the curator role", async () => {
        const kv = createMockKv({
            "user:boss@example.com:profile": curatorProfile("boss@example.com"),
        });
        wire(kv, "boss@example.com");
        const { resolveDefaultOwnerEmail } = await import("./default-config");
        expect(await resolveDefaultOwnerEmail()).toBe("boss@example.com");
    });

    it("falls back to the first curator when bootstrap is unset", async () => {
        const kv = createMockKv({
            "user:someone@example.com:profile": curatorProfile("someone@example.com"),
        });
        wire(kv, undefined);
        const { resolveDefaultOwnerEmail } = await import("./default-config");
        expect(await resolveDefaultOwnerEmail()).toBe("someone@example.com");
    });

    it("returns null when there is no curator", async () => {
        const kv = createMockKv({});
        wire(kv, "boss@example.com");
        const { resolveDefaultOwnerEmail } = await import("./default-config");
        expect(await resolveDefaultOwnerEmail()).toBeNull();
    });
});

describe("getDefaultConfig", () => {
    it("returns the owner's watchlist record when present", async () => {
        const kv = createMockKv({
            "user:boss@example.com:profile": curatorProfile("boss@example.com"),
            "user:boss@example.com:campgrounds": record(["A", "B"], [4, 5]),
        });
        wire(kv, "boss@example.com");
        const { getDefaultConfig } = await import("./default-config");
        const cfg = await getDefaultConfig();
        expect(cfg.campgrounds["recreation.gov"].map((c) => c.id)).toEqual(["A", "B"]);
        expect(cfg.globalSettings.stayLengths).toEqual([4, 5]);
    });

    it("falls back to the in-repo catalog when the owner has no record", async () => {
        const kv = createMockKv({
            "user:boss@example.com:profile": curatorProfile("boss@example.com"),
        });
        wire(kv, "boss@example.com");
        const { getDefaultConfig } = await import("./default-config");
        const cfg = await getDefaultConfig();
        expect(cfg.campgrounds["recreation.gov"].length).toBeGreaterThan(0);
    });

    it("falls back to the catalog when there is no curator at all", async () => {
        const kv = createMockKv({});
        wire(kv, undefined);
        const { getDefaultConfig } = await import("./default-config");
        const cfg = await getDefaultConfig();
        expect(cfg.campgrounds["recreation.gov"].length).toBeGreaterThan(0);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/default-config.test.ts`
Expected: FAIL — `Cannot find module './default-config'`.

- [ ] **Step 3: Write the implementation**

Create `next/src/lib/default-config.ts`:

```ts
import { getEnv } from "@/lib/cloudflare";
import { getUserProfile, listCurators } from "@/lib/users";
import { getUserCampgrounds } from "@/lib/user-campgrounds";
import { buildDefaultFromCatalog } from "@/data/build-default";
import type { GlobalSettings, SiteConfig } from "@/types/campground";

export interface DefaultConfig {
    campgrounds: SiteConfig;
    globalSettings: GlobalSettings;
}

/**
 * Email of the curator whose watchlist IS the public default.
 * Fast path: BOOTSTRAP_ADMIN_EMAIL when that user holds the curator role
 * (one KV get). Cold path: first curator from listCurators() (KV scan).
 * Null when no curator exists yet.
 */
export async function resolveDefaultOwnerEmail(): Promise<string | null> {
    const bootstrap = getEnv().BOOTSTRAP_ADMIN_EMAIL;
    if (bootstrap) {
        const profile = await getUserProfile(bootstrap);
        if (profile?.roles?.includes("curator") && profile.email) {
            return profile.email;
        }
    }
    const curators = await listCurators();
    return curators[0] ?? null;
}

/**
 * The single source of truth for "the default list". Resolves the primary
 * curator's watchlist record live; falls back to the in-repo catalog when no
 * curator or record exists yet. Shape matches the historical GET /api/default
 * body so existing consumers are unaffected.
 */
export async function getDefaultConfig(): Promise<DefaultConfig> {
    const owner = await resolveDefaultOwnerEmail();
    if (owner) {
        const record = await getUserCampgrounds(owner);
        if (record) {
            return { campgrounds: record.campgrounds, globalSettings: record.globalSettings };
        }
    }
    return buildDefaultFromCatalog();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/default-config.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/default-config.ts src/lib/default-config.test.ts
git commit -m "Add getDefaultConfig resolver: default = primary curator's watchlist"
```

---

## Task 2: `GET /api/default` reads the resolver; delete `PUT /api/default`

**Files:**
- Modify: `next/src/app/api/default/route.ts`
- Test: `next/src/app/api/default/route.test.ts`

- [ ] **Step 1: Update the test (drive the new behavior)**

In `next/src/app/api/default/route.test.ts`, replace the whole file with:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));

import * as cloudflare from "@/lib/cloudflare";

beforeEach(() => {
    vi.clearAllMocks();
});

async function doGet(): Promise<Response> {
    const { GET } = await import("./route");
    return GET();
}

function wire(kv: ReturnType<typeof createMockKv>, bootstrap?: string) {
    vi.mocked(cloudflare.getKv).mockReturnValue(kv);
    vi.mocked(cloudflare.getEnv).mockReturnValue({
        BOOTSTRAP_ADMIN_EMAIL: bootstrap,
        SUBSCRIBERS: kv,
    } as never);
}

describe("GET /api/default", () => {
    it("returns the curator's watchlist record as the default", async () => {
        const kv = createMockKv({
            "user:boss@example.com:profile": JSON.stringify({
                email: "boss@example.com",
                name: "Boss",
                roles: ["curator"],
                createdAt: "2024-01-01",
            }),
            "user:boss@example.com:campgrounds": JSON.stringify({
                campgrounds: {
                    "recreation.gov": [
                        { id: "123", name: "My Camp", sites: { favorites: [], worthwhile: [] } },
                    ],
                },
                globalSettings: { stayLengths: [2, 3], validStartDays: ["Friday"] },
                updatedAt: "2024-01-02",
            }),
        });
        wire(kv, "boss@example.com");

        const res = await doGet();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { campgrounds: { "recreation.gov": { id: string }[] } };
        expect(body.campgrounds["recreation.gov"].map((c) => c.id)).toEqual(["123"]);
    });

    it("falls back to the catalog when no curator record exists", async () => {
        const kv = createMockKv({});
        wire(kv, "boss@example.com");

        const res = await doGet();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { campgrounds: { "recreation.gov": { id: string }[] } };
        expect(body.campgrounds["recreation.gov"].length).toBeGreaterThan(0);
    });

    it("no longer exports PUT", async () => {
        const mod = (await import("./route")) as Record<string, unknown>;
        expect(mod.PUT).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/app/api/default/route.test.ts`
Expected: FAIL — old route still reads `config:campgrounds` / still exports `PUT`.

- [ ] **Step 3: Rewrite the route**

Replace the entire contents of `next/src/app/api/default/route.ts` with:

```ts
import { jsonResponse, withCors } from "@/lib/responses";
import { getDefaultConfig } from "@/lib/default-config";
import { withErrorLogging } from "@/lib/route-helpers";

async function getHandler(): Promise<Response> {
    return withCors(jsonResponse(await getDefaultConfig()));
}
export const GET = withErrorLogging(getHandler, "GET /api/default");
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/app/api/default/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/default/route.ts src/app/api/default/route.test.ts
git commit -m "GET /api/default returns the curator watchlist; remove PUT /api/default"
```

---

## Task 3: Anonymous `/api/availability` uses the resolver

**Files:**
- Modify: `next/src/app/api/availability/route.ts`
- Test: `next/src/app/api/availability/route.test.ts`

- [ ] **Step 1: Update the test**

Open `next/src/app/api/availability/route.test.ts`. The anonymous-path tests currently seed `"config:campgrounds"` in `createMockKv({...})` and rely on `getKv`. Make two changes per anonymous test:

1. Ensure `@/lib/cloudflare` mock includes `getEnv: vi.fn()` and that the test wires it (add `vi.mocked(cloudflare.getEnv).mockReturnValue({ BOOTSTRAP_ADMIN_EMAIL: "boss@example.com", SUBSCRIBERS: kv } as never)`).
2. Replace the seeded `"config:campgrounds": JSON.stringify(cfg)` entry with a curator profile + record:

```ts
const kv = createMockKv({
    "user:boss@example.com:profile": JSON.stringify({
        email: "boss@example.com",
        name: "Boss",
        roles: ["curator"],
        createdAt: "2024-01-01",
    }),
    "user:boss@example.com:campgrounds": JSON.stringify({
        campgrounds: cfg.campgrounds,
        globalSettings: cfg.globalSettings,
        updatedAt: "2024-01-02",
    }),
});
```

(`cfg` is whatever object each test previously stored under `config:campgrounds`.) Leave the authenticated-session tests unchanged — they already seed `user:{email}:campgrounds`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/app/api/availability/route.test.ts`
Expected: FAIL on the anonymous cases — route still reads `config:campgrounds`, which is no longer seeded.

- [ ] **Step 3: Edit the route**

In `next/src/app/api/availability/route.ts`:

Add the import near the other lib imports:

```ts
import { getDefaultConfig } from "@/lib/default-config";
```

Delete the now-unused constant (line 16):

```ts
const DEFAULT_CONFIG_KEY = "config:campgrounds";
```

Replace the anonymous branch (the block starting `// Anonymous: use curated default config;` through the end of `getHandler`) with:

```ts
    // Anonymous: use the curator's watchlist as the default; no snapshot persistence.
    const defaultConfig = await getDefaultConfig();
    const snapshot = await buildSnapshot(defaultConfig, adapter);
    return withCors(jsonResponse(snapshot));
```

(`getDefaultConfig()` always returns a config — catalog fallback covers the empty case — so the old `if (!defaultConfig)` early return is removed. `getDefaultConfig`'s return shape satisfies `SourceConfig`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/app/api/availability/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/availability/route.ts src/app/api/availability/route.test.ts
git commit -m "Anonymous /api/availability reads default via getDefaultConfig"
```

---

## Task 4: Repoint the remaining default readers (clone-default, items, admin/users)

**Files:**
- Modify: `next/src/app/api/users/me/campgrounds/clone-default/route.ts`
- Modify: `next/src/app/api/users/me/campgrounds/items/route.ts`
- Modify: `next/src/app/api/admin/users/route.ts`
- Test: the three matching `*.test.ts` files.

- [ ] **Step 1: Update the three tests**

For each test file, replace the `"config:campgrounds": JSON.stringify(...)` seed with a curator profile + `user:{curator}:campgrounds` record (same shape as Task 3 Step 1), and wire `getEnv` to return `{ BOOTSTRAP_ADMIN_EMAIL: "boss@example.com", SUBSCRIBERS: kv }`. Concretely:

- `clone-default/route.test.ts`: the test that seeds `"config:campgrounds": JSON.stringify(curatedDefault)` → seed `user:boss@example.com:profile` (curator) + `user:boss@example.com:campgrounds` = `{ campgrounds: curatedDefault.campgrounds, globalSettings: curatedDefault.globalSettings, updatedAt: "2024-01-02" }`; add the `getEnv` mock + wiring. Assertion that the clone equals the curated list stays.
- `items/route.test.ts`: every `"config:campgrounds": JSON.stringify(DEFAULT_CONFIG)` → curator profile + `user:boss@example.com:campgrounds` holding `DEFAULT_CONFIG`; add `getEnv` mock + wiring. The "Campground not in default list" / "No default config to copy from" cases: the 404-when-no-default case must now have NO curator record AND no curator profile so `getDefaultConfig()` falls back to catalog — instead assert against an id that is not in the catalog (e.g. `"not-a-real-id"`) to still get the "not in default list" 404. Update that test's expectation accordingly.
- `admin/users/route.test.ts`: the new-user-clone test that seeds `"config:campgrounds"` → curator profile + `user:boss@example.com:campgrounds`; add `getEnv` mock + wiring. Assert the created user's `user:{newemail}:campgrounds` equals the curator list.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/app/api/users/me/campgrounds/clone-default src/app/api/users/me/campgrounds/items src/app/api/admin/users`
Expected: FAIL — routes still read `config:campgrounds`.

- [ ] **Step 3: Edit clone-default route**

Replace the entire contents of `next/src/app/api/users/me/campgrounds/clone-default/route.ts` with:

```ts
import { readSession } from "@/lib/sessions";
import { getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { putUserCampgrounds } from "@/lib/user-campgrounds";
import { getDefaultConfig } from "@/lib/default-config";
import { WorkerKvAdapter } from "@/lib/recgov/worker-kv";
import { withErrorLogging } from "@/lib/route-helpers";

async function postHandler(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    const { campgrounds, globalSettings } = await getDefaultConfig();
    const stored = await putUserCampgrounds(session.email, { campgrounds, globalSettings });

    const adapter = new WorkerKvAdapter(getKv());
    await adapter.deleteSnapshot(session.email);

    return withCors(jsonResponse(stored));
}
export const POST = withErrorLogging(postHandler, "POST /api/users/me/campgrounds/clone-default");
```

(Note: this also clears the user's cached availability snapshot after cloning — matches the snapshot-invalidation other write paths already do.)

- [ ] **Step 4: Edit items route**

In `next/src/app/api/users/me/campgrounds/items/route.ts`:

Add import:

```ts
import { getDefaultConfig } from "@/lib/default-config";
```

Replace the default read (lines 38-41):

```ts
    const def = (await getKv().get("config:campgrounds", "json")) as DefaultConfig | null;
    if (!def?.campgrounds) {
        return withCors(jsonResponse({ error: "No default config to copy from" }, 404));
    }
```

with:

```ts
    const def = await getDefaultConfig();
```

Then change line 43 from `def.campgrounds["recreation.gov"]?.find(...)` to `def.campgrounds["recreation.gov"]?.find((c) => c.id === id)` (drop the optional `?` on `def`, since `getDefaultConfig` never returns null). The `DefaultConfig` local interface can be deleted if no longer referenced.

- [ ] **Step 5: Edit admin/users route**

In `next/src/app/api/admin/users/route.ts`:

Add import:

```ts
import { getDefaultConfig } from "@/lib/default-config";
```

Replace the clone block (lines 93-102):

```ts
    // Clone the curator's default watchlist so the new user gets alerts right away.
    const defaultConfig = (await getKv().get(DEFAULT_CONFIG_KEY, "json")) as {
        campgrounds?: SiteConfig;
        globalSettings?: GlobalSettings;
    } | null;

    await putUserCampgrounds(email, {
        campgrounds: defaultConfig?.campgrounds ?? { "recreation.gov": [] },
        globalSettings: defaultConfig?.globalSettings ?? FALLBACK_GLOBAL_SETTINGS,
    });
```

with:

```ts
    // Clone the curator's default watchlist so the new user gets alerts right away.
    const defaultConfig = await getDefaultConfig();
    await putUserCampgrounds(email, {
        campgrounds: defaultConfig.campgrounds,
        globalSettings: defaultConfig.globalSettings,
    });
```

Delete the now-unused `DEFAULT_CONFIG_KEY` const (line 11) and the `FALLBACK_GLOBAL_SETTINGS` const (lines 13-16) if no longer referenced. Remove `getKv` from the cloudflare import if nothing else in the file uses it (check: `listAllUsers` uses `getKv()` — so keep the import). Remove the `SiteConfig` / `GlobalSettings` type import if those are no longer referenced after the edit.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test src/app/api/users/me/campgrounds/clone-default src/app/api/users/me/campgrounds/items src/app/api/admin/users`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/users/me/campgrounds/clone-default src/app/api/users/me/campgrounds/items src/app/api/admin/users
git commit -m "Repoint clone-default, items, and new-user clone to getDefaultConfig"
```

---

## Task 5: Remove the curator write-through in `PUT /api/users/me/campgrounds`

**Files:**
- Modify: `next/src/app/api/users/me/campgrounds/route.ts`
- Test: `next/src/app/api/users/me/campgrounds/route.test.ts`

- [ ] **Step 1: Update the test**

In `next/src/app/api/users/me/campgrounds/route.test.ts`, find the tests asserting that a curator PUT writes through to `config:campgrounds` (they read `await kv.get("config:campgrounds")` after a curator PUT). Replace those write-through assertions with the inverse — the key is NOT written:

```ts
const defaultRaw = await kv.get("config:campgrounds");
expect(defaultRaw).toBeNull();
```

Keep the assertions that the user's own `user:{email}:campgrounds` record is written. Remove any test that exists *solely* to check the write-through, or repurpose it as above. The `@/lib/users` mock (`getUserProfile`) can stay; it's no longer needed for write-through but harmless.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/app/api/users/me/campgrounds/route.test.ts`
Expected: FAIL — route still writes `config:campgrounds` for curators.

- [ ] **Step 3: Edit the route**

In `next/src/app/api/users/me/campgrounds/route.ts`, delete the write-through block (lines 68-77):

```ts
    // Write-through to the default config if the user is a curator.
    const profile = await getUserProfile(session.email);
    if (profile?.roles?.includes("curator")) {
        try {
            await getKv().put(DEFAULT_CONFIG_KEY, JSON.stringify(body));
        } catch (err) {
            console.error("[PUT /api/users/me/campgrounds] Failed to write default config:", err);
            // Don't fail the user save.
        }
    }
```

Then remove now-unused imports/consts: `getUserProfile` (from `@/lib/users`), the `DEFAULT_CONFIG_KEY` const (line 10). Keep `getKv` (still used for `adapter`/`deleteSnapshot`). After removal, `putHandler` ends:

```ts
    const stored = await putUserCampgrounds(session.email, body as never);

    const adapter = new WorkerKvAdapter(getKv());
    await adapter.deleteSnapshot(session.email);

    return withCors(jsonResponse(stored));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/app/api/users/me/campgrounds/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/users/me/campgrounds/route.ts src/app/api/users/me/campgrounds/route.test.ts
git commit -m "Drop curator write-through: the curator record IS the default now"
```

---

## Task 6: Rewrite `POST /api/admin/migrate` as a one-time reconcile

**Files:**
- Modify: `next/src/app/api/admin/migrate/route.ts`
- Test: `next/src/app/api/admin/migrate/route.test.ts`

Reconcile semantics: read `config:campgrounds` and the resolved owner's `user:{owner}:campgrounds`. Merge campgrounds by `id` (start from the owner record's list; append any config-only campgrounds; owner entries win on conflict). `globalSettings` = owner record's if present, else config's. Write merged record to `user:{owner}:campgrounds`. Delete `config:campgrounds`. Idempotent: once the key is gone, re-run is a no-op.

- [ ] **Step 1: Replace the test file**

Replace the entire contents of `next/src/app/api/admin/migrate/route.test.ts` with:

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

import * as cloudflare from "@/lib/cloudflare";
import * as sessions from "@/lib/sessions";

beforeEach(() => {
    vi.clearAllMocks();
});

const CURATOR = "boss@example.com";

function wire(kv: ReturnType<typeof createMockKv>) {
    vi.mocked(cloudflare.getKv).mockReturnValue(kv);
    vi.mocked(cloudflare.getEnv).mockReturnValue({
        BOOTSTRAP_ADMIN_EMAIL: CURATOR,
        API_SECRET: "secret",
        SUBSCRIBERS: kv,
    } as never);
    vi.mocked(sessions.readSession).mockResolvedValue(null);
}

function cg(id: string, stayLengths?: number[]) {
    const base = { id, name: `Camp ${id}`, sites: { favorites: [], worthwhile: [] } };
    return stayLengths ? { ...base, stayLengths } : base;
}

function seedCurator(kv: ReturnType<typeof createMockKv>) {
    kv._store.set(
        `user:${CURATOR}:profile`,
        JSON.stringify({ email: CURATOR, name: "Boss", roles: ["curator"], createdAt: "2024-01-01" }),
    );
}

async function doPost(): Promise<Response> {
    const { POST } = await import("./route");
    return POST(
        new Request("https://example.com/api/admin/migrate", {
            method: "POST",
            headers: { Authorization: "Bearer secret" },
        }),
    );
}

describe("POST /api/admin/migrate (reconcile)", () => {
    it("rejects unauthorized callers", async () => {
        const kv = createMockKv({});
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: "secret", SUBSCRIBERS: kv } as never);
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        const { POST } = await import("./route");
        const res = await POST(new Request("https://example.com/api/admin/migrate", { method: "POST" }));
        expect(res.status).toBe(401);
    });

    it("merges config into the curator record (curator wins) and deletes the key", async () => {
        const kv = createMockKv({
            "config:campgrounds": JSON.stringify({
                campgrounds: { "recreation.gov": [cg("A"), cg("B", [9])] },
                globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
            }),
            [`user:${CURATOR}:campgrounds`]: JSON.stringify({
                campgrounds: { "recreation.gov": [cg("B", [3]), cg("C")] },
                globalSettings: { stayLengths: [4, 5], validStartDays: ["Saturday"] },
                updatedAt: "2024-01-02",
            }),
        });
        seedCurator(kv);
        wire(kv);

        const res = await doPost();
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            reconciled: boolean;
            owner: string;
            merged: number;
            addedFromConfig: { id: string }[];
            configKeyDeleted: boolean;
        };
        expect(body.reconciled).toBe(true);
        expect(body.owner).toBe(CURATOR);
        expect(body.addedFromConfig.map((c) => c.id)).toEqual(["A"]);
        expect(body.configKeyDeleted).toBe(true);

        const stored = JSON.parse(kv._store.get(`user:${CURATOR}:campgrounds`)!) as {
            campgrounds: { "recreation.gov": { id: string; stayLengths?: number[] }[] };
            globalSettings: { stayLengths: number[] };
        };
        const list = stored.campgrounds["recreation.gov"];
        expect(list.map((c) => c.id)).toEqual(["B", "C", "A"]); // curator order first, config-only appended
        expect(list.find((c) => c.id === "B")!.stayLengths).toEqual([3]); // curator entry wins
        expect(stored.globalSettings.stayLengths).toEqual([4, 5]); // curator settings win
        expect(kv._store.get("config:campgrounds")).toBeUndefined();
    });

    it("seeds the curator record from config when the record is missing", async () => {
        const kv = createMockKv({
            "config:campgrounds": JSON.stringify({
                campgrounds: { "recreation.gov": [cg("A")] },
                globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
            }),
        });
        seedCurator(kv);
        wire(kv);

        const res = await doPost();
        expect(res.status).toBe(200);
        const stored = JSON.parse(kv._store.get(`user:${CURATOR}:campgrounds`)!) as {
            campgrounds: { "recreation.gov": { id: string }[] };
        };
        expect(stored.campgrounds["recreation.gov"].map((c) => c.id)).toEqual(["A"]);
        expect(kv._store.get("config:campgrounds")).toBeUndefined();
    });

    it("is a no-op on re-run once the config key is gone", async () => {
        const kv = createMockKv({
            [`user:${CURATOR}:campgrounds`]: JSON.stringify({
                campgrounds: { "recreation.gov": [cg("C")] },
                globalSettings: { stayLengths: [4], validStartDays: ["Saturday"] },
                updatedAt: "2024-01-02",
            }),
        });
        seedCurator(kv);
        wire(kv);

        const res = await doPost();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { reconciled: boolean };
        expect(body.reconciled).toBe(false);
        const stored = JSON.parse(kv._store.get(`user:${CURATOR}:campgrounds`)!) as {
            campgrounds: { "recreation.gov": { id: string }[] };
        };
        expect(stored.campgrounds["recreation.gov"].map((c) => c.id)).toEqual(["C"]); // untouched
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/app/api/admin/migrate/route.test.ts`
Expected: FAIL — route still seeds `config:campgrounds` from the catalog.

- [ ] **Step 3: Rewrite the route**

Replace the entire contents of `next/src/app/api/admin/migrate/route.ts` with:

```ts
// One-time reconcile: collapse the legacy `config:campgrounds` default into the
// primary curator's watchlist record, then delete the legacy key. Union by id,
// curator entries win on conflict. Idempotent — once the key is gone it's a no-op.
//
// Gated by API_SECRET (Bearer) or a signed-in curator session. Safe to re-run.

import { getEnv, getKv } from "@/lib/cloudflare";
import { readSession } from "@/lib/sessions";
import { getUserProfile } from "@/lib/users";
import { getUserCampgrounds, putUserCampgrounds } from "@/lib/user-campgrounds";
import { resolveDefaultOwnerEmail } from "@/lib/default-config";
import { jsonResponse, withCors } from "@/lib/responses";
import type { Campground, GlobalSettings, SiteConfig } from "@/types/campground";
import { withErrorLogging } from "@/lib/route-helpers";

interface LegacyConfig {
    campgrounds?: SiteConfig;
    globalSettings?: GlobalSettings;
}

async function isAuthorized(request: Request): Promise<boolean> {
    const env = getEnv();
    const auth = request.headers.get("Authorization");
    if (env.API_SECRET && auth === `Bearer ${env.API_SECRET}`) return true;

    const session = await readSession(request);
    if (!session) return false;
    const profile = await getUserProfile(session.email);
    return !!profile?.roles?.includes("curator");
}

async function postHandler(request: Request): Promise<Response> {
    if (!(await isAuthorized(request))) {
        return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    }

    const kv = getKv();
    const legacy = (await kv.get("config:campgrounds", "json")) as LegacyConfig | null;

    // No legacy key -> nothing to reconcile.
    if (!legacy) {
        return withCors(
            jsonResponse({ reconciled: false, owner: null, merged: 0, addedFromConfig: [], configKeyDeleted: false }),
        );
    }

    const owner = await resolveDefaultOwnerEmail();
    if (!owner) {
        return withCors(
            jsonResponse(
                { error: "No curator to reconcile into; assign a curator first." },
                409,
            ),
        );
    }

    const ownerRecord = await getUserCampgrounds(owner);
    const ownerList: Campground[] = ownerRecord?.campgrounds?.["recreation.gov"] ?? [];
    const legacyList: Campground[] = legacy.campgrounds?.["recreation.gov"] ?? [];

    const ownerIds = new Set(ownerList.map((c) => c.id));
    const addedFromConfig = legacyList.filter((c) => !ownerIds.has(c.id));
    const mergedList: Campground[] = [...ownerList, ...addedFromConfig];

    const globalSettings: GlobalSettings =
        ownerRecord?.globalSettings ??
        legacy.globalSettings ?? { stayLengths: [2, 3, 4, 5], validStartDays: [] };

    await putUserCampgrounds(owner, {
        campgrounds: { "recreation.gov": mergedList } as SiteConfig,
        globalSettings,
    });
    await kv.delete("config:campgrounds");

    return withCors(
        jsonResponse({
            reconciled: true,
            owner,
            merged: mergedList.length,
            addedFromConfig: addedFromConfig.map((c) => ({ id: c.id, name: c.name })),
            configKeyDeleted: true,
        }),
    );
}
export const POST = withErrorLogging(postHandler, "POST /api/admin/migrate");
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/app/api/admin/migrate/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/migrate/route.ts src/app/api/admin/migrate/route.test.ts
git commit -m "Rewrite /api/admin/migrate as one-time config->curator reconcile"
```

---

## Task 7: Remove the admin "Edit default list" editor

**Files:**
- Modify: `next/src/app/app/admin/page.tsx`

No new tests (this is a client page; the project has no component test for it). Verification is via `tsc` + `cf:build` in Task 8 and the manual check.

- [ ] **Step 1: Remove the dialog state, handlers, and JSX**

In `next/src/app/app/admin/page.tsx`:

1. Delete the import: `import { SiteConfigDialog } from "@/components/site-config-dialog";` (line 9).
2. Delete the type import `import type { SiteConfig, GlobalSettings } from "@/types/campground";` (line 12) — only the default dialog used these.
3. Delete the default-dialog state (lines 25-27):

```ts
    const [defaultDialogOpen, setDefaultDialogOpen] = useState(false);
    const [defaultConfig, setDefaultConfig] = useState<SiteConfig | null>(null);
    const [defaultGlobalSettings, setDefaultGlobalSettings] = useState<GlobalSettings | null>(null);
```

4. Delete the `openDefaultDialog` handler (lines 107-134) and the `saveDefault` handler (lines 136-149).
5. Delete the entire `{/* Default config section */}` `<section>...</section>` block (lines 350-368).
6. Delete the trailing `SiteConfigDialog` render block (lines 417-431):

```tsx
            {defaultConfig && defaultGlobalSettings ? (
                <SiteConfigDialog ... />
            ) : null}
```

- [ ] **Step 2: Update the migrate section to describe the reconcile**

Update the `MigrateResult` interface (lines 14-18) to the new response shape:

```ts
interface MigrateResult {
    reconciled: boolean;
    owner: string | null;
    merged: number;
    addedFromConfig: { id: string; name: string }[];
    configKeyDeleted: boolean;
}
```

Update the migrate section copy (lines 375-380). Change the `<h2>` text and `<p>` to reflect the one-time reconcile:

```tsx
                            <h2 className="font-poster text-[24px] sm:text-[28px] font-black uppercase tracking-[0.005em] mb-1">
                                Reconcile legacy default
                            </h2>
                            <p className="font-italic-serif text-[16px] sm:text-[18px] italic leading-[1.3] text-cw-ink-soft mb-6">
                                One-time: merges the old default-config list into your watchlist and
                                retires the legacy key. Safe to re-run; no-op once done.
                            </p>
```

- [ ] **Step 3: Type-check the page**

Run: `pnpm exec tsc --noEmit`
Expected: PASS — no unused-symbol or missing-import errors. (If `tsc` flags an unused import you missed, remove it.)

- [ ] **Step 4: Commit**

```bash
git add src/app/app/admin/page.tsx
git commit -m "Remove admin 'Edit default list' editor; dashboard is the only editor"
```

---

## Task 8: Full verification + production reconcile

**Files:** none (verification + operational).

- [ ] **Step 1: Full type-check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS, no errors. Grep the diff for any lingering `config:campgrounds` references in non-test `src/` files:

Run: `grep -rn "config:campgrounds" src --include="*.ts" --include="*.tsx" | grep -v ".test."`
Expected: NO matches (all production readers/writers repointed; only the migrate route's `kv.get`/`kv.delete` literals remain — confirm those two are the only hits, and they are the reconcile's read+delete).

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: PASS — all suites green.

- [ ] **Step 3: OpenNext build**

Run: `pnpm run cf:build`
Expected: build succeeds.

- [ ] **Step 4: Manual smoke (local dev)**

Run: `pnpm dev`, then with `DEV_USER` set to the curator email: open `/app`, confirm the dashboard watchlist renders; open `/discover` (anonymous-equivalent reader) and confirm it shows the same list. Open `/app/admin` and confirm the "Edit default list" section is gone and the "Reconcile legacy default" section is present.

- [ ] **Step 5: Production reconcile (Mike-triggered, touches prod data)**

After Mike deploys: as the signed-in curator, open `/app/admin` → "Run migrate" (or `POST /api/admin/migrate` with the Bearer `API_SECRET`). This merges the legacy `config:campgrounds` into the curator record (union by id, curator wins) and deletes the legacy key. **Expected visible behavior:** at deploy time the public default switches to the curator's current dashboard list; after the reconcile it becomes the union of both. Mike should eyeball `/app` afterward and trim any campground the union re-introduced that he'd deliberately removed.

---

## Self-Review Notes

- **Spec coverage:** resolver (Task 1) ✓; readers repointed — `/api/default` GET (Task 2), anonymous availability (Task 3), clone-default/items/admin-users (Task 4) ✓; writers removed — PUT `/api/default` (Task 2), write-through (Task 5) ✓; admin editor removed (Task 7) ✓; one-time merge reconcile + key deletion (Task 6) ✓; owner resolution `BOOTSTRAP_ADMIN_EMAIL`→`listCurators()`→catalog (Task 1) ✓; multi-user untouched (notifier reads per-user records, unchanged) ✓.
- **Type consistency:** `getDefaultConfig(): Promise<{campgrounds: SiteConfig; globalSettings: GlobalSettings}>` consumed identically everywhere; `resolveDefaultOwnerEmail(): Promise<string|null>` used in Task 1 and Task 6; migrate response shape defined in Task 6 matches `MigrateResult` in Task 7.
- **Placeholders:** none — every code step shows full content or an exact edit.
