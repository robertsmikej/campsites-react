# Verified Send-To Alert Address Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users keep Google login but can route alert emails to a different, verified address (e.g. iCloud for native Apple Mail push), set from the account page.

**Architecture:** `UserProfile` gains `notificationEmail` (verified, in effect) and `pendingNotificationEmail`. PATCH `/api/me` with a custom address stores it as pending and emails a confirmation link to the new address; the link carries `signValue("account|address", API_SECRET)` (existing crypto-helpers, constant-time verify). A new GET route validates the token and promotes pending → verified. The notifier addresses mail to `notificationEmail ?? email`; unsubscribe links keep using the account email (identity key). The account page gets an "Alert delivery" block with the why-blurb.

**Tech Stack:** Next.js App Router, Cloudflare KV, Web Crypto (existing `signValue`/`verifySignedValue` in `@/lib/crypto-helpers`), Resend API, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-10-notification-email-design.md`
(One deviation from spec, decided here: the verify URL carries a single `token` param whose signed payload *contains* `account|address` — `signValue` base64url-encodes the payload into the token — instead of three query params. Same security, simpler route.)

**Repo rules (campwatch):** Commit to `main`. **NEVER push or deploy without Mike's explicit OK.** Stage only files you change (dirty worktree files to leave alone: `.gitignore`, `next/src/components/dashboard/timeline/availability-block.tsx`). Before every commit: `cd next && npx tsc --noEmit && npx vitest run && npm run format:check` (CI enforces Prettier). Notifier changes additionally need manual `cd notifier && npx tsc --noEmit && npx vitest run` (no CI coverage).

---

## File structure

| File | Change |
|---|---|
| `next/src/lib/cloudflare.ts` | Add `RESEND_API_KEY?: string` to `CampWatchEnv` |
| `next/src/lib/verification-email.ts` (create) | Build token + verify URL, send confirmation email via Resend |
| `next/src/lib/verification-email.test.ts` (create) | Token round-trip + Resend payload tests |
| `next/src/types/user.ts` | `notificationEmail?` + `pendingNotificationEmail?` on `UserProfile` |
| `next/src/app/api/me/route.ts` | PATCH accepts `notificationEmail`; pending + send semantics |
| `next/src/app/api/me/route.test.ts` | PATCH flow tests |
| `next/src/app/api/me/verify-notification-email/route.ts` (create) | GET token → promote pending → redirect |
| `next/src/app/api/me/verify-notification-email/route.test.ts` (create) | Verify route tests |
| `next/src/app/api/admin/notification-targets/route.ts` | Pass `notificationEmail` through |
| `next/src/app/api/admin/notification-targets/route.test.ts` | Passthrough test |
| `notifier/check.ts` | `NotificationTarget.notificationEmail?`; send to override |
| `notifier/check.test.ts` | Override delivery test |
| `next/src/app/app/account/page.tsx` | "Alert delivery" block + blurb + pending banner |

---

### Task 1: Verification-email util

**Files:**
- Modify: `next/src/lib/cloudflare.ts` (CampWatchEnv interface, ~line 4-12)
- Create: `next/src/lib/verification-email.ts`
- Test: `next/src/lib/verification-email.test.ts`

- [ ] **Step 1: Add the env field**

In `next/src/lib/cloudflare.ts`, add to the `CampWatchEnv` interface (next to `API_SECRET?`):

```ts
RESEND_API_KEY?: string;
```

- [ ] **Step 2: Write the failing tests**

Create `next/src/lib/verification-email.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildVerificationToken, sendVerificationEmail } from "./verification-email";
import { verifySignedValue } from "./crypto-helpers";

const SECRET = "test-secret";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("buildVerificationToken", () => {
    it("round-trips account|address through signValue/verifySignedValue", async () => {
        const token = await buildVerificationToken("me@gmail.com", "me@icloud.com", SECRET);
        expect(await verifySignedValue(token, SECRET)).toBe("me@gmail.com|me@icloud.com");
    });

    it("a tampered token fails verification", async () => {
        const token = await buildVerificationToken("me@gmail.com", "me@icloud.com", SECRET);
        expect(await verifySignedValue(token + "0", SECRET)).toBeNull();
        expect(await verifySignedValue(token, "other-secret")).toBeNull();
    });
});

