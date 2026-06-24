# PWA + Web Push (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CampWatch installable as a home-screen PWA and deliver push notifications (alongside the existing Resend email) so a watched site opening can buzz the user's phone.

**Architecture:** Purely additive. A web manifest + a push-only service worker make the app installable. A client toggle subscribes the browser (Web Push / VAPID) and POSTs the subscription to a new authed API route, which stores it in KV per user. The notifier already computes each user's new matches and emails them; we add a parallel Web Push send using `@pushforge/builder` (WebCrypto-based, runs on Workers — Node's `web-push` does not). Email remains the fallback channel; push is opt-in and never replaces it.

**Tech Stack:** Next.js 16 App Router on Cloudflare Workers (`@opennextjs/cloudflare`), Cloudflare KV, `@pushforge/builder` (zero-dependency Web Push), WebCrypto VAPID, Vitest. Notifier is the `campwatch-notifier` Cloudflare Worker (`notifier/`); the app is `next/`.

## Global Constraints

- **Additive only:** push never replaces email. A user with no push subscription must behave exactly as today.
- **Auth:** all user-facing push routes require a valid session (`getSession` / the existing session helper in `next/src/lib/sessions.ts`). Admin routes (notifier-facing) use the `Bearer ${API_SECRET}` pattern already used by `/api/admin/*`.
- **VAPID keys:** public key shipped to the client as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (base64url applicationServerKey); private key as `VAPID_PRIVATE_JWK` — a `wrangler secret` on **both** the `next` worker (not needed) and the **notifier** worker (needed). Only the notifier signs/sends, so only the notifier needs the private key. Subject: `mailto:hello@campwatch.dev`.
- **iOS reality:** web push works only on iOS 16.4+ **after** the user Adds the PWA to their home screen, then grants permission. The toggle UI must detect "not installed" and nudge install rather than silently failing.
- **TS strict** (both packages already at `strict` + `noUncheckedIndexedAccess`); lint `--max-warnings 0`; prettier-clean.
- **Deploy:** CampWatch deploys on push to `main` only; do all work on a branch and commit locally (no push until explicitly requested). Notifier checks run in CI (added 2026-06-24) and must be run for any `notifier/` change.
- **New dependency:** `@pushforge/builder` (notifier only; zero-dependency). No other new runtime deps.

---

## File Structure

**`next/` (app):**
- Create `next/public/manifest.webmanifest` — PWA manifest.
- Create `next/public/icon-192.png`, `next/public/icon-512.png`, `next/public/icon-maskable-512.png`, `next/public/apple-touch-icon.png` — generated from the existing `next/public/icon.svg`.
- Create `next/public/sw.js` — push-only service worker (`push` + `notificationclick`).
- Modify `next/src/app/layout.tsx` — link manifest, apple-touch-icon, theme-color.
- Create `next/src/lib/push/subscription.ts` — `PushSubscriptionRecord` type + KV read/upsert/remove helpers (key `push-subs:<email>`).
- Create `next/src/lib/push/subscription.test.ts`.
- Create `next/src/app/api/users/me/push/route.ts` — POST (upsert), DELETE (remove) the calling user's subscription.
- Create `next/src/app/api/users/me/push/route.test.ts`.
- Create `next/src/hooks/use-push-subscription.ts` — client: register SW, permission, subscribe/unsubscribe, sync to API; expose `isSupported`, `isInstalledPWA`, `status`, `subscribe()`, `unsubscribe()`.
- Create `next/src/components/account/push-toggle.tsx` — toggle + iOS install nudge.
- Modify `next/src/app/app/account/page.tsx` — render `<PushToggle />`.
- Modify `next/src/app/api/admin/notification-targets/route.ts` — include `pushSubscriptions` per target.
- Create `next/src/app/api/admin/push/prune/route.ts` — admin route the notifier calls to drop dead (410/404) subscriptions.

**`notifier/`:**
- Create `notifier/lib/push.ts` — `buildAndSend(subscription, payload, vapid)` wrapper over `@pushforge/builder`; returns `{ status }`.
- Create `notifier/lib/push.test.ts`.
- Modify `notifier/check.ts` — after the per-user email send, fan out Web Push to that user's `pushSubscriptions`; collect dead endpoints and prune them.
- Modify `notifier/worker.ts` / `RunConfig` — pass `VAPID_PRIVATE_JWK` + public key through config.

