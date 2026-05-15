# Phase 0b: API Migration to Next.js Route Handlers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the existing `campsites-finder` Worker's API surface (`/api/subscribe`, `/api/unsubscribe`, `/api/subscribers`, `/api/config` GET, `/api/config` PUT) to Next.js Route Handlers running on the `campwatch` Worker, sharing the same `SUBSCRIBERS` KV namespace. End state: both Workers serve identical APIs against the same data. The notifier and the existing CRA app still talk to `campsites-finder`; no production cutover happens in this phase.

**Architecture:** The new endpoints live under `next/src/app/api/*/route.ts`. They use `getCloudflareContext()` from `@opennextjs/cloudflare` to access the KV namespace and Worker secrets. Auth, KV keys, HMAC tokens, and response shapes match the existing Worker exactly — verified by curl-based smoke tests against both URLs at the end of the phase. Tests use Vitest with a mocked KV namespace.

**Tech Stack:** Next.js Route Handlers (App Router), `@opennextjs/cloudflare` Cloudflare context, Vitest + `@vitest/coverage-v8`, `@cloudflare/workers-types`, Wrangler for secret management.

**Reference reading before starting:** `workers-site/index.js` (237 lines, the current Worker — this plan is essentially a 1:1 port).

---

## Pre-flight

### Task 0: Confirm branch and clean state

**Files:** none (git only).

- [ ] **Step 1: Sync local main**

```bash
cd "/Users/mikeroberts/Library/Mobile Documents/com~apple~CloudDocs/Desktop/Websites/campsites-react"
git checkout main
git pull --ff-only
```

Expected: at commit `d2626e0` ("Merge pull request #3 from robertsmikej/feature/phase-0a-next-scaffold") or later.

- [ ] **Step 2: Create the working branch**

```bash
git checkout -b feature/phase-0b-api-migration
```

- [ ] **Step 3: Verify the tree is clean and `next/` is buildable**

```bash
git status -s
cd next && pnpm install --frozen-lockfile && pnpm run cf:build 2>&1 | tail -5
```

Expected: `git status` clean. `cf:build` ends with `OpenNext build complete.`

---

## Section A: Test setup and shared helpers

### Task A1: Install Vitest and configure

**Files:**
- Modify: `next/package.json` (add deps + `test` script)
- Create: `next/vitest.config.ts`
- Create: `next/src/__tests__/setup.ts`

- [ ] **Step 1: Install Vitest and supporting deps**

```bash
cd next
pnpm add -D vitest @vitest/coverage-v8 @cloudflare/vitest-pool-workers
```

`@cloudflare/vitest-pool-workers` runs Vitest tests inside the workerd runtime so KV bindings behave the same way they do in production. We won't use it for every test, but it's the cleanest path for testing Route Handlers that rely on Cloudflare context.

- [ ] **Step 2: Add the test script to `next/package.json`**

Insert into the `scripts` block (preserve all existing keys):

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `next/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
        },
    },
    test: {
        environment: "node",
        include: ["src/**/*.test.ts"],
        setupFiles: ["src/__tests__/setup.ts"],
    },
});
```

- [ ] **Step 4: Create `next/src/__tests__/setup.ts`**

```ts
import { vi } from "vitest";

// Reset module registry between tests so route handlers don't share state
afterEach(() => {
    vi.restoreAllMocks();
});
```

(`afterEach` is globally available in Vitest, no import needed.)

- [ ] **Step 5: Verify the runner starts**

```bash
cd next && pnpm test 2>&1 | tail -5
```

