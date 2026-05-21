# Phase 1: Auth Foundation (Google OAuth + Sessions + Roles) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone can sign in with Google on the campwatch Worker. A signed-in user gets a server-side session (opaque KV-backed token), a `user:<email>:profile` record, and a curator role if their email matches `BOOTSTRAP_ADMIN_EMAIL` and no curator yet exists. The TopBar shows their status; a new `/app/account` page lets them update their name, sign out, or delete their account. The campground dashboard at `/app` behaves exactly as today — shared config, no per-user data yet. That comes in Phase 2.

**Architecture:**

```
                Visitor
                   │
                   ▼
   ┌──────────────────────────────┐
   │  Next.js middleware.ts        │  Reads session cookie, attaches
   │  attaches sessionUser to req  │  user (or null) to request context.
   └─────────────┬────────────────┘
                 │
       ┌─────────┴─────────┐
       ▼                   ▼
  /app, /app/account    /auth/google/start
  (requires session     /auth/google/callback
   only for /account)   /auth/logout
                        /api/me

                                    │
                                    ▼
                       ┌─────────────────────────────┐
                       │  KV (SUBSCRIBERS namespace) │
                       │                             │
                       │  user:<email>:profile       │ ← new
                       │  session:<sessionId>        │ ← new
                       │  config:campgrounds         │ ← existing (untouched in P1)
                       │  email:<email>              │ ← existing
                       └─────────────────────────────┘
```

**Non-goals for Phase 1:**

- Per-user campground lists (`user:<email>:campgrounds`). Phase 2 introduces these.
- Anything on `/app` requires auth. Anonymous visitors still see the shared dashboard.
- `/api/config` auth model changes. Stays as it is from Phase 0b.
- Curator-gated `/api/admin/*` routes. Phase 2 introduces these.

**Tech Stack:** Next.js 16 Route Handlers + middleware, `@opennextjs/cloudflare` bindings, Cloudflare Workers crypto for HMAC + token generation, Google OAuth 2.0, Vitest with the existing KV mock.

**Required reading:**
- `next/src/lib/cloudflare.ts` — `getEnv()` and `getKv()` accessors from Phase 0b.
- `next/src/lib/__mocks__/cloudflare-test-helpers.ts` — the `createMockKv()` factory.
- `next/src/lib/hmac.ts` — existing HMAC implementation (we'll reuse the same approach).
- `next/src/lib/responses.ts` — `jsonResponse()` and `withCors()` helpers.

**Critical: this phase has manual user steps.** Specifically:
1. Register a Google OAuth client (Google Cloud Console).
2. Add four GitHub secrets and four Cloudflare Worker secrets (via the deploy workflow's `secrets` input).

These are documented in Section A. The plan can't execute past Section B without them.

---

## Pre-flight

### Task 0: Branch + green build

- [ ] **Step 1: Branch from main**

```bash
cd "/Users/mikeroberts/Library/Mobile Documents/com~apple~CloudDocs/Desktop/Websites/campsites-react"
git checkout main && git pull --ff-only
git checkout -b feature/phase-1-google-oauth
git status -s   # expect clean
```

- [ ] **Step 2: Confirm next/ builds and tests are green**

```bash
cd next && pnpm install --frozen-lockfile && pnpm test 2>&1 | tail -3 && pnpm exec tsc --noEmit && pnpm run cf:build 2>&1 | tail -3
```

Expected: tests pass, tsc clean, cf:build complete.

---

## Section A: Provisioning (USER ACTIONS — read carefully)

### Task A1: Create a Google OAuth client (user action)

**Files:** none.

This is a one-time setup in Google Cloud Console.

1. Visit https://console.cloud.google.com/apis/credentials and sign in with the Google account that should own this OAuth client (your personal account is fine).
2. If you don't have a project, create one called "CampWatch" or similar.
3. **OAuth consent screen** (left sidebar): configure the consent screen if you haven't.
    - User Type: External
    - App name: "CampWatch"
    - Authorized domains: leave empty
    - Save through; you don't need to publish to production for personal use, "Testing" mode is fine for now (allows up to 100 test users).
    - Under **Test users**, add your own email so you can sign in while in testing mode.
4. **Credentials → Create Credentials → OAuth client ID**:
    - Application type: **Web application**
    - Name: "CampWatch Web"
    - Authorized JavaScript origins:
        - `https://campwatch.mikeroberts421.workers.dev`
        - `http://localhost:3000`
    - Authorized redirect URIs:
        - `https://campwatch.mikeroberts421.workers.dev/auth/google/callback`
        - `http://localhost:3000/auth/google/callback`
5. Click Create. Google shows the `Client ID` and `Client secret` once — copy both into a password manager.

### Task A2: Add four GitHub Secrets (user action)

Visit https://github.com/robertsmikej/campsites-react/settings/secrets/actions and add:

| Secret name | Value | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` | The Client ID from A1 (looks like `xxxxx.apps.googleusercontent.com`) | |
| `GOOGLE_CLIENT_SECRET` | The Client Secret from A1 | Treat as sensitive |
| `SESSION_SECRET` | Generate a random 32-byte string and hex-encode it. From any shell: `openssl rand -hex 32` | Used to sign the OAuth `state` cookie |
| `BOOTSTRAP_ADMIN_EMAIL` | Your Google account email (the one you'll sign in with first). Must be lowercase, e.g. `mike.roberts@animalfarm.inc` | Granted curator role on first sign-in only |

Tell me when these are set and I'll move on. (The plan's later tasks assume they're available.)

### Task A3: Mirror the four secrets onto the campwatch Worker via CI

**Files:**
- Modify: `.github/workflows/deploy-next.yml`

- [ ] **Step 1: Update the `secrets` and `env` blocks on the deploy step**

Current shape (from Phase 0b):

```yaml
- name: Deploy Worker
  uses: cloudflare/wrangler-action@v3
  with:
      apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      workingDirectory: next
      command: deploy
      secrets: |
          API_SECRET
          CONFIG_KEY
  env:
      API_SECRET: ${{ secrets.SUBSCRIBER_API_SECRET }}
      CONFIG_KEY: ${{ secrets.CONFIG_KEY }}
```

Replace with:

```yaml
- name: Deploy Worker
  uses: cloudflare/wrangler-action@v3
  with:
      apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      workingDirectory: next
      command: deploy
      secrets: |
          API_SECRET
          CONFIG_KEY
          GOOGLE_CLIENT_ID
          GOOGLE_CLIENT_SECRET
          SESSION_SECRET
          BOOTSTRAP_ADMIN_EMAIL
  env:
      API_SECRET: ${{ secrets.SUBSCRIBER_API_SECRET }}
      CONFIG_KEY: ${{ secrets.CONFIG_KEY }}
      GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}
      GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}
      SESSION_SECRET: ${{ secrets.SESSION_SECRET }}
      BOOTSTRAP_ADMIN_EMAIL: ${{ secrets.BOOTSTRAP_ADMIN_EMAIL }}