describe("sendVerificationEmail", () => {
    beforeEach(() => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    });

    it("POSTs to Resend addressed to the NEW address with a working verify link", async () => {
        await sendVerificationEmail({
            accountEmail: "me@gmail.com",
            newAddress: "me@icloud.com",
            origin: "https://campwatch.dev",
            resendApiKey: "re_test",
            apiSecret: SECRET,
        });

        const calls = vi.mocked(globalThis.fetch).mock.calls;
        expect(calls).toHaveLength(1);
        const [url, init] = calls[0]!;
        expect(String(url)).toBe("https://api.resend.com/emails");
        const body = JSON.parse(String(init?.body)) as { to: string; html: string; subject: string };
        expect(body.to).toBe("me@icloud.com");
        expect(body.subject.toLowerCase()).toContain("confirm");

        const m = body.html.match(/verify-notification-email\?token=([A-Za-z0-9_\-.%]+)/);
        expect(m).toBeTruthy();
        const token = decodeURIComponent(m![1]!);
        expect(await verifySignedValue(token, SECRET)).toBe("me@gmail.com|me@icloud.com");
    });

    it("throws when Resend responds non-2xx", async () => {
        vi.mocked(globalThis.fetch).mockResolvedValue(new Response("nope", { status: 500 }));
        await expect(
            sendVerificationEmail({
                accountEmail: "me@gmail.com",
                newAddress: "me@icloud.com",
                origin: "https://campwatch.dev",
                resendApiKey: "re_test",
                apiSecret: SECRET,
            }),
        ).rejects.toThrow();
    });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/lib/verification-email.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement**

Create `next/src/lib/verification-email.ts` (check the notifier's `notifier/lib/email.ts` `sendEmail` for the Resend payload shape — `from` should match the sender the notifier already uses; read that file and reuse its exact from-address):

```ts
import { signValue } from "./crypto-helpers";

/** Token payload is "accountEmail|newAddress" — emails cannot contain "|". */
export async function buildVerificationToken(
    accountEmail: string,
    newAddress: string,
    secret: string,
): Promise<string> {
    return signValue(`${accountEmail}|${newAddress}`, secret);
}

export interface SendVerificationOptions {
    accountEmail: string;
    newAddress: string;
    origin: string; // e.g. https://campwatch.dev — derived from the request URL
    resendApiKey: string;
    apiSecret: string;
}

/** Email the NEW address a confirmation link. Alerts only move after it's clicked. */
export async function sendVerificationEmail(opts: SendVerificationOptions): Promise<void> {
    const token = await buildVerificationToken(opts.accountEmail, opts.newAddress, opts.apiSecret);
    const verifyUrl = `${opts.origin}/api/me/verify-notification-email?token=${encodeURIComponent(token)}`;

    const html = `
<div style="font-family: Georgia, serif; max-width: 520px; margin: 0 auto; padding: 24px;">
    <h2 style="margin: 0 0 12px;">Confirm where CampWatch sends your alerts</h2>
    <p style="line-height: 1.5;">
        The CampWatch account <strong>${opts.accountEmail}</strong> asked to deliver its
        campsite alerts to this address. Click below to confirm — until then, alerts keep
        going to the login email.
    </p>
    <p style="margin: 24px 0;">
        <a href="${verifyUrl}"
           style="background:#1F3D2A;color:#F7F1E3;padding:12px 20px;text-decoration:none;border-radius:3px;font-weight:bold;">
            Send my alerts here
        </a>
    </p>
    <p style="font-size: 13px; color: #666; line-height: 1.5;">
        Didn't request this? Ignore the email and nothing changes.
    </p>
</div>`;

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${opts.resendApiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: "CampWatch <alerts@campwatch.dev>", // ← confirm against notifier/lib/email.ts and match it
            to: opts.newAddress,
            subject: "Confirm your CampWatch alert address",
            html,
        }),
    });
    if (!response.ok) {
        throw new Error(`Resend returned ${response.status}`);
    }
}
```

- [ ] **Step 5: Run to verify pass + typecheck**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/lib/verification-email.test.ts && npx tsc --noEmit`
Expected: 4 tests PASS, clean.

- [ ] **Step 6: Format + commit**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx prettier --write src/lib/verification-email.ts src/lib/verification-email.test.ts src/lib/cloudflare.ts && npm run format:check
cd /Users/mikeroberts/Code/campwatch
git add next/src/lib/verification-email.ts next/src/lib/verification-email.test.ts next/src/lib/cloudflare.ts
git commit -m "feat: verification email util for send-to address"
```

---

### Task 2: Profile fields + PATCH pending flow

**Files:**
- Modify: `next/src/types/user.ts` (UserProfile)
- Modify: `next/src/app/api/me/route.ts` (PatchBody, ALLOWED_PATCH_KEYS, isValidPatch, patchHandler)
- Test: `next/src/app/api/me/route.test.ts`

- [ ] **Step 1: Add the profile fields**

In `next/src/types/user.ts`, inside `UserProfile` after `defaultNotifyScope`:

```ts
/** Verified alert-delivery address. Absent = deliver to the login email. */
notificationEmail?: string;
/** Address awaiting confirmation; alerts keep going to the effective address until verified. */
pendingNotificationEmail?: string;
```

- [ ] **Step 2: Write the failing tests**

Read `next/src/app/api/me/route.test.ts` first and mirror its session/KV mocking + request helpers exactly. Add (adapting helper names to the file's):

```ts
// Inside the PATCH describe block. Assumes the file's existing helpers for
// signing in a session and seeding a profile in mock KV — reuse them.

it("stores a custom send-to address as pending and emails a verification link", async () => {
    // seed session + profile for user@example.com per the file's pattern
    const res = await doPatch({ notificationEmail: "Me@iCloud.com " });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
        pendingNotificationEmail?: string;
        notificationEmail?: string;
    };
    expect(body.pendingNotificationEmail).toBe("me@icloud.com"); // trimmed + lowercased
    expect(body.notificationEmail).toBeUndefined(); // NOT live yet

    const resendCalls = vi
        .mocked(globalThis.fetch)
        .mock.calls.filter((c) => String(c[0]).includes("api.resend.com"));
    expect(resendCalls).toHaveLength(1);
    const sent = JSON.parse(String(resendCalls[0]![1]?.body)) as { to: string };
    expect(sent.to).toBe("me@icloud.com");
});

it("clears both fields when the login email (or empty) is saved", async () => {
    // seed profile WITH notificationEmail + pendingNotificationEmail set
    const res = await doPatch({ notificationEmail: "user@example.com" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.notificationEmail).toBeUndefined();
    expect(body.pendingNotificationEmail).toBeUndefined();

    const res2 = await doPatch({ notificationEmail: "" });
    expect(res2.status).toBe(200);
});

it("rejects a malformed address", async () => {
    const res = await doPatch({ notificationEmail: "not-an-email" });
    expect(res.status).toBe(400);
});

it("returns 502 when the verification email fails to send", async () => {
    // make the resend fetch mock return 500 for api.resend.com
    const res = await doPatch({ notificationEmail: "me@icloud.com" });
    expect(res.status).toBe(502);
    // and pending must NOT have been persisted-as-live: re-GET profile, notificationEmail undefined
});
```

NOTE for the implementer: the test file's `globalThis.fetch` may not be mocked today (routes don't fetch). Mock it in these tests (or a local beforeEach) so `api.resend.com` calls are intercepted; the route needs `getEnv()` to return `RESEND_API_KEY` and `API_SECRET` — extend the file's `getEnv` mock accordingly.

- [ ] **Step 3: Run to verify the new tests fail**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/app/api/me/route.test.ts`
Expected: new tests FAIL (unknown patch key → 400 today). Pre-existing tests pass.

- [ ] **Step 4: Implement the PATCH flow**

In `next/src/app/api/me/route.ts`:

a) Imports:

```ts
import { sendVerificationEmail } from "@/lib/verification-email";
import { getEnv } from "@/lib/cloudflare";
```

b) Extend the patch surface:

```ts
interface PatchBody {
    name?: string;
    notifications?: { enabled: boolean; frequencyMinutes: 1 | 5 | 15 | 60 | 240 };
    defaultNotifyScope?: "favorites" | "worthwhile" | "all";
    notificationEmail?: string;
}

const ALLOWED_PATCH_KEYS = new Set(["name", "notifications", "defaultNotifyScope", "notificationEmail"]);

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
```

In `isValidPatch`, add:

```ts
if (obj.notificationEmail !== undefined) {
    if (typeof obj.notificationEmail !== "string") return false;
    const v = obj.notificationEmail.trim();
    if (v !== "" && (!EMAIL_SHAPE.test(v) || v.length > 254)) return false;
}
```

c) In `patchHandler`, replace the patch-assembly block with:

```ts
const patch: Partial<UserProfile> = {};
if (body.name !== undefined) patch.name = body.name;
if (body.notifications !== undefined) patch.notifications = body.notifications;
if (body.defaultNotifyScope !== undefined) patch.defaultNotifyScope = body.defaultNotifyScope;

if (body.notificationEmail !== undefined) {
    const addr = body.notificationEmail.trim().toLowerCase();
    if (addr === "" || addr === session.email.toLowerCase()) {
        // Back to default: deliver to the login email.
        patch.notificationEmail = undefined;
        patch.pendingNotificationEmail = undefined;
    } else {
        const env = getEnv();
        if (!env.RESEND_API_KEY || !env.API_SECRET) {
            return withCors(jsonResponse({ error: "Server misconfigured: email sending unavailable" }, 500));
        }
        try {
            await sendVerificationEmail({
                accountEmail: session.email,
                newAddress: addr,
                origin: new URL(request.url).origin,
                resendApiKey: env.RESEND_API_KEY,
                apiSecret: env.API_SECRET,
            });
        } catch (e) {
            console.error("[notification-email] verification send failed:", (e as Error).message);
            return withCors(jsonResponse({ error: "Couldn't send the verification email — try again" }, 502));
        }
        // Pending only — alerts keep going to the current effective address until verified.
        patch.pendingNotificationEmail = addr;
    }
}

const updated = await updateUserProfile(session.email, patch);
```

d) Verify clearing works end-to-end: `updateUserProfile` merges `{...profile, ...patch}` and KV-serializes via `JSON.stringify`, which drops `undefined`-valued keys — read `next/src/lib/users.ts:37-48` to confirm the merge shape; if it filters `undefined` out of the patch before merging, switch the clear path to explicitly write the merged object without those keys. The "clears both fields" test is the arbiter.

- [ ] **Step 5: Run to verify pass + full file**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/app/api/me/route.test.ts && npx tsc --noEmit`
Expected: ALL pass, clean.

- [ ] **Step 6: Format + commit**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx prettier --write src/types/user.ts src/app/api/me/route.ts src/app/api/me/route.test.ts && npm run format:check
cd /Users/mikeroberts/Code/campwatch
git add next/src/types/user.ts next/src/app/api/me/route.ts next/src/app/api/me/route.test.ts
git commit -m "feat: pending send-to address with verification email on /api/me"
```

---

### Task 3: Verify route

**Files:**
- Create: `next/src/app/api/me/verify-notification-email/route.ts`
- Test: `next/src/app/api/me/verify-notification-email/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create the test file (mirror the sibling route-test mock scaffolding for `@/lib/cloudflare`; sessions are NOT needed — the route is token-authorized):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));