Expected: "No test files found" (we haven't written any yet). That's success — the runner loads.

- [ ] **Step 6: Commit**

```bash
git add next/package.json next/pnpm-lock.yaml next/vitest.config.ts next/src/__tests__/setup.ts
git commit -m "Install Vitest and add test scripts"
```

### Task A2: Cloudflare context accessor + mock helper

A small wrapper around `getCloudflareContext()` so route handlers don't all import the OpenNext adapter directly, and a fake-context factory for unit tests.

**Files:**
- Create: `next/src/lib/cloudflare.ts`
- Create: `next/src/lib/__mocks__/cloudflare-test-helpers.ts`
- Test: `next/src/lib/cloudflare.test.ts`

- [ ] **Step 1: Write the failing test**

`next/src/lib/cloudflare.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createMockKv } from "./__mocks__/cloudflare-test-helpers";

describe("createMockKv", () => {
    it("supports get/put/delete round-trips with json mode", async () => {
        const kv = createMockKv();
        await kv.put("foo", JSON.stringify({ hello: "world" }));
        const value = await kv.get("foo", "json");
        expect(value).toEqual({ hello: "world" });
        await kv.delete("foo");
        expect(await kv.get("foo")).toBeNull();
    });

    it("lists keys with a prefix", async () => {
        const kv = createMockKv();
        await kv.put("email:a@x.com", "x");
        await kv.put("email:b@x.com", "y");
        await kv.put("config:default", "z");
        const result = await kv.list({ prefix: "email:" });
        expect(result.keys.map((k) => k.name).sort()).toEqual([
            "email:a@x.com",
            "email:b@x.com",
        ]);
    });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
cd next && pnpm test 2>&1 | tail -10
```

Expected: failure ("Cannot find module './__mocks__/cloudflare-test-helpers'") — the file doesn't exist yet.

- [ ] **Step 3: Implement the test helper**

`next/src/lib/__mocks__/cloudflare-test-helpers.ts`:

```ts
import type { KVNamespace, KVNamespaceListResult } from "@cloudflare/workers-types";

export interface MockKvNamespace extends KVNamespace {
    _store: Map<string, string>;
}

export function createMockKv(initial: Record<string, string> = {}): MockKvNamespace {
    const store = new Map<string, string>(Object.entries(initial));

    const kv = {
        _store: store,

        async get(key: string, type?: "text" | "json") {
            const value = store.get(key);
            if (value === undefined) return null;
            if (type === "json") return JSON.parse(value);
            return value;
        },

        async put(key: string, value: string) {
            store.set(key, value);
        },

        async delete(key: string) {
            store.delete(key);
        },

        async list({ prefix, cursor }: { prefix?: string; cursor?: string } = {}): Promise<KVNamespaceListResult<unknown, string>> {
            const keys = Array.from(store.keys())
                .filter((k) => (prefix ? k.startsWith(prefix) : true))
                .sort()
                .map((name) => ({ name }));
            return {
                keys,
                list_complete: true,
                cacheStatus: null,
            } as KVNamespaceListResult<unknown, string>;
        },

        async getWithMetadata() {
            throw new Error("not implemented in mock");
        },
    };

    return kv as unknown as MockKvNamespace;
}
```

- [ ] **Step 4: Run, expect pass**

```bash
cd next && pnpm test 2>&1 | tail -10
```

Expected: `2 passed`.

- [ ] **Step 5: Implement `cloudflare.ts`**

`next/src/lib/cloudflare.ts`:

```ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { KVNamespace } from "@cloudflare/workers-types";

export interface CampWatchEnv {
    SUBSCRIBERS: KVNamespace;
    API_SECRET?: string;
    CONFIG_KEY?: string;
}

/**
 * Returns the Cloudflare bindings for the current request. Throws if called
 * outside a request context (e.g., during static analysis or build).
 */
export function getEnv(): CampWatchEnv {
    const ctx = getCloudflareContext({ async: false });
    return ctx.env as unknown as CampWatchEnv;
}

/**
 * Returns the bound KV namespace.
 */
export function getKv(): KVNamespace {
    return getEnv().SUBSCRIBERS;
}
```

- [ ] **Step 6: Update `next/src/env.d.ts` with the secret types**

Open `next/src/env.d.ts` and replace its contents with:

```ts
/// <reference types="@cloudflare/workers-types" />

declare global {
    interface CloudflareEnv {
        SUBSCRIBERS: KVNamespace;
        API_SECRET?: string;
        CONFIG_KEY?: string;
    }
}

export {};
```

- [ ] **Step 7: Verify typecheck**

```bash
cd next && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add next/src/lib/cloudflare.ts next/src/lib/__mocks__/cloudflare-test-helpers.ts \
        next/src/lib/cloudflare.test.ts next/src/env.d.ts
git commit -m "Add Cloudflare context accessor and KV test helper"
```

---

## Section B: HMAC unsubscribe token

The existing Worker generates tokens at `workers-site/index.js:24-37` (sign with HMAC-SHA-256, hex-encode) and verifies at `:39-42` (re-sign, string-compare). Port this so unsubscribe links generated under either Worker remain valid under the other.

### Task B1: HMAC helper with tests

**Files:**
- Create: `next/src/lib/hmac.ts`
- Test: `next/src/lib/hmac.test.ts`

- [ ] **Step 1: Write the failing test**

`next/src/lib/hmac.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateUnsubscribeToken, verifyUnsubscribeToken } from "./hmac";

const SECRET = "test-secret-do-not-use-in-prod";

describe("HMAC unsubscribe tokens", () => {
    it("generates a stable hex token for a given email + secret", async () => {
        const a = await generateUnsubscribeToken("user@example.com", SECRET);
        const b = await generateUnsubscribeToken("user@example.com", SECRET);
        expect(a).toBe(b);
        expect(a).toMatch(/^[a-f0-9]{64}$/);
    });

    it("verifies a correct token", async () => {
        const token = await generateUnsubscribeToken("user@example.com", SECRET);
        expect(await verifyUnsubscribeToken("user@example.com", token, SECRET)).toBe(true);
    });

    it("rejects a token for a different email", async () => {
        const token = await generateUnsubscribeToken("user@example.com", SECRET);
        expect(await verifyUnsubscribeToken("other@example.com", token, SECRET)).toBe(false);
    });

    it("rejects a token signed with a different secret", async () => {
        const token = await generateUnsubscribeToken("user@example.com", SECRET);
        expect(
            await verifyUnsubscribeToken("user@example.com", token, "different-secret"),
        ).toBe(false);
    });

    it("rejects garbage tokens without throwing", async () => {
        expect(await verifyUnsubscribeToken("user@example.com", "deadbeef", SECRET)).toBe(
            false,
        );
        expect(await verifyUnsubscribeToken("user@example.com", "", SECRET)).toBe(false);
    });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
cd next && pnpm test src/lib/hmac.test.ts 2>&1 | tail -10
```

Expected: import error.

- [ ] **Step 3: Implement `hmac.ts`**

`next/src/lib/hmac.ts`:

```ts
const encoder = new TextEncoder();

/**
 * Generate an HMAC-SHA-256 token for an email address, hex-encoded.
 * Identical to the algorithm in workers-site/index.js so tokens cross-validate.
 */
export async function generateUnsubscribeToken(email: string, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(email));
    return [...new Uint8Array(signature)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Constant-time verify by comparing the re-signed token against the provided token.
 * Empty / malformed tokens return false without throwing.
 */
export async function verifyUnsubscribeToken(
    email: string,
    token: string,
    secret: string,
): Promise<boolean> {
    if (!token || !/^[a-f0-9]+$/i.test(token)) return false;
    const expected = await generateUnsubscribeToken(email, secret);
    if (expected.length !== token.length) return false;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
        mismatch |= expected.charCodeAt(i) ^ token.charCodeAt(i);
    }
    return mismatch === 0;
}
```

- [ ] **Step 4: Run, expect pass**

```bash
cd next && pnpm test src/lib/hmac.test.ts 2>&1 | tail -10
```

Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add next/src/lib/hmac.ts next/src/lib/hmac.test.ts
git commit -m "Add HMAC unsubscribe token helper with constant-time verify"
```

### Task B2: Shared response helpers (json, cors)

Mirror the `json()` and `cors()` helpers from `workers-site/index.js:8-19`.

**Files:**
- Create: `next/src/lib/responses.ts`
- Test: `next/src/lib/responses.test.ts`

- [ ] **Step 1: Write the failing test**

`next/src/lib/responses.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { jsonResponse, withCors } from "./responses";

describe("jsonResponse", () => {
    it("returns a JSON response with default 200 status", async () => {
        const r = jsonResponse({ ok: true });
        expect(r.status).toBe(200);
        expect(r.headers.get("content-type")).toContain("application/json");
        expect(await r.json()).toEqual({ ok: true });
    });

    it("honors a custom status", () => {
        expect(jsonResponse({ error: "bad" }, 400).status).toBe(400);
    });
});

describe("withCors", () => {
    it("sets permissive CORS headers", () => {
        const r = withCors(new Response("hello"));
        expect(r.headers.get("access-control-allow-origin")).toBe("*");
        expect(r.headers.get("access-control-allow-methods")).toBe(
            "GET, POST, PUT, OPTIONS",
        );
        expect(r.headers.get("access-control-allow-headers")).toBe(
            "Content-Type, Authorization",
        );
    });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
cd next && pnpm test src/lib/responses.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: Implement `responses.ts`**

`next/src/lib/responses.ts`:

```ts
export function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

export function withCors(response: Response): Response {
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return response;
}
```

- [ ] **Step 4: Run, expect pass**

```bash
cd next && pnpm test src/lib/responses.test.ts 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add next/src/lib/responses.ts next/src/lib/responses.test.ts
git commit -m "Add jsonResponse and withCors helpers"
```

### Task B3: Email validation helper

Mirror `isValidEmail` from the existing Worker.

**Files:**
- Create: `next/src/lib/email.ts`
- Test: `next/src/lib/email.test.ts`

- [ ] **Step 1: Test**

`next/src/lib/email.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isValidEmail, normalizeEmail } from "./email";

describe("isValidEmail", () => {
    it.each([
        ["user@example.com", true],
        ["a@b.co", true],
        ["", false],
        ["nope", false],
        ["nope@", false],
        ["@nope.com", false],
        ["with space@bad.com", false],
    ])("isValidEmail(%j) → %s", (input, expected) => {
        expect(isValidEmail(input)).toBe(expected);
    });
});

describe("normalizeEmail", () => {
    it("trims and lowercases", () => {
        expect(normalizeEmail("  User@Example.COM  ")).toBe("user@example.com");
    });

    it("returns empty string when given undefined or non-string", () => {
        expect(normalizeEmail(undefined)).toBe("");
        expect(normalizeEmail(null as unknown as string)).toBe("");
    });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
cd next && pnpm test src/lib/email.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: Implement**

`next/src/lib/email.ts`:

```ts
export function isValidEmail(email: string): boolean {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeEmail(email: string | undefined | null): string {
    if (typeof email !== "string") return "";
    return email.trim().toLowerCase();
}
```

- [ ] **Step 4: Run, expect pass**

```bash
cd next && pnpm test src/lib/email.test.ts 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add next/src/lib/email.ts next/src/lib/email.test.ts
git commit -m "Add email validation and normalization helpers"
```

---

## Section C: API Route Handlers

Each endpoint gets its own route file under `next/src/app/api/<name>/route.ts`. Tests live alongside as `route.test.ts`. The tests inject a mock KV via dependency injection (route handlers call `getKv()` from `cloudflare.ts`, which we mock).

### Task C1: POST /api/subscribe

Ports `handleSubscribe` from `workers-site/index.js:47-72`.

**Files:**
- Create: `next/src/app/api/subscribe/route.ts`
- Test: `next/src/app/api/subscribe/route.test.ts`

- [ ] **Step 1: Test (covers all four observable behaviors of the existing handler)**

`next/src/app/api/subscribe/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";
import * as cloudflare from "@/lib/cloudflare";

// Lazy import the route after mocking
async function post(body: unknown): Promise<Response> {
    const { POST } = await import("./route");
    return POST(
        new Request("https://example.com/api/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: typeof body === "string" ? body : JSON.stringify(body),
        }),
    );
}

beforeEach(() => {
    vi.resetModules();
});

describe("POST /api/subscribe", () => {
    it("stores a new email and returns success", async () => {
        const kv = createMockKv();
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        const res = await post({ email: "USER@example.com" });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ message: "Subscribed successfully" });

        const stored = await kv.get("email:user@example.com", "json");
        expect(stored).toMatchObject({ email: "user@example.com" });
        expect(typeof (stored as { subscribedAt: string }).subscribedAt).toBe("string");
    });

    it("is idempotent for an already-subscribed email", async () => {
        const kv = createMockKv({
            "email:user@example.com": JSON.stringify({
                email: "user@example.com",
                subscribedAt: "2026-01-01T00:00:00.000Z",
            }),
        });
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        const res = await post({ email: "user@example.com" });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ message: "Already subscribed" });
    });

    it("rejects invalid emails", async () => {
        const kv = createMockKv();
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        const res = await post({ email: "not-an-email" });

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "Valid email address required" });
    });

    it("rejects an unparseable body", async () => {
        vi.spyOn(cloudflare, "getKv").mockReturnValue(createMockKv());

        const res = await post("not json");

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "Invalid request body" });
    });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