```

- [ ] **Step 2: Update the typed env types**

Open `next/src/env.d.ts` and extend the global interface:

```ts
/// <reference types="@cloudflare/workers-types" />

declare global {
    interface CloudflareEnv {
        SUBSCRIBERS: KVNamespace;
        API_SECRET?: string;
        CONFIG_KEY?: string;
        GOOGLE_CLIENT_ID?: string;
        GOOGLE_CLIENT_SECRET?: string;
        SESSION_SECRET?: string;
        BOOTSTRAP_ADMIN_EMAIL?: string;
    }
}

export {};
```

- [ ] **Step 3: Update the `CampWatchEnv` interface in `cloudflare.ts`**

```ts
export interface CampWatchEnv {
    SUBSCRIBERS: KVNamespace;
    API_SECRET?: string;
    CONFIG_KEY?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    SESSION_SECRET?: string;
    BOOTSTRAP_ADMIN_EMAIL?: string;
}
```

- [ ] **Step 4: tsc + commit**

```bash
cd next && pnpm exec tsc --noEmit
cd ..
git add .github/workflows/deploy-next.yml next/src/env.d.ts next/src/lib/cloudflare.ts
git commit -m "Wire Google OAuth secrets into deploy workflow and env types"
```

(No deploy yet — we'll deploy after Section C lands.)

---

## Section B: Crypto + session storage primitives

### Task B1: Random token generator and signed-state helpers

**Files:**
- Create: `next/src/lib/crypto-helpers.ts`
- Test: `next/src/lib/crypto-helpers.test.ts`

Two helpers:

1. `generateOpaqueToken(byteLength = 32)` — returns a hex-encoded random string of `2*byteLength` characters. Uses Web Crypto's `getRandomValues`.
2. `signValue(value, secret)` and `verifySignedValue(signedValue, secret)` — HMAC-sign a short string (for the OAuth state cookie). Format: `<base64-url-payload>.<hex-hmac>`. Constant-time verify.

We could reuse the HMAC code from `hmac.ts`, but that one is email-specific in its API. Cleaner to have a generic-value version.

- [ ] **Step 1: Write the failing test**

`next/src/lib/crypto-helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateOpaqueToken, signValue, verifySignedValue } from "./crypto-helpers";