import * as cloudflare from "@/lib/cloudflare";
import { signValue } from "@/lib/crypto-helpers";

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: "test-secret" } as never);
});

const PROFILE_KEY = "user:me@gmail.com:profile";

function seedProfile(extra: Record<string, unknown> = {}) {
    return createMockKv({
        [PROFILE_KEY]: JSON.stringify({
            email: "me@gmail.com",
            name: "Mike",
            roles: [],
            createdAt: "x",
            pendingNotificationEmail: "me@icloud.com",
            ...extra,
        }),
    });
}

async function doVerify(token: string | null): Promise<Response> {
    const { GET } = await import("./route");
    const qs = token === null ? "" : `?token=${encodeURIComponent(token)}`;
    return GET(new Request(`https://campwatch.dev/api/me/verify-notification-email${qs}`));
}

describe("GET /api/me/verify-notification-email", () => {
    it("promotes pending to verified and redirects to the account page", async () => {
        const kv = seedProfile();
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const token = await signValue("me@gmail.com|me@icloud.com", "test-secret");

        const res = await doVerify(token);
        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toBe("https://campwatch.dev/app/account?emailVerified=1");

        const stored = JSON.parse((await kv.get(PROFILE_KEY)) as string) as Record<string, unknown>;
        expect(stored.notificationEmail).toBe("me@icloud.com");
        expect(stored.pendingNotificationEmail).toBeUndefined();
    });

    it("rejects a tampered token", async () => {
        vi.mocked(cloudflare.getKv).mockReturnValue(seedProfile());
        const token = await signValue("me@gmail.com|me@icloud.com", "wrong-secret");
        const res = await doVerify(token);
        expect(res.status).toBe(400);
    });

    it("rejects a missing token", async () => {
        vi.mocked(cloudflare.getKv).mockReturnValue(seedProfile());
        const res = await doVerify(null);
        expect(res.status).toBe(400);
    });

    it("verifies an address that is no longer pending (self-contained consent)", async () => {
        const kv = seedProfile({ pendingNotificationEmail: "different@x.com" });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const token = await signValue("me@gmail.com|me@icloud.com", "test-secret");

        const res = await doVerify(token);
        expect(res.status).toBe(302);
        const stored = JSON.parse((await kv.get(PROFILE_KEY)) as string) as Record<string, unknown>;
        expect(stored.notificationEmail).toBe("me@icloud.com");
    });

    it("400s for an unknown account", async () => {
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const token = await signValue("ghost@gmail.com|me@icloud.com", "test-secret");
        const res = await doVerify(token);
        expect(res.status).toBe(400);
    });
});
```

(Confirm the profile KV key format by reading `next/src/lib/users.ts` `profileKey()` — adjust `PROFILE_KEY` if it differs from `user:{email}:profile`.)

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/app/api/me/verify-notification-email/route.test.ts`
Expected: FAIL — `./route` does not exist.