cd next && pnpm test src/app/api/subscribe/route.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Implement**

`next/src/app/api/subscribe/route.ts`:

```ts
import { getKv } from "@/lib/cloudflare";
import { isValidEmail, normalizeEmail } from "@/lib/email";
import { jsonResponse, withCors } from "@/lib/responses";

export const runtime = "edge";

export async function POST(request: Request): Promise<Response> {
    let body: { email?: string };
    try {
        body = await request.json();
    } catch {
        return withCors(jsonResponse({ error: "Invalid request body" }, 400));
    }

    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) {
        return withCors(jsonResponse({ error: "Valid email address required" }, 400));
    }

    const kv = getKv();
    const existing = await kv.get(`email:${email}`);
    if (existing) {
        return withCors(jsonResponse({ message: "Already subscribed" }));
    }

    await kv.put(
        `email:${email}`,
        JSON.stringify({ email, subscribedAt: new Date().toISOString() }),
    );
    return withCors(jsonResponse({ message: "Subscribed successfully" }));
}

export async function OPTIONS(): Promise<Response> {
    return withCors(new Response(null, { status: 204 }));
}
```

- [ ] **Step 4: Run, expect pass**

```bash
cd next && pnpm test src/app/api/subscribe/route.test.ts 2>&1 | tail -5
```

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add next/src/app/api/subscribe/
git commit -m "Port POST /api/subscribe to Next.js Route Handler"
```

### Task C2: GET /api/unsubscribe

Ports `handleUnsubscribe` from `workers-site/index.js:75-100`. Returns HTML, not JSON.

**Files:**
- Create: `next/src/app/api/unsubscribe/route.ts`
- Test: `next/src/app/api/unsubscribe/route.test.ts`

- [ ] **Step 1: Test**

`next/src/app/api/unsubscribe/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";
import * as cloudflare from "@/lib/cloudflare";
import { generateUnsubscribeToken } from "@/lib/hmac";

