# Phase 2: Per-User Campground Lists — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each signed-in user has their own private watchlist persisted server-side under `user:<email>:campgrounds`. The dashboard at `/app` becomes auth-gated; anonymous visitors get sent to the sign-in flow. First-time signed-in users see an onboarding modal: clone the curator's default list or start blank. Curators can additionally edit the canonical default list via the same dialog (admin mode). The notifier and the old shared `/api/config` endpoint stay live (they read the curated default), so notifications and existing integrations keep working.

**Non-goals for Phase 2:**
- `/app/admin` curator dashboard (UI for managing other users + roles). That's Phase 3.
- Public `/discover` page. Phase 3.
- Public landing page rebuild. Phase 3.
- Notifier rewire to per-user lists. Phase 5.

**Architecture:**

```
                     +-----------------------------------------+
                     |  Cloudflare Worker (campwatch)          |
                     |                                          |
   anonymous     ->  |  / (hero) — shows "Sign in" CTA          |
   visitor           |  /app — anonymous gets 302'd to          |
                     |        /auth/google/start?returnTo=/app  |
                     |                                          |
   signed-in user -> |  /app — reads /api/users/me/campgrounds  |
                     |  /app/account — profile (existing)       |
                     |  Configure Sites dialog → user's list    |
                     |    (or default list in curator mode)     |
                     +--------------------+---------------------+
                                          |
                                          ▼
                     +-----------------------------------------+
                     |  KV (SUBSCRIBERS namespace)             |
                     |                                          |
                     |  config:campgrounds   ← curated default  |
                     |                         (alias name only) |
                     |  user:<email>:profile                    |
                     |  user:<email>:campgrounds  ← NEW        |
                     |  session:<id>                            |
                     |  email:<addr>                            |
                     +-----------------------------------------+
```

**Storage and naming:** the spec calls the curator-owned list `config:default`. To keep the migration zero-effort and keep the notifier working unchanged, we leave the actual KV key as `config:campgrounds` (the existing data lives there). The new `/api/default` endpoint reads/writes this same key — it's a rename only at the API layer. The existing `/api/config` endpoint stays as an alias so the notifier keeps working until Phase 5 rewires it. No data migration.

**Tech Stack:** No new technology. Same Next.js + Cloudflare Worker + KV. New Route Handlers, new React hook.

**Critical pre-conditions:** Phase 1 is merged. `useAuth` is in place. `/api/me` works. The campwatch Worker has `GOOGLE_CLIENT_ID`, `SESSION_SECRET`, etc.

---

## Pre-flight

### Task 0: Branch + state check

- [ ] **Step 1: Branch from main**

```bash
cd "/Users/mikeroberts/Library/Mobile Documents/com~apple~CloudDocs/Desktop/Websites/campsites-react"
git checkout main && git pull --ff-only
git checkout -b feature/phase-2-per-user-lists
git status -s
```

- [ ] **Step 2: Confirm next/ is green**

```bash
cd next && pnpm install --frozen-lockfile && pnpm test 2>&1 | tail -3 && pnpm exec tsc --noEmit && pnpm run cf:build 2>&1 | tail -3
```

Expected: 136 tests pass, tsc clean, cf:build complete.

---

## Section A: Per-user campgrounds storage

### Task A1: Storage helper module

**Files:**
- Create: `next/src/lib/user-campgrounds.ts`
- Test: `next/src/lib/user-campgrounds.test.ts`

**Exports:**

```ts
import type { SiteConfig, GlobalSettings } from "@/types/campground";

export interface UserCampgroundsRecord {
    campgrounds: SiteConfig;
    globalSettings: GlobalSettings;
    updatedAt: string;
}

export async function getUserCampgrounds(email: string): Promise<UserCampgroundsRecord | null>;
export async function putUserCampgrounds(email: string, record: Omit<UserCampgroundsRecord, "updatedAt">): Promise<UserCampgroundsRecord>;
export async function deleteUserCampgrounds(email: string): Promise<void>;
```

Implementation reads/writes `user:<email>:campgrounds` JSON in KV. `putUserCampgrounds` always stamps `updatedAt = new Date().toISOString()`. `deleteUserCampgrounds` is for the account-delete path (Phase 1's `deleteUser` already removes this key — verify it does and re-export `deleteUserCampgrounds` so callers don't have to duplicate the key construction).

**Tests** (with mock KV):
- `getUserCampgrounds` returns null when nothing is stored.
- `putUserCampgrounds` stores under `user:<email>:campgrounds`, then `getUserCampgrounds` returns the stored record with a populated `updatedAt`.
- Round-trip preserves campgrounds shape and globalSettings.
- `deleteUserCampgrounds` removes the entry.