- [ ] **Step 3: Implement the route**

Create `next/src/app/api/me/verify-notification-email/route.ts`:

```ts
import { getEnv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { verifySignedValue } from "@/lib/crypto-helpers";
import { getUserProfile, updateUserProfile } from "@/lib/users";
import { withErrorLogging } from "@/lib/route-helpers";

// Unauthenticated by design: the recipient of the verification email may not be
// signed in. The signed token IS the authorization — it can only ever route one
// account's alerts to the one address its owner received this link at.
async function getHandler(request: Request): Promise<Response> {
    const env = getEnv();
    if (!env.API_SECRET) {
        return withCors(jsonResponse({ error: "Server misconfigured" }, 500));
    }

    const token = new URL(request.url).searchParams.get("token");
    if (!token) return withCors(jsonResponse({ error: "Missing token" }, 400));

    const payload = await verifySignedValue(token, env.API_SECRET);
    if (!payload) return withCors(jsonResponse({ error: "Invalid or expired link" }, 400));

    const sep = payload.indexOf("|");
    if (sep < 1) return withCors(jsonResponse({ error: "Invalid or expired link" }, 400));
    const accountEmail = payload.slice(0, sep);
    const address = payload.slice(sep + 1);

    const profile = await getUserProfile(accountEmail);
    if (!profile) return withCors(jsonResponse({ error: "Invalid or expired link" }, 400));

    await updateUserProfile(accountEmail, {
        notificationEmail: address,
        pendingNotificationEmail: undefined,
    });

    const origin = new URL(request.url).origin;
    return Response.redirect(`${origin}/app/account?emailVerified=1`, 302);
}
export const GET = withErrorLogging(getHandler, "GET /api/me/verify-notification-email");
```