describe("generateOpaqueToken", () => {
    it("returns a 64-char hex string by default", () => {
        const t = generateOpaqueToken();
        expect(t).toMatch(/^[a-f0-9]{64}$/);
    });

    it("produces different tokens on repeated calls", () => {
        expect(generateOpaqueToken()).not.toBe(generateOpaqueToken());
    });

    it("respects custom byte length", () => {
        expect(generateOpaqueToken(16)).toMatch(/^[a-f0-9]{32}$/);
    });
});

describe("signValue / verifySignedValue", () => {
    const SECRET = "test-secret";

    it("round-trips a value", async () => {
        const signed = await signValue("hello-world", SECRET);
        expect(await verifySignedValue(signed, SECRET)).toBe("hello-world");
    });

    it("rejects values signed with a different secret", async () => {
        const signed = await signValue("hello", SECRET);
        expect(await verifySignedValue(signed, "other")).toBeNull();
    });

    it("rejects tampered payloads", async () => {
        const signed = await signValue("hello", SECRET);
        const tampered = signed.replace(/.$/, signed.endsWith("a") ? "b" : "a");
        expect(await verifySignedValue(tampered, SECRET)).toBeNull();
    });

    it("rejects malformed input without throwing", async () => {
        expect(await verifySignedValue("no-dot", SECRET)).toBeNull();
        expect(await verifySignedValue("", SECRET)).toBeNull();
    });
});
```

- [ ] **Step 2: Run, expect fail**

```
cd next && pnpm test src/lib/crypto-helpers.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Implement**

`next/src/lib/crypto-helpers.ts`:

```ts
const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(input: string): string {
    return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): string {
    const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
    const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
    return atob(b64);
}

export function generateOpaqueToken(byteLength = 32): string {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
}

async function hmacHex(value: string, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
    return bytesToHex(new Uint8Array(sig));
}

export async function signValue(value: string, secret: string): Promise<string> {
    const payload = base64UrlEncode(value);
    const sig = await hmacHex(payload, secret);
    return `${payload}.${sig}`;
}

export async function verifySignedValue(
    signed: string,
    secret: string,
): Promise<string | null> {
    const dot = signed.lastIndexOf(".");
    if (dot < 1 || dot >= signed.length - 1) return null;
    const payload = signed.slice(0, dot);
    const sig = signed.slice(dot + 1);
    if (!/^[a-f0-9]+$/i.test(sig)) return null;

    const expected = await hmacHex(payload, secret);
    if (expected.length !== sig.length) return null;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
        mismatch |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    }
    if (mismatch !== 0) return null;

    try {
        return base64UrlDecode(payload);
    } catch {
        return null;
    }
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```
git add next/src/lib/crypto-helpers.ts next/src/lib/crypto-helpers.test.ts
git commit -m "Add opaque token generator and signed-value HMAC helpers"
```

### Task B2: User profile types and storage

**Files:**
- Create: `next/src/types/user.ts`
- Create: `next/src/lib/users.ts`
- Test: `next/src/lib/users.test.ts`

- [ ] **Step 1: Types**

`next/src/types/user.ts`:

```ts
export type UserRole = "curator";

export interface UserProfile {
    email: string;
    name: string;
    picture?: string;
    roles: UserRole[];
    createdAt: string;          // ISO timestamp
    notifications?: {
        enabled: boolean;
        frequencyMinutes: 15 | 60 | 240;
    };
}
```

- [ ] **Step 2: Test**

`next/src/lib/users.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "./__mocks__/cloudflare-test-helpers";
import * as cloudflare from "./cloudflare";
import {
    getUserProfile,
    createUserProfile,
    updateUserProfile,
    deleteUser,
    bootstrapCuratorIfFirst,
    listCurators,
} from "./users";

beforeEach(() => {
    vi.resetModules();
});