Commit:
```
git add next/src/lib/user-campgrounds.ts next/src/lib/user-campgrounds.test.ts
git commit -m "Add user campground list storage helpers"
```

### Task A2: GET /api/users/me/campgrounds

**Files:**
- Create: `next/src/app/api/users/me/campgrounds/route.ts`
- Test: `next/src/app/api/users/me/campgrounds/route.test.ts`

Behavior:
- Read session via `readSession(request)`. 401 if no session.
- Return the user's record from `getUserCampgrounds(session.email)`. If null, return 200 with `{ campgrounds: { "recreation.gov": [] }, globalSettings: <defaults>, updatedAt: null }`. (Returning 200 with an empty-shape record lets the client treat a fresh user the same as an existing-but-empty one.)

For the defaults source on the empty case: import `getSitewideDefaultSettings` from `@/lib/settings` and use its `dates.stayLengths` and `dates.validStartDays`.

Tests cover: 401 unauth; 200 with empty record for fresh user; 200 with stored record for returning user.

Commit:
```
git add next/src/app/api/users/me/campgrounds/route.ts next/src/app/api/users/me/campgrounds/route.test.ts
git commit -m "Add GET /api/users/me/campgrounds"
```

### Task A3: PUT /api/users/me/campgrounds

**Files:**
- Modify: `next/src/app/api/users/me/campgrounds/route.ts` (add `PUT`)
- Extend: `next/src/app/api/users/me/campgrounds/route.test.ts`

Behavior:
- 401 if no session.
- Parse JSON body. Validate it has `campgrounds: { "recreation.gov": Campground[] }` and `globalSettings: { stayLengths: number[], validStartDays: string[] }`. Reject malformed bodies with 400 and a specific error message.
- Call `putUserCampgrounds(session.email, body)`. Return 200 with the stored record (including `updatedAt`).

Validation is shallow — just check shape, not every field. Trust the client to send the shape that came from the dialog's `sanitizeCampground`.

Tests cover: 401 unauth; 400 on invalid body (missing `campgrounds`, missing `globalSettings`); 200 on success + KV state matches the request body.

Commit:
```
git add next/src/app/api/users/me/campgrounds/route.ts next/src/app/api/users/me/campgrounds/route.test.ts
git commit -m "Add PUT /api/users/me/campgrounds"
```

### Task A4: POST /api/users/me/campgrounds/clone-default

**Files:**
- Create: `next/src/app/api/users/me/campgrounds/clone-default/route.ts`
- Test: `next/src/app/api/users/me/campgrounds/clone-default/route.test.ts`

Behavior:
- 401 if no session.
- Read the curated default config from KV (`config:campgrounds` key, same as `/api/config` GET returns). If KV is empty, fall back to the static defaults from `@/data/sites` and `@/lib/settings`.
- Write that data as the user's record via `putUserCampgrounds`. Return the stored record.

This is idempotent. Calling it overwrites whatever the user previously had with the latest default.

Tests cover: 401; 200 with stored copy of the default when KV has one; 200 with seeded defaults when KV is empty.

Commit:
```
git add next/src/app/api/users/me/campgrounds/clone-default/
git commit -m "Add POST /api/users/me/campgrounds/clone-default"
```

---

## Section B: `/api/default` endpoint

This is the canonical name for the curator-owned list. Same KV key as today's `/api/config`. The old `/api/config` stays as an alias so the notifier keeps working unchanged.

### Task B1: GET /api/default (public read)

**Files:**
- Create: `next/src/app/api/default/route.ts`
- Test: `next/src/app/api/default/route.test.ts`

Behavior:
- GET reads `config:campgrounds` from KV. Returns the JSON (200) or 404 with `{ error: "No default config found" }` if KV is empty.
- Public read. No auth check.

Tests cover: empty KV → 404; populated KV → 200 with the same JSON.

Note: this is intentionally different from `/api/config` GET in Phase 0b which had the `if (env.CONFIG_KEY) require auth` gate. `/api/default` is unconditionally public. The notifier-grade `/api/config` keeps its (lenient) gate as-is.

Commit:
```
git add next/src/app/api/default/route.ts next/src/app/api/default/route.test.ts
git commit -m "Add public GET /api/default returning the curated default config"
```

### Task B2: PUT /api/default (curator-only)