(As in Task 2: if `updateUserProfile`'s merge doesn't drop `undefined` keys on serialize, clear `pendingNotificationEmail` explicitly. The test asserting `pendingNotificationEmail` is gone is the arbiter.)

- [ ] **Step 4: Run to verify pass**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/app/api/me/verify-notification-email/route.test.ts && npx tsc --noEmit`
Expected: 5 tests PASS, clean.

- [ ] **Step 5: Format + commit**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx prettier --write "src/app/api/me/verify-notification-email/" && npm run format:check
cd /Users/mikeroberts/Code/campwatch
git add next/src/app/api/me/verify-notification-email/
git commit -m "feat: verification route promotes pending send-to address"
```

---

### Task 4: Targets passthrough + notifier override

**Files:**
- Modify: `next/src/app/api/admin/notification-targets/route.ts` (target assembly, ~lines 51-63)
- Modify: `next/src/app/api/admin/notification-targets/route.test.ts`
- Modify: `notifier/check.ts` (`NotificationTarget` interface ~line 75, `sendEmailToUser` ~lines 506-528)
- Modify: `notifier/check.test.ts`

- [ ] **Step 1: Failing test — targets passthrough**

In `next/src/app/api/admin/notification-targets/route.test.ts` (read it first; mirror its auth + KV seeding), add a test: seed a profile with `notificationEmail: "me@icloud.com"` plus a campgrounds record, call the route with the bearer secret, and assert the returned target includes `notificationEmail: "me@icloud.com"`; a profile without the field yields a target without it.