describe("user profile CRUD", () => {
    it("creates and reads a profile", async () => {
        const kv = createMockKv();
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        await createUserProfile("user@example.com", {
            name: "User",
            picture: "https://example.com/avatar.png",
        });

        const profile = await getUserProfile("user@example.com");
        expect(profile).toMatchObject({
            email: "user@example.com",
            name: "User",
            picture: "https://example.com/avatar.png",
            roles: [],
        });
        expect(typeof profile?.createdAt).toBe("string");
    });

    it("returns null for unknown email", async () => {
        vi.spyOn(cloudflare, "getKv").mockReturnValue(createMockKv());
        expect(await getUserProfile("nope@example.com")).toBeNull();
    });

    it("merges patches via updateUserProfile", async () => {
        const kv = createMockKv({
            "user:user@example.com:profile": JSON.stringify({
                email: "user@example.com",
                name: "Old",
                roles: [],
                createdAt: "2026-01-01T00:00:00.000Z",
            }),
        });
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        const updated = await updateUserProfile("user@example.com", { name: "New" });
        expect(updated?.name).toBe("New");

        const reread = await getUserProfile("user@example.com");
        expect(reread?.name).toBe("New");
        expect(reread?.createdAt).toBe("2026-01-01T00:00:00.000Z");
    });

    it("deleteUser removes profile + sessions + per-user keys", async () => {
        const kv = createMockKv({
            "user:user@example.com:profile": "{}",
            "user:user@example.com:campgrounds": "{}",
            "session:abc": JSON.stringify({ email: "user@example.com" }),
            "session:other": JSON.stringify({ email: "someone-else@example.com" }),
        });
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        await deleteUser("user@example.com");

        expect(await kv.get("user:user@example.com:profile")).toBeNull();
        expect(await kv.get("user:user@example.com:campgrounds")).toBeNull();
        expect(await kv.get("session:abc")).toBeNull();
        expect(await kv.get("session:other")).not.toBeNull();
    });
});

describe("bootstrap curator", () => {
    it("grants curator on first matching sign-in when no curator exists", async () => {
        const kv = createMockKv({
            "user:bootstrap@example.com:profile": JSON.stringify({
                email: "bootstrap@example.com",
                name: "Boss",
                roles: [],
                createdAt: "2026-01-01T00:00:00.000Z",
            }),
        });
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        const granted = await bootstrapCuratorIfFirst("bootstrap@example.com", "bootstrap@example.com");
        expect(granted).toBe(true);
        expect((await getUserProfile("bootstrap@example.com"))?.roles).toContain("curator");
    });

    it("does not grant curator if a curator already exists", async () => {
        const kv = createMockKv({
            "user:existing-curator@example.com:profile": JSON.stringify({
                email: "existing-curator@example.com",
                name: "Existing",
                roles: ["curator"],
                createdAt: "2026-01-01T00:00:00.000Z",
            }),
            "user:bootstrap@example.com:profile": JSON.stringify({
                email: "bootstrap@example.com",
                name: "Boss",
                roles: [],
                createdAt: "2026-01-02T00:00:00.000Z",
            }),
        });
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        const granted = await bootstrapCuratorIfFirst("bootstrap@example.com", "bootstrap@example.com");
        expect(granted).toBe(false);
        expect((await getUserProfile("bootstrap@example.com"))?.roles).not.toContain("curator");
    });

    it("does not grant when emails don't match", async () => {
        const kv = createMockKv({
            "user:other@example.com:profile": JSON.stringify({
                email: "other@example.com",
                name: "Other",
                roles: [],
                createdAt: "2026-01-01T00:00:00.000Z",
            }),
        });
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        const granted = await bootstrapCuratorIfFirst("other@example.com", "bootstrap@example.com");
        expect(granted).toBe(false);
    });

    it("listCurators returns curator emails", async () => {
        const kv = createMockKv({
            "user:a@x.com:profile": JSON.stringify({ email: "a@x.com", roles: ["curator"] }),
            "user:b@x.com:profile": JSON.stringify({ email: "b@x.com", roles: [] }),
            "user:c@x.com:profile": JSON.stringify({ email: "c@x.com", roles: ["curator"] }),
        });
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        const curators = await listCurators();
        expect(curators.sort()).toEqual(["a@x.com", "c@x.com"]);
    });
});
```

- [ ] **Step 3: Implement**

`next/src/lib/users.ts`:

```ts
import { getKv } from "./cloudflare";
import type { UserProfile } from "@/types/user";

const PROFILE_PREFIX = "user:";
const PROFILE_SUFFIX = ":profile";
const SESSION_PREFIX = "session:";

function profileKey(email: string): string {
    return `${PROFILE_PREFIX}${email}${PROFILE_SUFFIX}`;
}

function campgroundsKey(email: string): string {
    return `${PROFILE_PREFIX}${email}:campgrounds`;
}

export async function getUserProfile(email: string): Promise<UserProfile | null> {
    const kv = getKv();
    return (await kv.get(profileKey(email), "json")) as UserProfile | null;
}