const SECRET = "unit-test-api-secret";

beforeEach(() => {
    vi.resetModules();
});

async function get(query: Record<string, string>): Promise<Response> {
    const url = new URL("https://example.com/api/unsubscribe");
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const { GET } = await import("./route");
    return GET(new Request(url));
}

describe("GET /api/unsubscribe", () => {
    it("removes the email and returns an HTML confirmation when the token is valid", async () => {
        const email = "user@example.com";
        const kv = createMockKv({ [`email:${email}`]: JSON.stringify({ email }) });
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);
        vi.spyOn(cloudflare, "getEnv").mockReturnValue({
            SUBSCRIBERS: kv,
            API_SECRET: SECRET,
        });

        const token = await generateUnsubscribeToken(email, SECRET);
        const res = await get({ email, token });

        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/html");
        const html = await res.text();
        expect(html).toContain(email);
        expect(html).toContain("Unsubscribed");
        expect(await kv.get(`email:${email}`)).toBeNull();
    });

    it("returns 400 when email or token is missing", async () => {
        vi.spyOn(cloudflare, "getEnv").mockReturnValue({
            SUBSCRIBERS: createMockKv(),
            API_SECRET: SECRET,
        });

        const res = await get({ email: "user@example.com" });
        expect(res.status).toBe(400);
        expect(await res.text()).toContain("Missing email or token");
    });

    it("returns 403 when the token does not match", async () => {
        vi.spyOn(cloudflare, "getEnv").mockReturnValue({
            SUBSCRIBERS: createMockKv(),
            API_SECRET: SECRET,
        });

        const res = await get({ email: "user@example.com", token: "deadbeef" });
        expect(res.status).toBe(403);
    });

    it("returns 500 when API_SECRET is not configured", async () => {
        vi.spyOn(cloudflare, "getEnv").mockReturnValue({
            SUBSCRIBERS: createMockKv(),
        });

        const res = await get({ email: "user@example.com", token: "anything" });
        expect(res.status).toBe(500);
    });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

`next/src/app/api/unsubscribe/route.ts`:

```ts
import { getEnv } from "@/lib/cloudflare";
import { normalizeEmail } from "@/lib/email";
import { verifyUnsubscribeToken } from "@/lib/hmac";

export const runtime = "edge";

function htmlResponse(body: string, status = 200): Response {
    return new Response(body, { status, headers: { "Content-Type": "text/html" } });
}

export async function GET(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const email = normalizeEmail(url.searchParams.get("email"));
    const token = url.searchParams.get("token");

    if (!email || !token) {
        return new Response("Missing email or token", { status: 400 });
    }

    const env = getEnv();
    if (!env.API_SECRET) {
        return new Response("Server misconfigured: API_SECRET not set", { status: 500 });
    }

    const valid = await verifyUnsubscribeToken(email, token, env.API_SECRET);
    if (!valid) {
        return new Response("Invalid or expired unsubscribe link", { status: 403 });
    }

    await env.SUBSCRIBERS.delete(`email:${email}`);

    return htmlResponse(
        `<!DOCTYPE html>
        <html><head><meta charset="utf-8"><title>Unsubscribed</title></head>
        <body style="font-family:sans-serif;max-width:400px;margin:80px auto;text-align:center;">
            <h2>Unsubscribed</h2>
            <p>${email} has been removed from campsite availability notifications.</p>
        </body></html>`,
    );
}
```

- [ ] **Step 4: Run, expect pass**

```bash
cd next && pnpm test src/app/api/unsubscribe/route.test.ts 2>&1 | tail -5
```

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add next/src/app/api/unsubscribe/
git commit -m "Port GET /api/unsubscribe to Next.js Route Handler"
```

### Task C3: GET /api/subscribers (auth-gated)

Ports `handleListSubscribers` from `workers-site/index.js:103-124`. The notifier calls this with `Authorization: Bearer <API_SECRET>`.

**Files:**
- Create: `next/src/app/api/subscribers/route.ts`
- Test: `next/src/app/api/subscribers/route.test.ts`

- [ ] **Step 1: Test**

`next/src/app/api/subscribers/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";
import * as cloudflare from "@/lib/cloudflare";

const SECRET = "unit-test-api-secret";

beforeEach(() => {
    vi.resetModules();
});

async function get(authHeader?: string): Promise<Response> {
    const headers: Record<string, string> = {};
    if (authHeader) headers.Authorization = authHeader;
    const { GET } = await import("./route");
    return GET(new Request("https://example.com/api/subscribers", { headers }));
}

describe("GET /api/subscribers", () => {
    it("returns 401 when Authorization header is missing", async () => {
        vi.spyOn(cloudflare, "getEnv").mockReturnValue({
            SUBSCRIBERS: createMockKv(),
            API_SECRET: SECRET,
        });

        const res = await get();
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: "Unauthorized" });
    });

    it("returns 401 when token does not match API_SECRET", async () => {
        vi.spyOn(cloudflare, "getEnv").mockReturnValue({
            SUBSCRIBERS: createMockKv(),
            API_SECRET: SECRET,
        });

        const res = await get("Bearer wrong");
        expect(res.status).toBe(401);
    });

    it("returns the list of subscriber emails", async () => {
        const kv = createMockKv({
            "email:a@x.com": JSON.stringify({ email: "a@x.com" }),
            "email:b@x.com": JSON.stringify({ email: "b@x.com" }),
            "config:default": "{}", // should not be included
        });
        vi.spyOn(cloudflare, "getEnv").mockReturnValue({
            SUBSCRIBERS: kv,
            API_SECRET: SECRET,
        });

        const res = await get(`Bearer ${SECRET}`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ subscribers: ["a@x.com", "b@x.com"] });
    });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