```ts
it("passes notificationEmail through to the target", async () => {
    // seed profile per the file's pattern, adding notificationEmail: "me@icloud.com"
    // call doGet() with Authorization: Bearer <secret> per the file's pattern
    const body = (await res.json()) as { targets: Array<Record<string, unknown>> };
    expect(body.targets[0]?.notificationEmail).toBe("me@icloud.com");
});
```

- [ ] **Step 2: Failing test — notifier sends to the override**

In `notifier/check.test.ts`, add (module-level helpers `tierTarget`/`tierCampground`/`mockFetch`/`runAt` already exist; `runAt` runs dryRun — this test needs a REAL send, so call `run` directly):

```ts
describe("delivery address override", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("addresses the alert to notificationEmail but keeps unsubscribe on the account email", async () => {
        const target = {
            ...tierTarget([tierCampground("232358", "Outlet")]),
            notificationEmail: "boss@icloud.example",
            notifierState: { sites: {} }, // not first run → email branch reachable
        };
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(mockFetch([target]) as never);
        vi.spyOn(console, "log").mockImplementation(() => {});

        await run({
            subscriberApiUrl: "https://campwatch.dev",
            subscriberApiSecret: "secret",
            resendApiKey: "re_x",
            siteUrl: "https://campwatch.dev",
            forceEmail: false,
            dryRun: false, // real send path — Resend is mocked by mockFetch's fallback
            kvAdapter: stubKv(),
            now: new Date("2026-07-06T00:00:00Z"),
        });

        const resendCalls = fetchSpy.mock.calls.filter((c) =>
            String(c[0]).includes("api.resend.com"),
        );
        expect(resendCalls.length).toBeGreaterThan(0);
        const payload = JSON.parse(String(resendCalls[0]![1]?.body)) as {
            to: string;
            html: string;
        };
        expect(payload.to).toBe("boss@icloud.example");
        // Unsubscribe identity stays the ACCOUNT email.
        expect(payload.html).toContain(encodeURIComponent("boss@example.com"));
    });
});
```

Implementer notes: (1) the fixture's dates (2026-07-01..10) + `now` 2026-07-06 minute 0 + RECGOV_WITH_MATCH produce a match; `notifierState: { sites: {} }` (not null) avoids the first-run seed-and-skip; the match is new → email sent. (2) `mockFetch`'s final fallback returns `{}` 200 for any URL, which covers `api.resend.com` and the state-update PUTs. (3) If the lead-time filter blocks the send, the fixture's curator role bypasses it (tierTarget sets roles: ["curator"]). (4) If the email html doesn't contain the URL-encoded account email, inspect how the unsubscribe link embeds it (notifier/lib/email.ts:416) and assert on the exact form found there.