**Files:**
- Modify: `next/src/app/api/default/route.ts` (add PUT)
- Extend: `next/src/app/api/default/route.test.ts`

Behavior:
- 401 if no session.
- Read user profile; reject (403) if `roles` doesn't include `"curator"`.
- Validate body shape (`campgrounds`, `globalSettings`).
- Write to `config:campgrounds` KV.
- Return 200 with `{ message: "Default config saved" }`.

This replaces the old Bearer-token-gated PUT `/api/config`. The old endpoint stays around (still token-gated) so the React app's current code doesn't break during the transition.

Tests cover: 401 unauth; 403 non-curator; 200 curator; KV state after success.

Commit:
```
git add next/src/app/api/default/route.ts next/src/app/api/default/route.test.ts
git commit -m "Add curator-only PUT /api/default"
```

---

## Section C: Auth-gate `/app`

### Task C1: Middleware that gates protected paths

**Files:**
- Create: `next/src/middleware.ts`

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/sessions";

// Paths that require a signed-in user. Anonymous visitors get redirected to
// /auth/google/start with returnTo set to the original path.
const PROTECTED_PREFIXES = ["/app"];

export function middleware(request: NextRequest) {
    const { pathname, search } = request.nextUrl;
    if (!PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
        return NextResponse.next();
    }

    const session = request.cookies.get(SESSION_COOKIE);
    if (session?.value) {
        return NextResponse.next();
    }

    const returnTo = pathname + search;
    const url = request.nextUrl.clone();
    url.pathname = "/auth/google/start";
    url.search = `?returnTo=${encodeURIComponent(returnTo)}`;
    return NextResponse.redirect(url);
}

export const config = {
    // Apply to all /app/* paths. The internals of the gate above narrow it
    // further, but matchers are cheaper than runtime checks.
    matcher: ["/app/:path*"],
};
```

**Important:** this gates `/app` based on cookie presence only — it does NOT verify the session is still valid (that requires a KV lookup, which middleware shouldn't do every request). A valid-looking cookie with a stale session ID will let middleware through; the server-side `readSession` in route handlers + the `useAuth` hook in the client will catch and recover (401 from `/api/me` → `useAuth` shows the sign-in button → the visitor signs in fresh).

This is the standard pattern for cookie-checked middleware in Next.js. KV-backed validation happens at request handlers.

Commit:
```
git add next/src/middleware.ts
git commit -m "Add middleware that gates /app behind a session cookie"
```

### Task C2: Live verification of the gate

After the middleware lands, verify locally:

```bash
cd next && pnpm dev &
DEV_PID=$!
sleep 5

echo "=== /app anonymous → 307 to /auth/google/start ==="
curl -sI http://localhost:3000/app | grep -iE "^HTTP|^location" | head -2

echo "=== /app/account anonymous → 307 ==="
curl -sI http://localhost:3000/app/account | grep -iE "^HTTP|^location" | head -2

echo "=== / still public ==="
curl -sI http://localhost:3000/ | head -1

kill $DEV_PID 2>/dev/null
wait 2>/dev/null
```

Expected: `/app` and `/app/account` return 307 with `Location: /auth/google/start?returnTo=%2Fapp...`. `/` stays public.

No commit (verification only).

---

## Section D: Per-user data wiring in the React app

### Task D1: Replace `useConfig` with `useUserCampgrounds`

The current `useConfig` hook (Phase 0c) hydrates from `/api/config` and writes there on save. Phase 2 changes both ends — the dashboard reads from `/api/users/me/campgrounds` and writes to the same.

**Files:**
- Create: `next/src/hooks/use-user-campgrounds.ts`
- Modify: `next/src/app/app/page.tsx` (swap `useConfig` for `useUserCampgrounds`)
- Delete: `next/src/hooks/use-config.ts` (no longer used)

New hook signature:

```ts
import type { SiteConfig, GlobalSettings } from "@/types/campground";

export interface UseUserCampgroundsState {
    siteConfig: SiteConfig;
    globalSettings: GlobalSettings;
    updatedAt: string | null;
    isHydrating: boolean;
    syncStatus: "success" | "error" | null;
    isEmpty: boolean; // true when updatedAt is null AND the user has never saved
    clearSyncStatus: () => void;
    save: (config: SiteConfig, globalSettings: GlobalSettings) => Promise<void>;
    cloneDefault: () => Promise<void>;
    startBlank: () => Promise<void>;
}