export async function createUserProfile(
    email: string,
    seed: Pick<UserProfile, "name"> & Partial<Pick<UserProfile, "picture">>,
): Promise<UserProfile> {
    const kv = getKv();
    const profile: UserProfile = {
        email,
        name: seed.name,
        picture: seed.picture,
        roles: [],
        createdAt: new Date().toISOString(),
    };
    await kv.put(profileKey(email), JSON.stringify(profile));
    return profile;
}

export async function updateUserProfile(
    email: string,
    patch: Partial<Omit<UserProfile, "email" | "createdAt">>,
): Promise<UserProfile | null> {
    const kv = getKv();
    const existing = (await kv.get(profileKey(email), "json")) as UserProfile | null;
    if (!existing) return null;
    const merged: UserProfile = { ...existing, ...patch };
    await kv.put(profileKey(email), JSON.stringify(merged));
    return merged;
}

export async function deleteUser(email: string): Promise<void> {
    const kv = getKv();
    await kv.delete(profileKey(email));
    await kv.delete(campgroundsKey(email));

    // Find and delete all sessions owned by this user
    let cursor: string | undefined;
    do {
        const list = await kv.list({ prefix: SESSION_PREFIX, cursor });
        for (const key of list.keys) {
            const session = (await kv.get(key.name, "json")) as { email?: string } | null;
            if (session?.email === email) {
                await kv.delete(key.name);
            }
        }
        cursor = list.list_complete ? undefined : list.cursor;
    } while (cursor);
}

export async function listCurators(): Promise<string[]> {
    const kv = getKv();
    const curators: string[] = [];
    let cursor: string | undefined;
    do {
        const list = await kv.list({ prefix: PROFILE_PREFIX, cursor });
        for (const key of list.keys) {
            if (!key.name.endsWith(PROFILE_SUFFIX)) continue;
            const profile = (await kv.get(key.name, "json")) as UserProfile | null;
            if (profile?.roles?.includes("curator") && profile.email) {
                curators.push(profile.email);
            }
        }
        cursor = list.list_complete ? undefined : list.cursor;
    } while (cursor);
    return curators;
}

export async function bootstrapCuratorIfFirst(
    email: string,
    bootstrapEmail: string | undefined,
): Promise<boolean> {
    if (!bootstrapEmail || email.toLowerCase() !== bootstrapEmail.toLowerCase()) return false;
    const curators = await listCurators();
    if (curators.length > 0) return false;
    const updated = await updateUserProfile(email, { roles: ["curator"] });
    return !!updated;
}
```

- [ ] **Step 4: Run, expect pass. Commit.**

```
git add next/src/types/user.ts next/src/lib/users.ts next/src/lib/users.test.ts
git commit -m "Add user profile types, KV storage, and curator bootstrap"
```

### Task B3: Session storage

**Files:**
- Create: `next/src/lib/sessions.ts`
- Test: `next/src/lib/sessions.test.ts`

Session shape:

```ts
export interface Session {
    id: string;            // opaque token (32 hex chars per the generator)
    email: string;
    createdAt: string;
    expiresAt: string;     // 30 days out
    userAgent?: string;
}
```

Helpers:
- `createSession(email, request)` — generates id, stores in KV with 30-day expiry, returns `{ session, cookie }` where `cookie` is the full `Set-Cookie` header value.
- `readSession(request)` — reads cookie, looks up KV, validates `expiresAt`, returns the session or null. Deletes expired sessions opportunistically.
- `destroySession(request)` — looks up the session id from the cookie, deletes the KV entry, returns a clearing cookie value (Max-Age=0).
- `SESSION_COOKIE = "campwatch_session"`

Tests cover round-trip, expiry rejection, and the destroy flow. Implementation uses `generateOpaqueToken` from `crypto-helpers.ts`. Cookie attributes: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`.

Detailed implementation provided in the plan body would be repetitive; the contract above is enough for the implementer to write it. Tests should verify the contract end-to-end with the mock KV.

Commit:
```
git add next/src/lib/sessions.ts next/src/lib/sessions.test.ts
git commit -m "Add KV-backed opaque session tokens with HttpOnly cookies"
```

---

## Section C: OAuth route handlers

### Task C1: Google OAuth helper module

**Files:**
- Create: `next/src/lib/google-oauth.ts`
- Test: `next/src/lib/google-oauth.test.ts` (limited — JWKS verification is integration-only)