- [ ] **Step 3: Run both to verify failure**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/app/api/admin/notification-targets/route.test.ts
cd /Users/mikeroberts/Code/campwatch/notifier && npx vitest run check.test.ts
```
Expected: the new tests FAIL (field missing / mail addressed to account email).

- [ ] **Step 4: Implement**

a) `next/src/app/api/admin/notification-targets/route.ts` — in the local `NotificationTarget` interface add:

```ts
notificationEmail?: string;
```

and in the target assembly, next to the `defaultNotifyScope` passthrough:

```ts
if (profile.notificationEmail) target.notificationEmail = profile.notificationEmail;
```

b) `notifier/check.ts` — in the `NotificationTarget` interface (after `notifications?`):

```ts
/** Verified alert-delivery override. Absent = deliver to the account email. */
notificationEmail?: string;
```

and in `sendEmailToUser` (currently `await sendEmail(user.email, subject, html, resendApiKey, unsubscribeLink);` with the log line above it):

```ts
// Deliver to the verified override when set; unsubscribe identity stays the account email.
const deliverTo = user.notificationEmail ?? user.email;
console.log(`[Email] Sending to ${deliverTo} (account ${user.email}): "${subject}"`);
await sendEmail(deliverTo, subject, html, resendApiKey, unsubscribeLink);
```

(Replace the existing `console.log` line; the `email: user.email` passed into the unsubscribe options stays untouched.)

- [ ] **Step 5: Run to verify pass**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx vitest run src/app/api/admin/notification-targets/route.test.ts && npx tsc --noEmit
cd /Users/mikeroberts/Code/campwatch/notifier && npx vitest run && npx tsc --noEmit
```
Expected: ALL pass (notifier suite includes the 30 pre-existing tests), clean typechecks.

- [ ] **Step 6: Format + commit**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx prettier --write src/app/api/admin/notification-targets/route.ts src/app/api/admin/notification-targets/route.test.ts && npm run format:check
cd /Users/mikeroberts/Code/campwatch && npx prettier --write notifier/check.ts notifier/check.test.ts
git add next/src/app/api/admin/notification-targets/route.ts next/src/app/api/admin/notification-targets/route.test.ts notifier/check.ts notifier/check.test.ts
git commit -m "feat: notifier delivers alerts to the verified send-to address"
```

---

### Task 5: Account-page "Alert delivery" block

**Files:**
- Modify: `next/src/app/app/account/page.tsx` (new block after the existing notification-settings section; new state + handlers near `notifFrequency`)

No component-test pattern exists for this page — verification is the route tests (Tasks 2-3) plus manual. Keep the diff additive.

- [ ] **Step 1: Add state + handlers**

Near the existing notification state (`notifFrequency` etc.):

```ts
const [sendTo, setSendTo] = useState("");
const [savingSendTo, setSavingSendTo] = useState(false);

const loginEmail = auth.user?.email ?? "";
const effectiveSendTo = auth.user?.notificationEmail ?? loginEmail;
const pendingSendTo = auth.user?.pendingNotificationEmail;

useEffect(() => {
    setSendTo(effectiveSendTo);
}, [effectiveSendTo]);