`next/src/app/api/subscribers/route.ts`:

```ts
import { getEnv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";

export const runtime = "edge";

export async function GET(request: Request): Promise<Response> {
    const env = getEnv();
    if (!env.API_SECRET) {
        return withCors(
            jsonResponse({ error: "Server misconfigured: API_SECRET not set" }, 500),
        );
    }

    const auth = request.headers.get("Authorization");
    if (!auth || auth !== `Bearer ${env.API_SECRET}`) {
        return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    }

    const emails: string[] = [];
    let cursor: string | undefined;
    do {
        const result = await env.SUBSCRIBERS.list({ prefix: "email:", cursor });
        for (const key of result.keys) {
            const value = (await env.SUBSCRIBERS.get(key.name, "json")) as
                | { email?: string }
                | null;
            if (value?.email) emails.push(value.email);
        }
        cursor = result.list_complete ? undefined : result.cursor;
    } while (cursor);

    return withCors(jsonResponse({ subscribers: emails }));
}
```

- [ ] **Step 4: Run, expect pass**

```bash
cd next && pnpm test src/app/api/subscribers/route.test.ts 2>&1 | tail -5
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add next/src/app/api/subscribers/
git commit -m "Port GET /api/subscribers (auth-gated) to Next.js Route Handler"
```