Helpers:
- `buildAuthorizationUrl({ clientId, redirectUri, state, scopes })` → returns the Google auth URL with all params.
- `exchangeCodeForToken({ code, clientId, clientSecret, redirectUri })` → POST to `https://oauth2.googleapis.com/token`, returns `{ id_token, access_token }` or throws.
- `verifyIdToken(idToken)` → fetches Google's JWKS (cached in module-level Map with TTL), verifies the JWT signature, returns the payload `{ email, email_verified, name, picture, aud, iss, exp }` or throws.

The JWKS fetch + cache is the trickiest part. Use this skeleton:

```ts
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

interface CachedJwks {
    keys: JsonWebKey[];
    fetchedAt: number;
}

let jwksCache: CachedJwks | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

async function getJwks(): Promise<JsonWebKey[]> {
    if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
        return jwksCache.keys;
    }
    const r = await fetch(JWKS_URL);
    if (!r.ok) throw new Error(`JWKS fetch failed: ${r.status}`);
    const data = (await r.json()) as { keys: JsonWebKey[] };
    jwksCache = { keys: data.keys, fetchedAt: Date.now() };
    return data.keys;
}
```

Then `verifyIdToken`:
1. Split the JWT on `.` → `[header, payload, signature]`.
2. Decode header (base64url JSON) → find `kid`.
3. Find the matching JWK from `getJwks()`.
4. Import the JWK via `crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"])`.
5. Base64url-decode the signature, verify against `${header}.${payload}` bytes.
6. Decode payload, validate `iss === "https://accounts.google.com"`, `aud === clientId`, `exp > now`, `email_verified === true`.
7. Return the payload.