async function saveSendTo(address: string) {
    setSavingSendTo(true);
    try {
        const response = await fetch("/api/me", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notificationEmail: address }),
            credentials: "include",
        });
        if (!response.ok) {
            const body = (await response.json().catch(() => ({}))) as { error?: string };
            toast.error(body.error ?? `Save failed (${response.status})`);
            return;
        }
        if (address.trim() !== "" && address.trim().toLowerCase() !== loginEmail.toLowerCase()) {
            toast.success(`Verification sent to ${address.trim().toLowerCase()}`);
        } else {
            toast.success("Alerts will go to your login email");
        }
        await auth.refresh();
    } finally {
        setSavingSendTo(false);
    }
}
```

And the verified-banner effect (with the page's existing toast import; `useSearchParams` from `next/navigation` — check whether the page is already a client component using it; it is `"use client"`):

```ts
const searchParams = useSearchParams();
useEffect(() => {
    if (searchParams.get("emailVerified") === "1") {
        toast.success("Alert address verified — future alerts go there");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

(If `useSearchParams` requires a Suspense boundary at build time, fall back to `window.location.search` inside the effect — same behavior, no boundary needed.)

- [ ] **Step 2: Add the block JSX**

Directly after the "Default scope select" section (find the closing `</div>` of the scope block inside the notifications card), insert:

```tsx
{/* Alert delivery address */}
<div className="space-y-2 mb-6">
    <Label
        htmlFor="notif-sendto"
        className="font-mono-field text-[12px] font-bold uppercase tracking-[0.16em] text-cw-clay"
    >
        Send alerts to
    </Label>
    <div className="flex gap-2 max-w-md">
        <Input
            id="notif-sendto"
            type="email"
            value={sendTo}
            onChange={(e) => setSendTo(e.target.value)}
            disabled={!notifEnabled || savingSendTo}
        />
        <Button
            size="sm"
            onClick={() => void saveSendTo(sendTo)}
            disabled={savingSendTo || sendTo.trim().toLowerCase() === effectiveSendTo.toLowerCase()}
        >
            {savingSendTo ? "Saving…" : "Save"}
        </Button>
    </div>
    {pendingSendTo && (
        <div className="font-mono-field text-[12px] text-cw-clay">
            Verification sent to {pendingSendTo} — alerts keep going to {effectiveSendTo} until you
            confirm.{" "}
            <button
                type="button"
                className="underline cursor-pointer"
                onClick={() => void saveSendTo(pendingSendTo)}
            >
                Resend link
            </button>
            {" · "}
            <button
                type="button"
                className="underline cursor-pointer"
                onClick={() => void saveSendTo("")}
            >
                Use login email
            </button>
        </div>
    )}
    <p className="font-italic-serif text-[14px] italic text-cw-ink-soft">
        Alerts go to your login email unless you point them somewhere faster. Tip: your phone gets
        instant push for iCloud addresses in Apple Mail, and for Gmail addresses in the Gmail app —
        pick whichever inbox buzzes.
    </p>
</div>
```

(`Input` is already imported on this page? Check the imports — the page uses `Select`/`Label`/`Switch`; add `import { Input } from "@/components/ui/input";` if absent, and `useEffect`/`useSearchParams` as needed.)

- [ ] **Step 3: Verify build-level correctness**

Run: `cd /Users/mikeroberts/Code/campwatch/next && npx tsc --noEmit && npx vitest run && npm run lint && npm run format:check`
Expected: all clean (`prettier --write` the page first if needed).

- [ ] **Step 4: Commit**

```bash
cd /Users/mikeroberts/Code/campwatch
git add "next/src/app/app/account/page.tsx"
git commit -m "feat: alert-delivery address field on the account page"
```

---

### Task 6: Full verification + gated rollout

- [ ] **Step 1: Full check**

```bash
cd /Users/mikeroberts/Code/campwatch/next && npx tsc --noEmit && npx vitest run && npm run lint && npm run format:check
cd /Users/mikeroberts/Code/campwatch/notifier && npx tsc --noEmit && npx vitest run
```

Expected: everything green.

- [ ] **Step 2: STOP — rollout needs Mike's OK and one manual secret**

Rollout steps (only after explicit approval):
1. Set the Resend key on the next worker (NOT echo — trailing newline breaks auth):
   `printf '%s' "<RESEND_API_KEY value>" | npx wrangler secret put RESEND_API_KEY` from `next/` with the personal-account env sourced (`set -a && source ../.campwatch-personal-cf.env && set +a`). The value is the same key the notifier uses.
2. `git push` (deploys next app).
3. `cd notifier && npx wrangler deploy` (personal account — verify `wrangler whoami` shows Mikeroberts421 first).
4. Mike: account page → "Send alerts to" → enter iCloud address → click the link in the verification email at iCloud → banner confirms.
5. Optional: watch one alert cycle with `wrangler tail` to see `[Email] Sending to <icloud> (account <gmail>)`.

---

## Self-review notes

- **Spec coverage:** fields+pending+verify-before-use (T2), stateless HMAC token via existing crypto-helpers + single-token deviation documented in header (T1/T3), reset semantics (T2), notifier override + unsubscribe-stays-account (T4), targets passthrough (T4), account UI + blurb + pending banner + verified banner (T5), Resend secret on next worker (T6), out-of-scope items absent.
- **Type consistency:** `notificationEmail`/`pendingNotificationEmail` names identical across user.ts, me route, verify route, targets route, notifier; `buildVerificationToken`/`sendVerificationEmail` defined T1, used T2.
- **Known judgment calls:** verify URL uses one self-contained token param (documented); 502 on send failure leaves pending unset (user retries); origin derived from request URL rather than a SITE_URL env.