export function useUserCampgrounds(): UseUserCampgroundsState;
```

Behavior:
- On mount: GET `/api/users/me/campgrounds`. Store the response (or 401 → render empty state since the middleware should've prevented anonymous access; if 401 still happens it means the session is stale — surface in console and redirect to sign-in).
- `save(config, settings)`: PUT to `/api/users/me/campgrounds` with the new body. On success, update local state + set syncStatus="success". On error, syncStatus="error".
- `cloneDefault()`: POST `/api/users/me/campgrounds/clone-default`. On success, re-fetch.
- `startBlank()`: PUT empty `{ campgrounds: { "recreation.gov": [] }, globalSettings: <defaults> }`. On success, re-fetch.
- `isEmpty`: true when `updatedAt === null` (server returned the empty shape because nothing was stored).

Local-only-config and the `useMockData` toggle from earlier phases: the local-only toggle no longer makes sense (every signed-in user has server-side storage). Remove its wiring from the dialog. `useMockData` can stay — it's a dev-only thing that doesn't affect storage.

Test: this hook does fetch I/O, so unit tests are limited. Sketch a happy-path test that mocks `fetch` and asserts the URL/method for each operation.

Commit:
```
git add next/src/hooks/use-user-campgrounds.ts next/src/hooks/use-user-campgrounds.test.ts
git rm next/src/hooks/use-config.ts
git commit -m "Add useUserCampgrounds hook backed by /api/users/me/campgrounds"
```

### Task D2: Wire `useUserCampgrounds` into `/app/page.tsx`

**Files:**
- Modify: `next/src/app/app/page.tsx`

- Replace `const config = useConfig(globalSettings)` with `const userCampgrounds = useUserCampgrounds()`.
- `siteConfig` and `globalSettings` come from the new hook now. `useGlobalSettings` (localStorage-backed) becomes vestigial — remove it.
- Pass `userCampgrounds.save` as the dialog's `onSave` (signature already matches `(SiteConfig, GlobalSettings) => void`).
- For "Reset to defaults" in the dialog → wire to `userCampgrounds.cloneDefault()` (the closest equivalent — restore to the curator's current curated list).
- Remove the `useLocalConfig` toggle wiring (delete the prop or pass `useLocalConfig={false} onToggleUseLocalConfig={() => {}}` to keep the dialog API unchanged).

Empty-state handling lives in the next task (D3).

Commit:
```
git add next/src/app/app/page.tsx
git commit -m "Wire useUserCampgrounds into /app dashboard"
```

### Task D3: Onboarding modal

**Files:**
- Create: `next/src/components/onboarding-modal.tsx`
- Modify: `next/src/app/app/page.tsx`

Component renders a shadcn `Dialog` (or `AlertDialog`) that opens when the user has an empty record. Title: "Welcome to CampWatch". Body: short pitch + two buttons:

- **Clone Mike's list** — calls `userCampgrounds.cloneDefault()` then closes.
- **Start blank** — calls `userCampgrounds.startBlank()` then closes.

The dialog is non-dismissible (no X, clicking outside doesn't close) so the user has to make a choice. After either action, the dashboard renders with whatever they picked.

The "Mike's" copy reads the curator's name from `/api/default` (fetch metadata on open). If the default config is empty, hide the Clone button and just offer Start blank.

Wire in `/app/page.tsx`:

```tsx
const userCampgrounds = useUserCampgrounds();

const showOnboarding = !userCampgrounds.isHydrating && userCampgrounds.isEmpty;

return (
    <>
        {/* existing layout */}
        <OnboardingModal
            open={showOnboarding}
            onClone={userCampgrounds.cloneDefault}
            onStartBlank={userCampgrounds.startBlank}
        />
    </>
);
```

Commit:
```
git add next/src/components/onboarding-modal.tsx next/src/app/app/page.tsx
git commit -m "Add onboarding modal: clone curated default or start blank"
```

### Task D4: Remove the "Use my own settings" toggle from the dialog

**Files:**
- Modify: `next/src/components/site-config-dialog/general-settings.tsx`
- Modify: `next/src/components/site-config-dialog/types.ts`
- Modify: `next/src/components/site-config-dialog/index.tsx`

Drop the `useLocalConfig` switch from General Settings. Update `SiteConfigDialogProps` to remove `useLocalConfig` and `onToggleUseLocalConfig`. Update the dialog's caller in `/app/page.tsx`.

Keep the `useMockData` toggle — it's still useful for dev.

Commit:
```
git add next/src/components/site-config-dialog/ next/src/app/app/page.tsx
git commit -m "Remove 'Use my own settings' toggle (now implicit via per-user storage)"
```

---

## Section E: Deploy + verification

### Task E1: Push and watch CI

```bash
git push -u origin feature/phase-2-per-user-lists
gh run watch --exit-status
```

### Task E2: Live smoke tests

```bash
NEW="https://campwatch.mikeroberts421.workers.dev"