**Shared types:**
- Modify the `NotificationTarget` type (wherever it's defined for the notifier — `notifier/check.ts` declares it locally) to add `pushSubscriptions?: PushSubscriptionRecord[]`.

---

### Task 1: PWA manifest, icons, and install wiring

**Files:**
- Create: `next/public/manifest.webmanifest`
- Create: `next/public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`
- Modify: `next/src/app/layout.tsx` (the `<head>` block, ~line 96)

**Interfaces:**
- Produces: an installable PWA whose `start_url` is `/app`. No JS behavior; later tasks depend on the manifest existing and the icons being present.

- [ ] **Step 1: Generate the icons from the existing SVG**

Run (one-off, uses npx — not added as a project dep):
```bash
cd next/public
npx -y sharp-cli@latest -i icon.svg -o icon-192.png resize 192 192
npx -y sharp-cli@latest -i icon.svg -o icon-512.png resize 512 512
npx -y sharp-cli@latest -i icon.svg -o apple-touch-icon.png resize 180 180
# Maskable: same art with safe-zone padding is ideal; for Phase 1 reuse the 512.
cp icon-512.png icon-maskable-512.png
```
Expected: four PNG files written. Verify: `file icon-192.png` → "PNG image data, 192 x 192".

- [ ] **Step 2: Write the manifest**

Create `next/public/manifest.webmanifest`:
```json
{
  "name": "CampWatch",
  "short_name": "CampWatch",
  "description": "Get an email — and now a push — the moment a watched campsite opens.",
  "start_url": "/app",
  "scope": "/",
  "display": "standalone",
  "background_color": "#F4EAD8",
  "theme_color": "#1F3D2A",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 3: Link the manifest + apple bits in layout**

In `next/src/app/layout.tsx`, inside `<head>` (after the existing analytics block, ~line 122), add:
```tsx
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="CampWatch" />
<meta name="theme-color" content="#1F3D2A" />
```

- [ ] **Step 4: Build to confirm assets are bundled**

Run: `cd next && pnpm run cf:build`
Expected: build completes; `.open-next` includes the public assets.

- [ ] **Step 5: Manual install check (record result, don't block)**

In desktop Chrome against `pnpm dev`, open DevTools → Application → Manifest: no errors, icons resolve, "installable". (iOS confirmation happens post-deploy.)

- [ ] **Step 6: Commit**

```bash
git add next/public/manifest.webmanifest next/public/icon-192.png next/public/icon-512.png next/public/icon-maskable-512.png next/public/apple-touch-icon.png next/src/app/layout.tsx
git commit -m "feat(pwa): add manifest, icons, and install metadata"
```

---

### Task 2: Push subscription KV storage

**Files:**
- Create: `next/src/lib/push/subscription.ts`
- Test: `next/src/lib/push/subscription.test.ts`

**Interfaces:**
- Consumes: the existing KV accessor `getKv()` from `next/src/lib/cloudflare.ts`.
- Produces:
  - `interface PushSubscriptionRecord { endpoint: string; keys: { p256dh: string; auth: string }; createdAt: string }`
  - `function pushSubsKey(email: string): string`
  - `async function readPushSubs(email: string): Promise<PushSubscriptionRecord[]>`
  - `async function upsertPushSub(email: string, sub: PushSubscriptionRecord): Promise<void>` (dedupe by `endpoint`)
  - `async function removePushSub(email: string, endpoint: string): Promise<void>`
  - `function isValidSubscription(v: unknown): v is PushSubscriptionRecord`

- [ ] **Step 1: Write the failing test**

Create `next/src/lib/push/subscription.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, string>();
vi.mock("@/lib/cloudflare", () => ({
    getKv: () => ({
        get: async (k: string, t?: string) =>
            store.has(k) ? (t === "json" ? JSON.parse(store.get(k)!) : store.get(k)!) : null,
        put: async (k: string, v: string) => void store.set(k, v),
        delete: async (k: string) => void store.delete(k),
    }),
}));

import { readPushSubs, upsertPushSub, removePushSub, isValidSubscription } from "./subscription";

const sub = (endpoint: string) => ({
    endpoint,
    keys: { p256dh: "p", auth: "a" },
    createdAt: "2026-06-24T00:00:00.000Z",
});

beforeEach(() => store.clear());

describe("push subscription store", () => {
    it("upserts and reads back", async () => {
        await upsertPushSub("me@x.com", sub("https://push/1"));
        expect(await readPushSubs("me@x.com")).toHaveLength(1);
    });

    it("dedupes by endpoint", async () => {
        await upsertPushSub("me@x.com", sub("https://push/1"));
        await upsertPushSub("me@x.com", sub("https://push/1"));
        expect(await readPushSubs("me@x.com")).toHaveLength(1);
    });

    it("removes by endpoint", async () => {
        await upsertPushSub("me@x.com", sub("https://push/1"));
        await upsertPushSub("me@x.com", sub("https://push/2"));
        await removePushSub("me@x.com", "https://push/1");
        const subs = await readPushSubs("me@x.com");
        expect(subs.map((s) => s.endpoint)).toEqual(["https://push/2"]);
    });

    it("validates shape", () => {
        expect(isValidSubscription(sub("https://push/1"))).toBe(true);
        expect(isValidSubscription({ endpoint: "x" })).toBe(false);
        expect(isValidSubscription(null)).toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd next && pnpm exec vitest run src/lib/push/subscription.test.ts`
Expected: FAIL — cannot find module `./subscription`.

- [ ] **Step 3: Write the implementation**

Create `next/src/lib/push/subscription.ts`:
```ts
import { getKv } from "@/lib/cloudflare";

export interface PushSubscriptionRecord {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    createdAt: string;
}

export function pushSubsKey(email: string): string {
    return `push-subs:${email.toLowerCase()}`;
}

export function isValidSubscription(v: unknown): v is PushSubscriptionRecord {
    if (!v || typeof v !== "object") return false;
    const o = v as Record<string, unknown>;
    const keys = o.keys as Record<string, unknown> | undefined;
    return (
        typeof o.endpoint === "string" &&
        o.endpoint.length > 0 &&
        !!keys &&
        typeof keys.p256dh === "string" &&
        typeof keys.auth === "string"
    );
}

export async function readPushSubs(email: string): Promise<PushSubscriptionRecord[]> {
    const raw = (await getKv().get(pushSubsKey(email), "json")) as PushSubscriptionRecord[] | null;
    return Array.isArray(raw) ? raw.filter(isValidSubscription) : [];
}

export async function upsertPushSub(email: string, sub: PushSubscriptionRecord): Promise<void> {
    const existing = await readPushSubs(email);
    const next = [...existing.filter((s) => s.endpoint !== sub.endpoint), sub];
    await getKv().put(pushSubsKey(email), JSON.stringify(next));
}

export async function removePushSub(email: string, endpoint: string): Promise<void> {
    const existing = await readPushSubs(email);
    const next = existing.filter((s) => s.endpoint !== endpoint);
    if (next.length === existing.length) return;
    await getKv().put(pushSubsKey(email), JSON.stringify(next));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd next && pnpm exec vitest run src/lib/push/subscription.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add next/src/lib/push/subscription.ts next/src/lib/push/subscription.test.ts
git commit -m "feat(push): KV store for per-user push subscriptions"
```

---

### Task 3: Subscribe/unsubscribe API route

**Files:**
- Create: `next/src/app/api/users/me/push/route.ts`
- Test: `next/src/app/api/users/me/push/route.test.ts`

**Interfaces:**
- Consumes: `readPushSubs`/`upsertPushSub`/`removePushSub`/`isValidSubscription` (Task 2); the session helper from `next/src/lib/sessions.ts` (match its real export — inspect `getSessionEmail`/`getSession`); `withErrorLogging` from `next/src/lib/route-helpers.ts`.
- Produces: `POST /api/users/me/push` (body = a browser `PushSubscription` JSON) → 200 `{ ok: true }`; `DELETE /api/users/me/push` (body `{ endpoint }`) → 200 `{ ok: true }`. Both 401 when unauthenticated, 400 on invalid body.

- [ ] **Step 1: Write the failing test**

Create `next/src/app/api/users/me/push/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

let currentEmail: string | null = "me@x.com";
vi.mock("@/lib/sessions", () => ({
    getSessionEmail: async () => currentEmail,
}));
const calls: { upsert: unknown[]; remove: unknown[] } = { upsert: [], remove: [] };
vi.mock("@/lib/push/subscription", async (orig) => ({
    ...(await orig<typeof import("./../../../../lib/push/subscription")>()),
    upsertPushSub: async (...a: unknown[]) => void calls.upsert.push(a),
    removePushSub: async (...a: unknown[]) => void calls.remove.push(a),
}));

import { POST, DELETE } from "./route";

const sub = { endpoint: "https://push/1", keys: { p256dh: "p", auth: "a" } };
const req = (body: unknown) => new Request("https://x/api/users/me/push", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => { currentEmail = "me@x.com"; calls.upsert = []; calls.remove = []; });

describe("POST /api/users/me/push", () => {
    it("stores a valid subscription for the session user", async () => {
        const res = await POST(req(sub));
        expect(res.status).toBe(200);
        expect(calls.upsert).toHaveLength(1);
    });
    it("401s when unauthenticated", async () => {
        currentEmail = null;
        expect((await POST(req(sub))).status).toBe(401);
    });
    it("400s on a malformed body", async () => {
        expect((await POST(req({ endpoint: "x" }))).status).toBe(400);
    });
});

describe("DELETE /api/users/me/push", () => {
    it("removes by endpoint", async () => {
        const r = new Request("https://x", { method: "DELETE", body: JSON.stringify({ endpoint: "https://push/1" }) });
        expect((await DELETE(r)).status).toBe(200);
        expect(calls.remove).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd next && pnpm exec vitest run "src/app/api/users/me/push/route.test.ts"`
Expected: FAIL — cannot find `./route`.

> **Implementer note:** open `next/src/lib/sessions.ts` and `next/src/app/api/users/me/route.ts` first to copy the EXACT session-reading call and the `withErrorLogging` wrapper used by sibling routes. Replace `getSessionEmail` below if the real export differs, and update the mock in Step 1 to match.

- [ ] **Step 3: Write the implementation**

Create `next/src/app/api/users/me/push/route.ts`:
```ts
import { getSessionEmail } from "@/lib/sessions";
import { upsertPushSub, removePushSub, isValidSubscription } from "@/lib/push/subscription";
import { withErrorLogging } from "@/lib/route-helpers";

export const POST = withErrorLogging(async (req: Request): Promise<Response> => {
    const email = await getSessionEmail(req);
    if (!email) return Response.json({ error: "unauthorized" }, { status: 401 });
    const body = (await req.json().catch(() => null)) as unknown;
    if (!isValidSubscription(body)) return Response.json({ error: "invalid subscription" }, { status: 400 });
    await upsertPushSub(email, { ...body, createdAt: new Date().toISOString() });
    return Response.json({ ok: true });
});

export const DELETE = withErrorLogging(async (req: Request): Promise<Response> => {
    const email = await getSessionEmail(req);
    if (!email) return Response.json({ error: "unauthorized" }, { status: 401 });
    const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
    if (!body?.endpoint) return Response.json({ error: "missing endpoint" }, { status: 400 });
    await removePushSub(email, body.endpoint);
    return Response.json({ ok: true });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd next && pnpm exec vitest run "src/app/api/users/me/push/route.test.ts"`
Expected: PASS (4 tests). If `withErrorLogging` changes the call signature, align the handler with the sibling routes' pattern.

- [ ] **Step 5: Commit**

```bash
git add "next/src/app/api/users/me/push/"
git commit -m "feat(push): subscribe/unsubscribe API route"
```

---

### Task 4: Service worker + client subscription hook

**Files:**
- Create: `next/public/sw.js`
- Create: `next/src/hooks/use-push-subscription.ts`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (env); the API route from Task 3.
- Produces: hook `usePushSubscription()` returning `{ isSupported: boolean; isInstalledPWA: boolean; status: "idle" | "subscribing" | "subscribed" | "denied" | "error"; subscribe: () => Promise<void>; unsubscribe: () => Promise<void> }`.

- [ ] **Step 1: Write the service worker**

Create `next/public/sw.js`:
```js
// Push-only service worker. Intentionally no offline caching — the app is SSR
// on Cloudflare and we don't want a cache layer fighting it.
self.addEventListener("push", (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
    const title = data.title || "CampWatch";
    const options = {
        body: data.body || "A site you're watching just opened.",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: data.url || "/app" },
        tag: data.tag,
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || "/app";
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
            for (const c of clients) {
                if (c.url.includes(url) && "focus" in c) return c.focus();
            }
            return self.clients.openWindow(url);
        }),
    );
});
```

- [ ] **Step 2: Write the client hook**

Create `next/src/hooks/use-push-subscription.ts`:
```ts
"use client";

import { useCallback, useEffect, useState } from "react";

type Status = "idle" | "subscribing" | "subscribed" | "denied" | "error";

function urlBase64ToUint8Array(base64: string): Uint8Array {
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

export function usePushSubscription() {
    const [status, setStatus] = useState<Status>("idle");
    const [isInstalledPWA, setIsInstalledPWA] = useState(false);

    const isSupported =
        typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

    useEffect(() => {
        // iOS only allows push from an installed (standalone) PWA.
        const standalone =
            window.matchMedia?.("(display-mode: standalone)").matches ||
            // iOS Safari legacy flag
            (navigator as unknown as { standalone?: boolean }).standalone === true;
        setIsInstalledPWA(Boolean(standalone));
        if (!isSupported) return;
        void navigator.serviceWorker.ready.then(async (reg) => {
            const sub = await reg.pushManager.getSubscription();
            if (sub) setStatus("subscribed");
        });
    }, [isSupported]);

    const subscribe = useCallback(async () => {
        if (!isSupported) return;
        setStatus("subscribing");
        try {
            const reg = await navigator.serviceWorker.register("/sw.js");
            const permission = await Notification.requestPermission();
            if (permission !== "granted") { setStatus("denied"); return; }
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""),
            });
            const res = await fetch("/api/users/me/push", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(sub.toJSON()),
            });
            setStatus(res.ok ? "subscribed" : "error");
        } catch {
            setStatus("error");
        }
    }, [isSupported]);

    const unsubscribe = useCallback(async () => {
        if (!isSupported) return;
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
            await fetch("/api/users/me/push", {
                method: "DELETE",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ endpoint: sub.endpoint }),
            });
            await sub.unsubscribe();
        }
        setStatus("idle");
    }, [isSupported]);

    return { isSupported, isInstalledPWA, status, subscribe, unsubscribe };
}
```

- [ ] **Step 3: Type-check**

Run: `cd next && pnpm exec tsc --noEmit`
Expected: PASS. (No unit test — service-worker + PushManager behavior is validated manually in the browser; see Task 8.)

- [ ] **Step 4: Commit**

```bash
git add next/public/sw.js next/src/hooks/use-push-subscription.ts
git commit -m "feat(push): service worker and client subscription hook"
```

---

### Task 5: Account push toggle + iOS install nudge

**Files:**
- Create: `next/src/components/account/push-toggle.tsx`
- Modify: `next/src/app/app/account/page.tsx` (render the toggle in the notifications section)

**Interfaces:**
- Consumes: `usePushSubscription()` (Task 4).
- Produces: `<PushToggle />` — a self-contained card.

- [ ] **Step 1: Write the component**

Create `next/src/components/account/push-toggle.tsx`:
```tsx
"use client";

import { usePushSubscription } from "@/hooks/use-push-subscription";
import { Button } from "@/components/ui/button";

export function PushToggle() {
    const { isSupported, isInstalledPWA, status, subscribe, unsubscribe } = usePushSubscription();

    if (!isSupported) {
        return (
            <p className="text-sm text-muted-foreground">
                Push isn&apos;t supported in this browser. You&apos;ll still get email alerts.
            </p>
        );
    }

    // iOS: must install to home screen before push can be enabled.
    if (!isInstalledPWA && /iphone|ipad|ipod/i.test(navigator.userAgent)) {
        return (
            <p className="text-sm text-muted-foreground">
                To get push on iPhone: tap Share → <strong>Add to Home Screen</strong>, open CampWatch from
                the new icon, then come back here to turn on push.
            </p>
        );
    }

    return (
        <div className="flex items-center justify-between gap-4">
            <div className="text-sm">
                <div className="font-medium">Push notifications</div>
                <div className="text-muted-foreground">
                    {status === "subscribed"
                        ? "On for this device — we'll push the moment a site opens."
                        : status === "denied"
                          ? "Blocked in your browser settings. Re-enable notifications for campwatch.dev."
                          : "Get an instant push on this device (in addition to email)."}
                </div>
            </div>
            {status === "subscribed" ? (
                <Button variant="outline" onClick={() => void unsubscribe()}>
                    Turn off
                </Button>
            ) : (
                <Button onClick={() => void subscribe()} disabled={status === "subscribing"}>
                    {status === "subscribing" ? "Enabling…" : "Enable push"}
                </Button>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Render it in the account page**

In `next/src/app/app/account/page.tsx`, import `{ PushToggle }` and render `<PushToggle />` inside the existing notifications section (near the notification-email controls). Match the surrounding card/section markup.

- [ ] **Step 3: Type-check + lint**

Run: `cd next && pnpm exec tsc --noEmit && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add next/src/components/account/push-toggle.tsx next/src/app/app/account/page.tsx
git commit -m "feat(push): account toggle with iOS install nudge"
```

---

### Task 6: Notifier Web Push sender

**Files:**
- Create: `notifier/lib/push.ts`
- Test: `notifier/lib/push.test.ts`
- Modify: `notifier/package.json` (add `@pushforge/builder`)

**Interfaces:**
- Consumes: `@pushforge/builder`'s `buildPushHTTPRequest({ privateJWK, subscription, message })`.
- Produces:
  - `interface WebPushVapid { privateJWK: JsonWebKey; subject: string }`
  - `interface SendResult { endpoint: string; status: number; gone: boolean }`
  - `async function sendWebPush(subscription: PushSubscriptionRecord, payload: { title: string; body: string; url: string; tag?: string }, vapid: WebPushVapid, fetchImpl?: typeof fetch): Promise<SendResult>` — `gone` is true on 404/410 (caller prunes).

- [ ] **Step 1: Add the dependency**

Run: `cd notifier && npm install @pushforge/builder`
Expected: added to `dependencies`.

- [ ] **Step 2: Write the failing test**

Create `notifier/lib/push.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { sendWebPush } from "./push";

const sub = { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" }, createdAt: "x" };
const vapid = {
    subject: "mailto:hello@campwatch.dev",
    privateJWK: { kty: "EC", crv: "P-256", x: "x", y: "y", d: "d" } as JsonWebKey,
};

describe("sendWebPush", () => {
    it("POSTs to the subscription endpoint and reports status", async () => {
        const fetchImpl = vi.fn(async () => new Response(null, { status: 201 })) as unknown as typeof fetch;
        const r = await sendWebPush(sub, { title: "T", body: "B", url: "/app" }, vapid, fetchImpl);
        expect(r.status).toBe(201);
        expect(r.gone).toBe(false);
        expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(sub.endpoint);
    });

    it("flags gone on 410", async () => {
        const fetchImpl = vi.fn(async () => new Response(null, { status: 410 })) as unknown as typeof fetch;
        const r = await sendWebPush(sub, { title: "T", body: "B", url: "/app" }, vapid, fetchImpl);
        expect(r.gone).toBe(true);
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd notifier && npx vitest run lib/push.test.ts`
Expected: FAIL — cannot find `./push`.

> **Implementer note:** confirm `buildPushHTTPRequest`'s exact return shape against the installed version (`node_modules/@pushforge/builder`). The README shows `{ endpoint, headers, body }`. If a field name differs, adjust below.

- [ ] **Step 4: Write the implementation**

Create `notifier/lib/push.ts`:
```ts
import { buildPushHTTPRequest } from "@pushforge/builder";
import type { PushSubscriptionRecord } from "../../next/src/lib/push/subscription";

export interface WebPushVapid {
    privateJWK: JsonWebKey;
    subject: string;
}

export interface SendResult {
    endpoint: string;
    status: number;
    gone: boolean;
}

export async function sendWebPush(
    subscription: PushSubscriptionRecord,
    payload: { title: string; body: string; url: string; tag?: string },
    vapid: WebPushVapid,
    fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
    const { endpoint, headers, body } = await buildPushHTTPRequest({
        privateJWK: vapid.privateJWK,
        subscription,
        message: { payload, adminContact: vapid.subject },
    });
    const res = await fetchImpl(endpoint, { method: "POST", headers, body });
    return { endpoint: subscription.endpoint, status: res.status, gone: res.status === 404 || res.status === 410 };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd notifier && npx vitest run lib/push.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add notifier/lib/push.ts notifier/lib/push.test.ts notifier/package.json notifier/package-lock.json
git commit -m "feat(notifier): WebCrypto Web Push sender (pushforge)"
```

---

### Task 7: Wire push into the notifier send + carry subscriptions + prune

**Files:**
- Modify: `next/src/app/api/admin/notification-targets/route.ts` (include `pushSubscriptions`)
- Create: `next/src/app/api/admin/push/prune/route.ts` (admin prune by email+endpoint)
- Modify: `notifier/check.ts` (type `NotificationTarget`; send push in the per-user loop; collect + POST dead endpoints)
- Modify: `notifier/worker.ts` + `RunConfig` (thread `VAPID_PRIVATE_JWK`, subject)
- Test: extend `notifier/check.test.ts` with a push-send assertion

**Interfaces:**
- Consumes: `sendWebPush` (Task 6); `readPushSubs` (Task 2).
- Produces: `NotificationTarget.pushSubscriptions?: PushSubscriptionRecord[]`; `RunConfig.vapid?: { privateJWK: JsonWebKey; subject: string }`.

- [ ] **Step 1: Include subscriptions in the admin targets payload**

In `next/src/app/api/admin/notification-targets/route.ts`, for each target add `pushSubscriptions: await readPushSubs(target.email)` (import from `@/lib/push/subscription`). Keep the existing fields unchanged.

- [ ] **Step 2: Add the admin prune route**

Create `next/src/app/api/admin/push/prune/route.ts` (mirror the auth of sibling `/api/admin/*` routes — `Bearer ${API_SECRET}`):
```ts
import { removePushSub } from "@/lib/push/subscription";
import { withErrorLogging } from "@/lib/route-helpers";
import { getEnv } from "@/lib/cloudflare";

export const POST = withErrorLogging(async (req: Request): Promise<Response> => {
    const env = getEnv();
    const auth = req.headers.get("Authorization");
    if (auth !== `Bearer ${env.API_SECRET}`) return Response.json({ error: "unauthorized" }, { status: 401 });
    const body = (await req.json().catch(() => null)) as { email?: string; endpoints?: string[] } | null;
    if (!body?.email || !Array.isArray(body.endpoints)) return Response.json({ error: "bad request" }, { status: 400 });
    for (const ep of body.endpoints) await removePushSub(body.email, ep);
    return Response.json({ ok: true, pruned: body.endpoints.length });
});
```
> Confirm the admin-auth env var name against an existing `/api/admin/*` route (e.g. `notifier-state/route.ts`) and match it exactly.

- [ ] **Step 3: Type + thread VAPID through RunConfig**

In `notifier/check.ts`: add `pushSubscriptions?: PushSubscriptionRecord[]` to the local `NotificationTarget` interface (import the type from `../next/src/lib/push/subscription`), and add `vapid?: { privateJWK: JsonWebKey; subject: string }` to `RunConfig`. In `notifier/worker.ts`, read `env.VAPID_PRIVATE_JWK` (JSON.parse) + set subject `mailto:hello@campwatch.dev` into the config passed to `runTick`.

- [ ] **Step 4: Send push in the per-user loop**

In `notifier/check.ts` `run()`, in the branch that sends the email (after `sendEmailToUser` succeeds, in the non-dryRun path), add — guarded so a user with no subs or no VAPID config is a no-op:
```ts
if (config.vapid && (target.pushSubscriptions?.length ?? 0) > 0) {
    const dead: string[] = [];
    const title = newGroups.length > 0
        ? `Adjacent sites open at ${newMatches[0]?.campgroundName ?? "a campground"}`
        : `${newMatches.length} new opening${newMatches.length === 1 ? "" : "s"}`;
    const body = newMatches[0]
        ? `${newMatches[0].campgroundName} · Site ${newMatches[0].siteName}`
        : "Tap to see what opened.";
    for (const sub of target.pushSubscriptions ?? []) {
        try {
            const r = await sendWebPush(sub, { title, body, url: `${siteUrl}/app` }, config.vapid);
            if (r.gone) dead.push(sub.endpoint);
        } catch (err) {
            console.error(`[push] ${target.email}: ${(err as Error).message}`);
        }
    }
    if (dead.length > 0) {
        await fetch(`${subscriberApiUrl}/api/admin/push/prune`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${subscriberApiSecret}` },
            body: JSON.stringify({ email: target.email, endpoints: dead }),
        }).catch(() => {});
    }
}
```

- [ ] **Step 5: Extend the notifier test**

In `notifier/check.test.ts`, add a case: a target with one `pushSubscriptions` entry and `config.vapid` set, with a mocked global `fetch` that records the push POST. Assert the push endpoint was called once when the user has new matches. (Reuse the suite's existing `run()` harness and `as never` fixture style.)

- [ ] **Step 6: Run the notifier suite + type-check**

Run: `cd notifier && npx tsc --noEmit && npx vitest run`
Expected: PASS (existing 75 + new cases).

- [ ] **Step 7: Run the next suite + type-check**

Run: `cd next && pnpm exec tsc --noEmit && pnpm exec vitest run "src/app/api/admin"`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add next/src/app/api/admin/notification-targets/route.ts "next/src/app/api/admin/push/" notifier/check.ts notifier/check.test.ts notifier/worker.ts
git commit -m "feat(push): notifier sends Web Push alongside email and prunes dead subs"
```

---

### Task 8: VAPID config, full verification, and device validation

**Files:** none (configuration + verification)

- [ ] **Step 1: Set env + secrets**

- `next/.dev.vars` and `notifier/.dev.vars`: add `NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public key>` (next, public) and `VAPID_PRIVATE_JWK=<private JWK JSON>` (notifier).
- Production: `printf '%s' '<private JWK JSON>' | npx wrangler secret put VAPID_PRIVATE_JWK` in `notifier/` (no trailing newline — see `reference_wrangler_secret_no_newline`). Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` as a `next` worker var.
- **Regenerate the VAPID keypair** (the one from the spike was printed to a transcript); update both places.

- [ ] **Step 2: Full CI-equivalent**

Run: `cd next && pnpm lint && pnpm format:check && pnpm exec tsc --noEmit && pnpm test && pnpm run cf:build`
Then: `cd notifier && npx tsc --noEmit && npx prettier --check . && npx vitest run`
Expected: all green.

- [ ] **Step 3: Local desktop proof (optional but recommended)**

`cd next && pnpm dev`, sign in, open Account → Enable push (desktop Chrome, localhost is a secure context). Confirm a subscription row lands in KV. Trigger the notifier locally (`cd notifier && npx tsx cli.ts` with a forced match or `FORCE_EMAIL`) and confirm a desktop notification appears.

- [ ] **Step 4: Deploy + iOS validation (Mike)**

Merge to `main` (deploys). On an iPhone (16.4+): open campwatch.dev → Share → Add to Home Screen → open from the icon → Account → Enable push → grant permission. Confirm a real push arrives on the next opening (or a forced run).

---

## Self-Review Notes

- **Spec coverage:** manifest/install (T1), subscription storage (T2), subscribe/unsubscribe API (T3), SW + client (T4), account UX incl. iOS nudge (T5), Worker-side send (T6), notifier integration + prune + carry-through (T7), config + verification + device test (T8). All covered.
- **Open confirmations the implementer MUST do** (flagged inline, not placeholders): the exact session-read export in `sessions.ts`; the admin-auth env var name; `@pushforge/builder`'s return-field names. Each has a concrete "go look at file X" instruction.
- **Type consistency:** `PushSubscriptionRecord` defined in T2 is the single shape used by T3/T6/T7; `SendResult.gone` drives pruning in T7; `RunConfig.vapid` set in T7/worker matches `sendWebPush`'s `WebPushVapid`.
- **Not in scope (Phase 2):** App Store wrapper, APNs, Sign in with Apple, richer notification actions, per-campground push preferences, replacing email.