### Task C4: /api/config GET + PUT

Ports `handleGetConfig` (`workers-site/index.js:126-145`) and `handlePutConfig` (`:147-171`). Same file, two methods.

**Files:**
- Create: `next/src/app/api/config/route.ts`
- Test: `next/src/app/api/config/route.test.ts`

- [ ] **Step 1: Test**

`next/src/app/api/config/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";
import * as cloudflare from "@/lib/cloudflare";

const SECRET = "unit-test-api-secret";
const CONFIG_KEY = "unit-test-config-key";

beforeEach(() => {
    vi.resetModules();
});

async function getConfig(authHeader?: string): Promise<Response> {
    const headers: Record<string, string> = {};
    if (authHeader) headers.Authorization = authHeader;
    const { GET } = await import("./route");
    return GET(new Request("https://example.com/api/config", { headers }));
}

async function putConfig(
    body: unknown,
    authHeader?: string,
): Promise<Response> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authHeader) headers.Authorization = authHeader;
    const { PUT } = await import("./route");
    return PUT(
        new Request("https://example.com/api/config", {
            method: "PUT",
            headers,
            body: typeof body === "string" ? body : JSON.stringify(body),
        }),
    );
}

describe("GET /api/config", () => {
    it("returns the saved config", async () => {
        const config = { campgrounds: { "recreation.gov": [] }, globalSettings: {} };
        const kv = createMockKv({ "config:campgrounds": JSON.stringify(config) });
        vi.spyOn(cloudflare, "getEnv").mockReturnValue({ SUBSCRIBERS: kv });

        const res = await getConfig();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual(config);
    });

    it("returns 404 when nothing is saved", async () => {
        vi.spyOn(cloudflare, "getEnv").mockReturnValue({
            SUBSCRIBERS: createMockKv(),
        });

        const res = await getConfig();
        expect(res.status).toBe(404);
    });

    it("requires Bearer auth when CONFIG_KEY is set; accepts CONFIG_KEY or API_SECRET", async () => {
        const kv = createMockKv({
            "config:campgrounds": JSON.stringify({ campgrounds: {} }),
        });
        vi.spyOn(cloudflare, "getEnv").mockReturnValue({
            SUBSCRIBERS: kv,
            CONFIG_KEY,
            API_SECRET: SECRET,
        });

        expect((await getConfig()).status).toBe(401);
        expect((await getConfig(`Bearer wrong`)).status).toBe(401);
        expect((await getConfig(`Bearer ${CONFIG_KEY}`)).status).toBe(200);
        expect((await getConfig(`Bearer ${SECRET}`)).status).toBe(200);
    });
});

describe("PUT /api/config", () => {
    it("saves a valid config", async () => {
        const kv = createMockKv();
        vi.spyOn(cloudflare, "getEnv").mockReturnValue({ SUBSCRIBERS: kv });

        const body = { campgrounds: { "recreation.gov": [] }, globalSettings: {} };
        const res = await putConfig(body);

        expect(res.status).toBe(200);
        expect(await kv.get("config:campgrounds", "json")).toEqual(body);
    });

    it("rejects invalid JSON", async () => {
        vi.spyOn(cloudflare, "getEnv").mockReturnValue({ SUBSCRIBERS: createMockKv() });

        const res = await putConfig("not json");
        expect(res.status).toBe(400);
    });

    it("rejects a body missing `campgrounds`", async () => {
        vi.spyOn(cloudflare, "getEnv").mockReturnValue({ SUBSCRIBERS: createMockKv() });

        const res = await putConfig({ globalSettings: {} });
        expect(res.status).toBe(400);
    });

    it("requires CONFIG_KEY auth when CONFIG_KEY is set", async () => {
        vi.spyOn(cloudflare, "getEnv").mockReturnValue({
            SUBSCRIBERS: createMockKv(),
            CONFIG_KEY,
        });

        const body = { campgrounds: {} };
        expect((await putConfig(body)).status).toBe(401);
        expect((await putConfig(body, `Bearer wrong`)).status).toBe(401);
        expect((await putConfig(body, `Bearer ${CONFIG_KEY}`)).status).toBe(200);
    });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

`next/src/app/api/config/route.ts`:

```ts
import { getEnv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";

export const runtime = "edge";

function authorizedForRead(request: Request, env: ReturnType<typeof getEnv>): boolean {
    // If CONFIG_KEY isn't set, fall open (matches the existing Worker).
    if (!env.CONFIG_KEY) return true;
    const auth = request.headers.get("Authorization");
    const accepted = [env.CONFIG_KEY, env.API_SECRET].filter(Boolean) as string[];
    return !!auth && accepted.some((t) => auth === `Bearer ${t}`);
}

function authorizedForWrite(
    request: Request,
    env: ReturnType<typeof getEnv>,
): boolean {
    if (!env.CONFIG_KEY) return true;
    const auth = request.headers.get("Authorization");
    return auth === `Bearer ${env.CONFIG_KEY}`;
}

export async function GET(request: Request): Promise<Response> {
    const env = getEnv();
    if (!authorizedForRead(request, env)) {
        return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    }

    const data = await env.SUBSCRIBERS.get("config:campgrounds", "json");
    if (!data) {
        return withCors(jsonResponse({ error: "No config found" }, 404));
    }
    return withCors(jsonResponse(data));
}

export async function PUT(request: Request): Promise<Response> {
    const env = getEnv();
    if (!authorizedForWrite(request, env)) {
        return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return withCors(jsonResponse({ error: "Invalid JSON" }, 400));
    }

    if (!body || typeof body !== "object" || !("campgrounds" in (body as object))) {
        return withCors(jsonResponse({ error: "Request body must include campgrounds" }, 400));
    }

    await env.SUBSCRIBERS.put("config:campgrounds", JSON.stringify(body));
    return withCors(jsonResponse({ message: "Config saved" }));
}

export async function OPTIONS(): Promise<Response> {
    return withCors(new Response(null, { status: 204 }));
}
```

- [ ] **Step 4: Run, expect pass**

```bash
cd next && pnpm test src/app/api/config/route.test.ts 2>&1 | tail -5
```

Expected: `8 passed`.

- [ ] **Step 5: Commit**

```bash
git add next/src/app/api/config/
git commit -m "Port GET and PUT /api/config to Next.js Route Handler"
```

### Task C5: Full unit-test sweep + typecheck

**Files:** none.

- [ ] **Step 1: Run all tests**

```bash
cd next && pnpm test 2>&1 | tail -15
```

Expected: at least these test files report passing — `cloudflare.test.ts`, `hmac.test.ts`, `responses.test.ts`, `email.test.ts`, `subscribe/route.test.ts`, `unsubscribe/route.test.ts`, `subscribers/route.test.ts`, `config/route.test.ts`. Total passing assertions ≥ 25.

- [ ] **Step 2: Typecheck**

```bash
cd next && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Build**

```bash
cd next && pnpm run cf:build 2>&1 | tail -10
```

Expected: build succeeds. Look at the output for the list of generated routes; should include all four API paths.

---

## Section D: Secret bootstrap and live verification

### Task D1: Set Worker secrets via wrangler

The new `campwatch` Worker needs `API_SECRET` (and optionally `CONFIG_KEY`) to match the values on the existing `campsites-finder` Worker. Without `API_SECRET`, `/api/unsubscribe` and `/api/subscribers` will refuse to operate.

The user owns these secrets locally and on GitHub. This task documents how to mirror them onto the new Worker but cannot be fully automated.

**Files:** none.

- [ ] **Step 1: Confirm wrangler is authenticated to the correct Cloudflare account**

```bash
cd next && pnpm exec wrangler whoami
```

Expected: an account with subdomain `mikeroberts421` (where `campsites-finder` already lives). If wrong account, `wrangler login` first.

- [ ] **Step 2: Set `API_SECRET` on the campwatch Worker**

```bash
cd next && printf '%s' '<existing-API_SECRET-value>' | pnpm exec wrangler secret put API_SECRET
```

Use `printf '%s'` not `echo` so no trailing newline is included — trailing newlines silently break Bearer-token comparisons.

The value must match exactly what's set on `campsites-finder` (so cross-Worker tokens / unsubscribe links remain interchangeable during the dual-Worker period).

- [ ] **Step 3: Set `CONFIG_KEY` on the campwatch Worker (optional)**

If you currently use `CONFIG_KEY` for write protection on the old Worker, mirror it:

```bash
cd next && printf '%s' '<existing-CONFIG_KEY-value>' | pnpm exec wrangler secret put CONFIG_KEY
```

If `CONFIG_KEY` isn't set on the old Worker (i.e. PUTs fall open), skip this step — leaving `CONFIG_KEY` unset on the new Worker keeps the same behavior.

- [ ] **Step 4: Verify the secrets are registered**

```bash
cd next && pnpm exec wrangler secret list
```

Expected output: lists `API_SECRET` (and `CONFIG_KEY` if you set it). Names only, no values.

No commit (no file changes).

### Task D2: Push branch and CI-deploy

**Files:** none.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feature/phase-0b-api-migration
```

- [ ] **Step 2: Watch CI**

```bash
gh run watch --exit-status
```

Expected: workflow completes; new Worker version deployed.

### Task D3: Live smoke tests against both Workers

For each endpoint, hit both Workers and confirm equivalent behavior. The new Worker should match the old Worker's response for every case.

**Files:** none.

- [ ] **Step 1: `/api/config` GET equivalence**

```bash
OLD="https://campsites-finder.mikeroberts421.workers.dev"
NEW="https://campwatch.mikeroberts421.workers.dev"

diff <(curl -s "$OLD/api/config" | python3 -m json.tool) \
     <(curl -s "$NEW/api/config" | python3 -m json.tool)
```

Expected: no diff (both return the same KV-backed config). If 401, set `CONFIG_KEY` in step D1.

- [ ] **Step 2: `/api/subscribe` happy path**

Use a throwaway email:

```bash
TESTEMAIL="phase-0b-smoke-$(date +%s)@example.invalid"

curl -s -X POST "$NEW/api/subscribe" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TESTEMAIL\"}"
```

Expected: `{"message":"Subscribed successfully"}`.

Verify it landed in KV by listing subscribers (needs `API_SECRET`):

```bash
curl -s "$NEW/api/subscribers" -H "Authorization: Bearer <API_SECRET>" | python3 -m json.tool | head -30
```

Expected: the test email appears.

- [ ] **Step 3: `/api/unsubscribe` happy path**

Generate a token for the same email:

```bash
node -e "
const c = require('node:crypto');
const sig = c.createHmac('sha256', '<API_SECRET>').update('$TESTEMAIL').digest('hex');
console.log(sig);
"
```

Then:

```bash
curl -s "$NEW/api/unsubscribe?email=$TESTEMAIL&token=<token-from-above>" | head -20
```

Expected: HTML page containing "Unsubscribed" and the email.

Confirm it's removed:

```bash
curl -s "$NEW/api/subscribers" -H "Authorization: Bearer <API_SECRET>" | python3 -c "
import json,sys
d=json.load(sys.stdin)
emails=d.get('subscribers',[])
print('total:',len(emails))
print('test email present:','$TESTEMAIL' in emails)
"
```

Expected: `test email present: False`.

- [ ] **Step 4: Confirm the old Worker still works**

```bash
curl -sI "$OLD/" | head -2
curl -s "$OLD/api/config" | python3 -c "import json,sys; d=json.load(sys.stdin); print('campgrounds:', len(d.get('campgrounds',{}).get('recreation.gov',[])))"
```

Expected: HTTP/2 200 on the SPA, and 9 campgrounds via `/api/config`. The old Worker is untouched by this work.

No commit (no file changes).

---

## Section E: PR

### Task E1: Open the PR

**Files:** none.

- [ ] **Step 1: Open PR**

```bash
gh pr create --base main --head feature/phase-0b-api-migration \
    --title "Phase 0b: Port API routes to Next.js Route Handlers" \
    --body "$(cat <<'EOF'
## Summary

- All four API endpoints from workers-site/index.js ported to Next.js Route Handlers under `next/src/app/api/`
- Same KV namespace, same auth model, same response shapes — verified against the existing campsites-finder Worker
- Vitest installed with mocked KV; tests cover happy paths and key error cases for every endpoint
- Worker secrets (API_SECRET, optionally CONFIG_KEY) mirrored onto the campwatch Worker

The existing campsites-finder Worker is untouched. The notifier still talks to it. Cutover happens in Phase 0d.

Implements Phase 0b of `docs/superpowers/specs/2026-05-14-multi-user-rework-design.md`.

## Test plan

- [x] All unit tests pass (`pnpm test`)
- [x] tsc clean
- [x] `cf:build` clean
- [x] CI deploys without errors
- [x] `curl <new>/api/config` returns same JSON as `curl <old>/api/config`
- [x] Subscribe + unsubscribe round-trip works against the new Worker, with KV state visible to both Workers
- [x] Old Worker's `/api/config` still returns 9 campgrounds (no production impact)
EOF
)"
```

- [ ] **Step 2: Hand off to the user for review**

Tell the user the PR is open and request a review. Do not merge yet.

---

## Self-Review Checklist (for the implementer)

Before declaring this plan complete, walk through:

1. **Spec coverage**: Phase 0b in the spec says "Migrate the existing API routes (/api/config, /api/subscribe, /api/unsubscribe, /api/subscribers) from workers-site/index.js to Next.js Route Handlers." All four endpoints have a task. The HMAC, JSON, CORS, and email helpers are split out as shared modules and tested independently.
2. **No production cutover**: confirmed — Section D verifies both Workers serve identical APIs but does not switch notifier or DNS. That's Phase 0d.
3. **Notifier unaffected**: the notifier reads from `<old-Worker>/api/subscribers` and `<old-Worker>/api/config` — both unchanged. No file in `notifier/` is touched.
4. **Same KV namespace**: every handler reads/writes against `getEnv().SUBSCRIBERS`, which is the same binding both Workers use. There's no data migration step because there's no data move.
5. **Placeholder scan**: every step has concrete commands and full code blocks. No `TODO`, no "implement appropriate X."
6. **Type consistency**: `getEnv()`, `getKv()`, `CampWatchEnv`, `MockKvNamespace`, `generateUnsubscribeToken`/`verifyUnsubscribeToken`, `jsonResponse`/`withCors`, `isValidEmail`/`normalizeEmail` — all referenced names match between the tests and the implementations in this plan.