echo "=== /api/default GET (public) ==="
curl -s -o /dev/null -w "%{http_code}\n" $NEW/api/default

echo "=== /api/default GET returns same data as /api/config ==="
diff <(curl -s $NEW/api/default | python3 -m json.tool) \
     <(curl -s -H "Authorization: Bearer $CONFIG_KEY" $NEW/api/config | python3 -m json.tool 2>/dev/null) && echo "EQUIVALENT" || echo "DIFFERENT"

echo "=== /api/users/me/campgrounds unauth → 401 ==="
curl -s -o /dev/null -w "%{http_code}\n" $NEW/api/users/me/campgrounds

echo "=== /api/users/me/campgrounds/clone-default unauth → 401 ==="
curl -s -o /dev/null -w "%{http_code}" -X POST $NEW/api/users/me/campgrounds/clone-default
echo ""

echo "=== /app anonymous → 307 → /auth/google/start ==="
curl -sI $NEW/app | grep -iE "^HTTP|^location" | head -2
```

Expected:
- `/api/default` GET → 200.
- `/api/users/me/campgrounds` GET no auth → 401.
- `/api/users/me/campgrounds/clone-default` POST no auth → 401.
- `/app` no auth → 307 → `/auth/google/start?returnTo=%2Fapp`.

### Task E3: Browser walk-through (manual)

1. Sign out (clear cookies for `campwatch.mikeroberts421.workers.dev` if needed).
2. Visit https://campwatch.mikeroberts421.workers.dev/app — should be redirected to Google OAuth start (via middleware) → land back at /app after auth.
3. Onboarding modal appears: "Welcome to CampWatch."
4. Click **Clone Mike's list** — modal closes, dashboard now shows the same 12 campgrounds you see today.
5. Open Configure Sites → make a change → Save. Reload. The change persists for THIS user.
6. In a different browser (or incognito), sign in as a different test user. The onboarding modal should appear again. Pick **Start blank** — dashboard renders with no campgrounds. The first user's changes are NOT visible here.
7. Sign in again as curator → open dev tools → run `await fetch("/api/default").then(r => r.json()).then(d => d.campgrounds["recreation.gov"].length)` in the console — should return 12 (the curated default is unchanged).

### Task E4: Open PR

```bash
gh pr create --base main --head feature/phase-2-per-user-lists \
    --title "Phase 2: Per-user campground lists + auth-gated dashboard" \
    --body "..."
```

PR body covers:
- Per-user storage at `user:<email>:campgrounds`
- `/api/users/me/campgrounds` GET/PUT and `/clone-default` POST
- `/api/default` (public GET, curator-only PUT) — coexists with the legacy `/api/config` (unchanged for notifier compatibility)
- Middleware-gated `/app`
- Onboarding modal
- Removal of the "Use my own settings" device-local toggle (made obsolete by per-user storage)
- Live smoke results

---

## Self-review checklist

- [ ] All four new endpoints have a task (`/api/users/me/campgrounds` GET + PUT, `/clone-default` POST, `/api/default` GET + PUT).
- [ ] `/api/config` and the notifier are explicitly left alone (Section B header notes the rationale).
- [ ] Middleware doesn't try to validate sessions against KV — cookie-presence only. KV validation lives in route handlers.
- [ ] Onboarding modal is non-dismissible until the user picks one option.
- [ ] The local-only toggle is removed; its localStorage key isn't migrated (every signed-in user's source of truth is the server now).
- [ ] `useGlobalSettings` (Phase 0c's localStorage-backed hook for stayLengths/validStartDays) is now dead code since global settings live inside the user's campgrounds record. Remove it as part of D2.
- [ ] No public route handlers got token-gated; no auth-gated routes got dropped.
- [ ] The notifier (`notifier/check.mjs`) is unchanged in this phase; it still hits `/api/config` with API_SECRET. Phase 5 will rewire it.

## Future phases reminder

- **Phase 3**: public landing page at `/`, `/discover` page (public read-only view of `/api/default`), `/app/admin` curator dashboard for managing user roles + editing the default list.
- **Phase 4**: UI-driven catalog rework (rec.gov ID paste flow). Retires `campgroundCatalog.js` as a runtime source.
- **Phase 5**: Notifier rewire — reads per-user lists, deduplicates campground fetches across users.