Tests focus on:
- `buildAuthorizationUrl` produces the right URL shape (param order doesn't matter; verify presence of `client_id`, `redirect_uri`, `state`, `response_type=code`, `scope`).
- `verifyIdToken` rejects malformed tokens (no `.`, wrong segment count) without throwing — returns null or throws a specific error your code path catches.

Real JWT signature verification is integration territory — accept that the unit test for `verifyIdToken` is limited to malformed-input cases. End-to-end correctness lives in the live smoke at Section G.

Commit:
```
git add next/src/lib/google-oauth.ts next/src/lib/google-oauth.test.ts
git commit -m "Add Google OAuth URL builder, token exchange, and ID token verifier"
```

### Task C2: `/auth/google/start` Route Handler

**Files:**
- Create: `next/src/app/auth/google/start/route.ts`
- Test: `next/src/app/auth/google/start/route.test.ts`

Behavior:
1. Generate a random state token (`generateOpaqueToken(16)`).
2. Optionally accept `?returnTo=<path>` (must start with `/` and not contain `://`) for post-auth redirect.
3. Sign `{ state, returnTo }` (JSON-serialized) with `SESSION_SECRET` via `signValue`.
4. Set the signed value in a short-lived (10 min) HttpOnly cookie named `campwatch_oauth_state`.
5. Build the Google authorization URL with that state and `redirect_uri = <origin>/auth/google/callback`.
6. Return `Response.redirect(authUrl, 302)`.

If `GOOGLE_CLIENT_ID` or `SESSION_SECRET` is unset, return 500 with a clear error.

Tests verify the redirect Location header and the state cookie shape.

Commit:
```
git add next/src/app/auth/google/start/
git commit -m "Add GET /auth/google/start route handler"
```

### Task C3: `/auth/google/callback` Route Handler

**Files:**
- Create: `next/src/app/auth/google/callback/route.ts`
- Test: `next/src/app/auth/google/callback/route.test.ts`

Behavior:
1. Read `state` from query params.
2. Read `campwatch_oauth_state` cookie, verify signature, parse the inner `{ state, returnTo }`. Reject if mismatch.
3. Read `code` from query params. Reject if missing.
4. Exchange code for token via `exchangeCodeForToken`.
5. Verify the ID token. Reject if `email_verified !== true`.
6. Normalize the email (lowercase, trim).
7. Look up `user:<email>:profile`. If missing, `createUserProfile(email, { name, picture })`.
8. `bootstrapCuratorIfFirst(email, env.BOOTSTRAP_ADMIN_EMAIL)`.
9. Create a session via `createSession(email, request)`.
10. Build response: `Response.redirect(returnTo || "/app", 302)` with both the new session cookie AND a clearing cookie for `campwatch_oauth_state` (Max-Age=0).

On any error: redirect to `/?authError=<reason>` and clear the OAuth state cookie. Don't leak details.

Tests mock `exchangeCodeForToken` and `verifyIdToken` so the route logic is tested without hitting real Google. Use `vi.mock` to swap the module.

Commit:
```
git add next/src/app/auth/google/callback/
git commit -m "Add GET /auth/google/callback route handler"
```

### Task C4: `/auth/logout`

**Files:**
- Create: `next/src/app/auth/logout/route.ts`
- Test: `next/src/app/auth/logout/route.test.ts`

POST `/auth/logout`:
1. Read the session cookie.
2. Call `destroySession(request)` to delete the KV entry.
3. Return `Response.redirect("/", 302)` with the clearing cookie.

Tests: with valid session → KV entry removed; without session → still 302s without throwing.

Commit:
```
git add next/src/app/auth/logout/
git commit -m "Add POST /auth/logout route handler"
```

### Task C5: `/api/me`

**Files:**
- Create: `next/src/app/api/me/route.ts`
- Test: `next/src/app/api/me/route.test.ts`

GET: returns `{ email, name, picture, roles, notifications }` from the user profile. 401 if not authenticated.

PATCH: accepts a JSON body with `{ name?, notifications? }`. Validates, calls `updateUserProfile`. 401 if not authenticated.

DELETE: calls `deleteUser(email)` and `destroySession(request)`. Returns 204 with clearing cookie. 401 if not authenticated.

Auth check uses `readSession(request)` from `sessions.ts`.

Commit:
```
git add next/src/app/api/me/
git commit -m "Add GET/PATCH/DELETE /api/me route handler"
```

---

## Section D: Middleware (optional for Phase 1)

Phase 1's protected surface is only `/app/account`. Anonymous visitors to `/app` (the existing dashboard) still see content. So strict middleware isn't required — each route can do its own session check.

We'll skip middleware in Phase 1 and add it in Phase 2 when there are more protected routes.

---

## Section E: UI integration

### Task E1: `useAuth` hook

**Files:**
- Create: `next/src/hooks/use-auth.ts`

Client hook that calls `GET /api/me` on mount, caches the result in component state, and exposes:

```ts
interface AuthState {
    user: UserProfile | null;
    isLoading: boolean;
    isCurator: boolean;
    refresh: () => Promise<void>;
}
```

401 from `/api/me` means `user = null` (not signed in). 200 means signed in. Other errors → `user = null` + a console warning.

Commit:
```
git add next/src/hooks/use-auth.ts
git commit -m "Add useAuth hook backed by /api/me"
```

### Task E2: TopBar sign-in / account menu

**Files:**
- Modify: `next/src/components/top-bar.tsx`

Add a right-side area that renders:

- If `isLoading` → small skeleton circle
- If `user` exists → shadcn `Avatar` with the user's picture (or initials fallback), wrapped in a `DropdownMenu` with items: `Account` (link to `/app/account`), `Sign out` (calls POST `/auth/logout` then refreshes the page)
- If no `user` → a `Button` "Sign in" that links to `/auth/google/start?returnTo=/app`

The TopBar's existing prop signature stays — add an `auth?: AuthState` prop (defaulting to undefined so callers without auth still render fine).

The `/app` page wires `useAuth()` and passes the result as `auth={authState}`.

Commit:
```
git add next/src/components/top-bar.tsx
git commit -m "Add sign-in button + account menu to TopBar"
```

### Task E3: `/app/account` page

**Files:**
- Create: `next/src/app/app/account/page.tsx`

Client component. Uses `useAuth()`. If `user === null && !isLoading`, redirect via `router.replace("/auth/google/start?returnTo=/app/account")`.

Layout:

```
+--------------------------------------------------+
| Avatar  |  Name (editable text input)            |
|         |  email@example.com (read-only)         |
|         |  Member since 2026-05-15               |
+--------------------------------------------------+
| [ Save changes ]   [ Sign out ]                  |
+--------------------------------------------------+
|                                                  |
| Danger zone                                      |
|   [ Delete account ]                             |
+--------------------------------------------------+
```

"Save changes" PATCHes `/api/me` with `{ name }`. "Sign out" POSTs to `/auth/logout` and navigates to `/`. "Delete account" opens a shadcn `AlertDialog` confirming "this removes your profile and any watchlist data. This cannot be undone." On confirm, DELETE `/api/me` and navigate to `/`.

Commit:
```
git add next/src/app/app/account/
git commit -m "Add /app/account page with name edit, sign out, delete account"
```

### Task E4: Wire `useAuth` into `/app/page.tsx`

**Files:**
- Modify: `next/src/app/app/page.tsx`

Add `const auth = useAuth()` and pass it into the TopBar. Nothing else changes.

Commit:
```
git add next/src/app/app/page.tsx
git commit -m "Wire useAuth into /app dashboard top bar"
```

---

## Section F: Deploy + live verification

### Task F1: Deploy

Push the branch. CI deploys; the new secrets land via the `wrangler-action` `secrets:` input.

```bash
git push -u origin feature/phase-1-google-oauth
gh run watch --exit-status
```

### Task F2: End-to-end sign-in test (manual, in a browser)

1. Open https://campwatch.mikeroberts421.workers.dev/app — TopBar should show "Sign in" button.
2. Click "Sign in" → land on Google's consent screen → approve → bounce back to `/app`.
3. TopBar now shows your avatar. Click → "Account" → `/app/account` page loads with your name and email.
4. Change your name in the input → Save changes → toast confirms.
5. Reload `/app/account` → name persists.
6. Top of `/app` shows the same dashboard as before (no behavior change; shared config still in use).
7. Click avatar → Sign out → bounced to `/`. Reopen `/app/account` → bounced to `/auth/google/start`.
8. Sign in again. Visit `/api/me` directly in browser — returns your profile JSON with `roles: ["curator"]` (because your email matches `BOOTSTRAP_ADMIN_EMAIL` and no curator existed before).
9. Click avatar → Account → Delete account → confirm. Page navigates to `/`. `/api/me` now returns 401.

If any of these fail, debug per `superpowers:systematic-debugging`.

### Task F3: Final smoke

```bash
echo "=== anonymous /app still loads ==="
curl -sI https://campwatch.mikeroberts421.workers.dev/app | head -1

echo "=== /auth/google/start redirects to Google ==="
curl -sI https://campwatch.mikeroberts421.workers.dev/auth/google/start | grep -iE "^HTTP|^location" | head -2

echo "=== /api/me unauth is 401 ==="
curl -s -o /dev/null -w "%{http_code}" https://campwatch.mikeroberts421.workers.dev/api/me

echo "=== existing /api/config still works ==="
curl -s -o /dev/null -w "%{http_code}" https://campwatch.mikeroberts421.workers.dev/api/config

echo "=== notifier flow (cached config) ==="
curl -s -o /dev/null -w "%{http_code}" https://campwatch.mikeroberts421.workers.dev/api/subscribers
```

Expected: 200, 302, 401, 401 (config requires auth), 401.

---

## Section G: PR

```bash
gh pr create --base main --head feature/phase-1-google-oauth \
    --title "Phase 1: Google OAuth + sessions + curator bootstrap" \
    --body "$(cat <<'EOF'
## Summary

Anyone with a Google account can sign in. Sessions are server-side opaque tokens stored in KV (revocable). The first sign-in by BOOTSTRAP_ADMIN_EMAIL gets the curator role; after that, env-based bootstrapping is a no-op.

New surfaces:
- /auth/google/start, /auth/google/callback, /auth/logout
- /api/me (GET/PATCH/DELETE)
- /app/account
- Sign-in button + avatar menu in the TopBar
- useAuth hook backed by /api/me

The campground dashboard at /app behaves exactly as today — shared config, no per-user data yet. That comes in Phase 2.

## Test plan

- [x] All Vitest tests pass (~30 new for users, sessions, crypto-helpers, route handlers)
- [x] tsc --noEmit clean
- [x] cf:build clean
- [x] Live: sign in with Google, see avatar, visit /app/account, update name, sign out, sign back in, see curator role on /api/me, delete account, confirm /api/me 401s after

Implements Phase 1 of docs/superpowers/specs/2026-05-14-multi-user-rework-design.md. Next: Phase 2 (per-user lists).
EOF
)"
```

---

## Self-review checklist

- All new endpoints listed in the spec have a task (start, callback, logout, /api/me).
- Curator bootstrap is documented (Task B2) and tested (no curator → grant; with curator → no-op).
- Session storage is opaque + KV-backed (not JWT). Cookie has HttpOnly + Secure + SameSite=Lax + Path=/ + Max-Age=2592000.
- The OAuth state cookie is HMAC-signed against SESSION_SECRET (Task B1) so a CSRF attacker can't forge the callback.
- Anonymous /app still works. Only /app/account requires auth.
- /api/config auth model is unchanged from Phase 0b. Auth in /api/me is the new addition.
- Manual user steps (Google Cloud Console, GitHub Secrets) are clearly flagged in Section A.
- The deploy workflow mirrors all four new secrets on every deploy via wrangler-action.
- No middleware in Phase 1 — explicit decision documented in Section D.
