# Phase 5: Notifier Rewire with Per-User Lists + Dedup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The notifier stops reading the anonymous email subscriber list and the shared config. Instead, it pulls every signed-in user's per-user watchlist and notification preferences from a new admin endpoint, dedupes recreation.gov fetches across users (one fetch per `(campgroundId, month)` even if N users watch the same campground), and emails each user about their own matches. After this lands, the multi-user rebuild is structurally complete and scales to many users without proportional rec.gov traffic.

**Non-goals:**
- Deleting old anonymous `email:*` KV records (orphan data is harmless; explicit cleanup deferred).
- New SMS / push channel.
- Onboarding emails or marketing.
- Re-emailing users about availability they were previously alerted on under the old shared model.

**Architecture:**

```
+----------------------+         +----------------------------+
| GitHub Actions cron  | every   | campwatch Worker (Next.js) |
| every 15 min         |  15m    |                            |
| Node 22              +────────►| GET /api/admin/             |
|                                 |     notification-targets   |
|                                 |  (returns users + lists +  |
|                                 |   prefs + lastNotifiedAt)  |
+-----------+----------+         +----------------------------+
            |
            | per user: build campgrounds-to-fetch map
            ▼
+----------------------+                          
| recreation.gov API   | Dedup'd: each unique (campgroundId, month)
| (direct fetch from   | fetched once, regardless of how many users
| Node)                | watch it.
+-----------+----------+
            |
            | per user: apply that user's filters,
            | diff against their notifier state,
            | accumulate "new matches"
            ▼
+----------------------+         +----------------------------+
| Resend API           |         | campwatch Worker            |
| (one email per user  |         | PUT /api/admin/             |
| with new matches)    |         |     notifier-state          |
+-----------+----------+         | (bulk update per-user       |
            ▼                    |  state + lastNotifiedAt)    |
         emails                  +----------------------------+
```

**Tech Stack:** No new infrastructure. Same Node notifier in `notifier/`, same Resend, same GitHub Actions cron. New endpoints on the existing campwatch Worker.

**Pre-conditions:** Phase 4 merged. `user:<email>:profile` and `user:<email>:campgrounds` records populated for any active user. The campwatch Worker has `API_SECRET` mirrored from GitHub Secret `SUBSCRIBER_API_SECRET`.

---

## Pre-flight

### Task 0: Branch + state check

- [ ] **Step 1: Branch from main**

```bash
cd "/Users/mikeroberts/Library/Mobile Documents/com~apple~CloudDocs/Desktop/Websites/campsites-react"
git checkout main && git pull --ff-only
git checkout -b feature/phase-5-notifier-rewire
git status -s
```

- [ ] **Step 2: Confirm `next/` and `notifier/` are green**

```bash
cd next && pnpm install --frozen-lockfile && pnpm test 2>&1 | tail -3 && pnpm exec tsc --noEmit && pnpm run cf:build 2>&1 | tail -3
cd ../notifier && node --check check.mjs && node --check lib/diff.mjs && node --check lib/email.mjs && node --check lib/fetch-availability.mjs
```

Expected: 210 tests pass, tsc clean, cf:build complete, all notifier files parse.

---

## Section A: New API endpoints for the notifier

### Task A1: Extend the UserProfile type with `lastNotifiedAt`

**Files:**
- Modify: `next/src/types/user.ts`
- Modify: `next/src/app/api/me/route.ts` (no behavior change, but the new optional field must be allowed through PATCH if we ever wire it up — for now leave PATCH validation alone; the notifier writes via the new bulk endpoint)

Add `lastNotifiedAt?: string` (ISO timestamp) to `UserProfile`:

```ts
export interface UserProfile {
    email: string;
    name: string;
    picture?: string;
    roles: UserRole[];
    createdAt: string;
    notifications?: {
        enabled: boolean;
        frequencyMinutes: 15 | 60 | 240;
    };
    lastNotifiedAt?: string;
}
```

No code change to consumers needed (TypeScript treats new optional fields as always-undefined for existing readers).

Commit:
```
git add next/src/types/user.ts
git commit -m "Add lastNotifiedAt to UserProfile"
```

### Task A2: `GET /api/admin/notification-targets`

**Files:**
- Create: `next/src/app/api/admin/notification-targets/route.ts`
- Test: `next/src/app/api/admin/notification-targets/route.test.ts`

Auth: this endpoint is for the notifier (a Node process, not a browser). It uses Bearer auth against `env.API_SECRET` — the same secret the notifier sends as `Authorization: Bearer ${SUBSCRIBER_API_SECRET}`.

Behavior:
- 401 if no Bearer header or it doesn't match `env.API_SECRET`.
- Return `{ targets: NotificationTarget[] }` where each target is:
  ```ts
  interface NotificationTarget {
      email: string;
      name: string;
      notifications: {
          enabled: boolean;
          frequencyMinutes: 15 | 60 | 240;
      };
      lastNotifiedAt?: string;
      campgrounds: SiteConfig;       // user's per-user list
      globalSettings: GlobalSettings; // user's per-user settings
  }
  ```
- Defaults: if a user has no `notifications` field, default to `{ enabled: true, frequencyMinutes: 15 }` (they're a fresh sign-in who hasn't visited Account settings).
- Exclude users who have NO campground entries (their list is empty — no point telling the notifier about them).
- Sort by email for stable output.

Implementation:

```ts
import { getEnv, getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { getUserCampgrounds } from "@/lib/user-campgrounds";
import type { UserProfile } from "@/types/user";
import type { GlobalSettings, SiteConfig } from "@/types/campground";

interface NotificationTarget {
    email: string;
    name: string;
    notifications: { enabled: boolean; frequencyMinutes: 15 | 60 | 240 };
    lastNotifiedAt?: string;
    campgrounds: SiteConfig;
    globalSettings: GlobalSettings;
}

const PROFILE_PREFIX = "user:";
const PROFILE_SUFFIX = ":profile";

export async function GET(request: Request): Promise<Response> {
    const env = getEnv();
    if (!env.API_SECRET) {
        return withCors(jsonResponse({ error: "Server misconfigured: API_SECRET not set" }, 500));
    }
    const auth = request.headers.get("Authorization");
    if (!auth || auth !== `Bearer ${env.API_SECRET}`) {
        return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    }

    const kv = getKv();
    const targets: NotificationTarget[] = [];
    let cursor: string | undefined;

    do {
        const list = await kv.list({ prefix: PROFILE_PREFIX, cursor });
        for (const key of list.keys) {
            if (!key.name.endsWith(PROFILE_SUFFIX)) continue;
            const profile = (await kv.get(key.name, "json")) as UserProfile | null;
            if (!profile?.email) continue;

            const userList = await getUserCampgrounds(profile.email);
            const entries = userList?.campgrounds?.["recreation.gov"] ?? [];
            if (entries.length === 0) continue;

            const target: NotificationTarget = {
                email: profile.email,
                name: profile.name ?? profile.email,
                notifications: profile.notifications ?? {
                    enabled: true,
                    frequencyMinutes: 15,
                },
                campgrounds: userList!.campgrounds,
                globalSettings: userList!.globalSettings,
            };
            if (profile.lastNotifiedAt) target.lastNotifiedAt = profile.lastNotifiedAt;
            targets.push(target);
        }
        cursor = list.list_complete ? undefined : list.cursor;
    } while (cursor);

    targets.sort((a, b) => a.email.localeCompare(b.email));
    return withCors(jsonResponse({ targets }));
}
```

**Tests** (with the standard `vi.mock` pattern):
- 500 when `API_SECRET` env var is unset.
- 401 with no Bearer header.
- 401 with wrong Bearer value.
- 200 with valid Bearer + multiple users + one with no campgrounds → that user is excluded.
- 200 with default `notifications` synthesized for users who haven't set them.

Commit:
```
git add next/src/app/api/admin/notification-targets/
git commit -m "Add GET /api/admin/notification-targets for the notifier"
```

### Task A3: `PUT /api/admin/notifier-state`

**Files:**
- Create: `next/src/app/api/admin/notifier-state/route.ts`
- Test: `next/src/app/api/admin/notifier-state/route.test.ts`

Behavior:
- Same auth model as A2 (Bearer `API_SECRET`).
- Body: `{ updates: Array<{ email: string, state: unknown, lastNotifiedAt?: string }> }`.
- For each entry, write the `state` payload to `user:<email>:notifier-state` (KV) and patch the user's profile to update `lastNotifiedAt` if provided.
- Return `{ updated: number }`.

The `state` shape is opaque to the API; it's defined by the notifier (the notifier reads + writes its own format, the API just persists JSON).

Implementation:

```ts
import { getEnv, getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { updateUserProfile } from "@/lib/users";

interface UpdateEntry {
    email: string;
    state: unknown;
    lastNotifiedAt?: string;
}

function isValidBody(body: unknown): body is { updates: UpdateEntry[] } {
    if (!body || typeof body !== "object") return false;
    const updates = (body as { updates?: unknown }).updates;
    if (!Array.isArray(updates)) return false;
    return updates.every((u) => {
        if (!u || typeof u !== "object") return false;
        if (typeof (u as { email?: unknown }).email !== "string") return false;
        if (!(u as { state?: unknown }).hasOwnProperty?.("state")) return false;
        return true;
    });
}

export async function PUT(request: Request): Promise<Response> {
    const env = getEnv();
    if (!env.API_SECRET) {
        return withCors(jsonResponse({ error: "Server misconfigured: API_SECRET not set" }, 500));
    }
    const auth = request.headers.get("Authorization");
    if (!auth || auth !== `Bearer ${env.API_SECRET}`) {
        return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return withCors(jsonResponse({ error: "Invalid JSON" }, 400));
    }
    if (!isValidBody(body)) {
        return withCors(jsonResponse({ error: "Body must include updates: UpdateEntry[]" }, 400));
    }

    const kv = getKv();
    let updated = 0;
    for (const entry of body.updates) {
        await kv.put(`user:${entry.email}:notifier-state`, JSON.stringify(entry.state));
        if (entry.lastNotifiedAt) {
            await updateUserProfile(entry.email, { lastNotifiedAt: entry.lastNotifiedAt });
        }
        updated++;
    }

    return withCors(jsonResponse({ updated }));
}
```

**Tests:**
- 500 no API_SECRET.
- 401 wrong Bearer.
- 400 missing `updates` array.
- 200 with two updates → KV state written + lastNotifiedAt patched on the profiles.

Commit:
```
git add next/src/app/api/admin/notifier-state/
git commit -m "Add PUT /api/admin/notifier-state for the notifier"
```

### Task A4: `GET /api/admin/notifier-state` for first-run seeding

The notifier needs to read each user's prior state to know what's "already alerted". One approach: include `notifier-state` per user in the GET /api/admin/notification-targets response. Cleaner: a separate endpoint that reads them in bulk so the targets response stays slim and the state can be loaded only when needed.

Add to the `notification-targets` route the previous state for each user. That keeps the notifier's API simple (one fetch returns everything it needs to know per cycle).

Modify Task A2's response shape:

```ts
interface NotificationTarget {
    email: string;
    name: string;
    notifications: { enabled: boolean; frequencyMinutes: 15 | 60 | 240 };
    lastNotifiedAt?: string;
    campgrounds: SiteConfig;
    globalSettings: GlobalSettings;
    notifierState: unknown | null; // ← NEW: whatever was last PUT to user:<email>:notifier-state
}
```

In the implementation, for each profile, also load `user:<email>:notifier-state`. Update the test to assert `notifierState` is the previously-saved state (or null for fresh users).

If you'd rather keep the endpoints split, add a separate `GET /api/admin/notifier-state` that returns `{ states: Record<email, unknown> }`. Either works; pick whichever feels cleaner to read. The plan body below assumes the bundled approach.

Commit:
```
git add next/src/app/api/admin/notification-targets/
git commit -m "Include per-user notifier state in /api/admin/notification-targets response"
```

---

## Section B: Notifier rewrite

### Task B1: Read the existing notifier end-to-end

**Files (read only):**
- `notifier/check.mjs` (335 lines)
- `notifier/lib/fetch-availability.mjs` (198 lines)
- `notifier/lib/diff.mjs` (55 lines)
- `notifier/lib/email.mjs` (181 lines)

```bash
cat notifier/check.mjs
cat notifier/lib/fetch-availability.mjs
cat notifier/lib/diff.mjs
cat notifier/lib/email.mjs
```

Take notes on:
- How the existing run is structured (`main()` flow).
- How `fetch-availability.mjs` enumerates campgrounds and fetches months.
- How `diff.mjs` produces "new matches" from current vs previous state.
- How `email.mjs` composes the HTML / plain text body, including the unsubscribe link and the priority-emails head-start logic.

No code change in this task. Just understand the moving parts before rewriting.

### Task B2: Replace `notifier/check.mjs` with the per-user driver

**Files:**
- Modify: `notifier/check.mjs` (rewrite the main function; keep helper modules but adjust their callers)

Pseudocode for the new `main()`:

```js
async function main() {
    const subscriberApiUrl = process.env.SUBSCRIBER_API_URL;
    const subscriberApiSecret = process.env.SUBSCRIBER_API_SECRET;
    const resendApiKey = process.env.RESEND_API_KEY;
    const siteUrl = process.env.SITE_URL || "";
    const forceEmail = process.env.FORCE_EMAIL === "true";
    const now = new Date();

    if (!subscriberApiUrl || !subscriberApiSecret) {
        console.error("[Error] Missing SUBSCRIBER_API_URL or SUBSCRIBER_API_SECRET");
        process.exit(1);
    }
    if (!resendApiKey) {
        console.error("[Error] Missing RESEND_API_KEY");
        process.exit(1);
    }

    // 1. Fetch targets (users + lists + prefs + per-user prior state).
    const { targets } = await fetchTargets(subscriberApiUrl, subscriberApiSecret);
    console.log(`[Targets] ${targets.length} users with non-empty campground lists`);

    // 2. Filter by enabled + frequency.
    const eligible = targets.filter((t) => isEligible(t, now, forceEmail));
    console.log(`[Eligible] ${eligible.length} users due for a check this cycle`);
    if (eligible.length === 0) {
        console.log("[Done] Nothing to do");
        return;
    }

    // 3. Build dedup'd fetch plan: a map of campgroundId → widest date range
    //    needed by any user, then expanded to (campgroundId, month) tuples.
    const fetchPlan = buildDedupedFetchPlan(eligible);
    console.log(`[Plan] ${fetchPlan.length} unique (campground, month) fetches`);

    // 4. Fetch each tuple from recreation.gov ONCE.
    const fetchedByCampground = await fetchAllDeduped(fetchPlan);

    // 5. Per user: compute their matches, diff against prior state.
    //    `priorState` lives at target.notifierState (null on first run).
    const updates = [];
    for (const target of eligible) {
        const matchesBySite = computeMatchesForUser(target, fetchedByCampground);
        const priorState = target.notifierState ?? null;
        const isFirstRun = priorState === null;

        const { newMatches, nextState } = diffPerUser(matchesBySite, priorState);

        if (isFirstRun && !forceEmail) {
            // Seed the state without emailing — we don't want to spam users about
            // current availability they were already aware of pre-cutover.
            console.log(`[${target.email}] first run — seeding state, no email`);
            updates.push({
                email: target.email,
                state: nextState,
                lastNotifiedAt: now.toISOString(),
            });
            continue;
        }

        if (newMatches.length === 0) {
            console.log(`[${target.email}] 0 new matches`);
            updates.push({ email: target.email, state: nextState });
            continue;
        }

        console.log(`[${target.email}] ${newMatches.length} new match(es) — sending email`);
        await sendEmailToUser({
            user: target,
            matches: newMatches,
            resendApiKey,
            siteUrl,
            apiSecret: subscriberApiSecret,
        });

        updates.push({
            email: target.email,
            state: nextState,
            lastNotifiedAt: now.toISOString(),
        });
    }

    // 6. Bulk persist updated state.
    await pushNotifierUpdates(subscriberApiUrl, subscriberApiSecret, updates);
    console.log(`[Done] Updated state for ${updates.length} user(s)`);
}
```

Helper functions (in the same file or split into `notifier/lib/per-user.mjs` for clarity):

```js
function isEligible(target, now, forceEmail) {
    if (forceEmail) return true;
    if (!target.notifications?.enabled) return false;
    const last = target.lastNotifiedAt ? new Date(target.lastNotifiedAt) : null;
    if (!last) return true;
    const elapsedMin = (now.getTime() - last.getTime()) / 60000;
    return elapsedMin >= target.notifications.frequencyMinutes;
}

function buildDedupedFetchPlan(targets) {
    // For each campground id, take the union of months across users.
    const ranges = new Map(); // campgroundId → Set<"YYYY-MM">
    for (const target of targets) {
        for (const c of target.campgrounds["recreation.gov"]) {
            if (c.enabled === false) continue;
            const start = c.dates?.startDate;
            const end = c.dates?.endDate;
            if (!start || !end) continue;
            const months = monthsBetween(start, end);
            if (!ranges.has(c.id)) ranges.set(c.id, new Set());
            for (const m of months) ranges.get(c.id).add(m);
        }
    }
    const plan = [];
    for (const [campgroundId, monthSet] of ranges) {
        for (const month of monthSet) plan.push({ campgroundId, month });
    }
    return plan;
}

function monthsBetween(startIso, endIso) {
    const start = new Date(startIso + "T00:00:00Z");
    const end = new Date(endIso + "T00:00:00Z");
    const months = new Set();
    const cur = new Date(start);
    while (cur <= end) {
        months.add(`${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}`);
        cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
    return [...months];
}
```

`fetchAllDeduped(plan)` — port the existing `fetchAvailability` per (campground, month) loop from `notifier/lib/fetch-availability.mjs`. Output: `{ [campgroundId]: { siteId: { siteName, availableDates: string[], campsiteType, ... } } }` merged across months.

`computeMatchesForUser(target, fetchedByCampground)` — port the match-finding logic from `notifier/lib/fetch-availability.mjs` (consecutive ranges, stay-length filter, valid-start-day filter, favorites/worthwhile grouping). Apply per-user `target.globalSettings` + per-campground overrides. Output: per-campground matches the user actually cares about.

`diffPerUser(matchesBySite, priorState)` — port the signature-based diffing from `notifier/lib/diff.mjs`. Signature for a match: `${campgroundId}|${siteId}|${from}|${to}`. New matches = current signatures not in prior. Output `{ newMatches, nextState }`.

`sendEmailToUser({ user, matches, resendApiKey, siteUrl, apiSecret })` — port `notifier/lib/email.mjs`. Use `user.email` as the only recipient. Use `user.name` as the salutation. Unsubscribe link still works against the existing `/api/unsubscribe` endpoint (the HMAC scheme hasn't changed); generate the token using `apiSecret` (same value the old notifier used).

`fetchTargets(apiUrl, apiSecret)` — `fetch(${apiUrl}/api/admin/notification-targets, { headers: { Authorization: \`Bearer ${apiSecret}\` } })`.

`pushNotifierUpdates(apiUrl, apiSecret, updates)` — `fetch(${apiUrl}/api/admin/notifier-state, { method: "PUT", headers: { ..., "Content-Type": "application/json" }, body: JSON.stringify({ updates }) })`.

**Important:** the priority-email head-start logic in the OLD `check.mjs` (delay non-priority subscribers by 15 minutes) becomes irrelevant under per-user accounts — every user gets their own email immediately. Drop the priority-emails feature. Remove the `PRIORITY_EMAILS` env reference if it's only used here (verify nothing else reads it).

**Remove the local state.json caching:** previously the notifier cached `notifier/state.json` in the GH Actions cache. With per-user state now in KV, the local cache file is dead weight. Remove the cache step from `.github/workflows/check-campsites.yml` too. Update the workflow to not require `notifier/state.json` or `notifier/pending-notifications.json`.

**Update the GitHub Actions workflow:**
- Drop the `actions/cache/restore@v5` and `actions/cache/save@v5` steps.
- Drop the `PRIORITY_EMAILS` env (if it was only used for the head-start feature).

Commit:
```
git add notifier/check.mjs notifier/lib/ .github/workflows/check-campsites.yml
git commit -m "Rewrite notifier for per-user lists with dedup'd rec.gov fetches"
```

### Task B3: Trim or refactor unused notifier helpers

After B2, the existing `notifier/lib/fetch-availability.mjs` and `notifier/lib/diff.mjs` may be:
- Partially reused (good — keep)
- Fully replaced by inline logic in the new `check.mjs` (delete the file)

Audit and clean. If you kept them, make sure they take the new per-user inputs (not the legacy shared-config inputs).

`notifier/lib/email.mjs` should keep most of its body — the email composition is per-user-friendly already. Just update the call site to pass a single email + a single user's matches.

Commit (or merge into B2's commit if the file changes are tiny):
```
git add notifier/lib/
git commit -m "Trim notifier helpers after rewire"
```

### Task B4: Local notifier smoke

Run the notifier locally against the deployed Worker (read-only — set the env to point at production but use forceEmail=false so a first-run-empty user just seeds state without emailing):

```bash
cd notifier
SUBSCRIBER_API_URL="https://campwatch.mikeroberts421.workers.dev" \
SUBSCRIBER_API_SECRET="<value-from-1password>" \
RESEND_API_KEY="<value>" \
SITE_URL="https://campwatch.mikeroberts421.workers.dev/app" \
FORCE_EMAIL=false \
node check.mjs 2>&1 | tail -40
```

Read the output:
- `[Targets] N users` should report your account + any test users.
- `[Plan] M unique (campground, month) fetches` should be smaller than `targets × campgrounds × months`.
- First-run users get `[<email>] first run — seeding state, no email` and no email is sent.
- Returning users with no new matches get `[<email>] 0 new matches` and no email.
- Returning users with new matches get `[<email>] N new match(es) — sending email` and an email arrives.
- The `[Done] Updated state for ...` line confirms the state PUT round-trip.

If you don't have access to `SUBSCRIBER_API_SECRET` locally, skip this and rely on the CI run.

No commit (verification only).

---

## Section C: UI cleanup

### Task C1: Remove `<NotificationSubscribe />` from `/app/page.tsx`

The dashboard at `/app` is auth-gated. Signed-in users automatically get notifications based on their watchlist + `notifications.enabled`. The legacy anonymous email-subscribe form is obsolete and confusing.

**Files:**
- Modify: `next/src/app/app/page.tsx`

- Remove the `<NotificationSubscribe />` element from the footer.
- Remove the `import { NotificationSubscribe } from "@/components/notification-subscribe"` line.

You can leave the component file in place for now (`next/src/components/notification-subscribe.tsx`) since other surfaces might want it; this just removes it from the dashboard. If you confirm via grep that nothing else uses it, delete the file too.

```bash
cd next && grep -rln "NotificationSubscribe" src/ | head
```

If zero references, `git rm next/src/components/notification-subscribe.tsx`.

Commit:
```
git add next/src/app/app/page.tsx
git rm next/src/components/notification-subscribe.tsx 2>/dev/null || true
git commit -m "Remove obsolete anonymous email subscribe form from /app"
```

The `/api/subscribe`, `/api/unsubscribe`, and `/api/subscribers` Route Handlers stay in place. The `email:*` KV records stay (dead data, harmless). Existing unsubscribe links in already-sent emails continue to work via `/api/unsubscribe`.

---

## Section D: Deploy + smoke + PR

### Task D1: Push and watch CI

```bash
git push -u origin feature/phase-5-notifier-rewire
gh run watch --exit-status
```

This deploys the Worker. The notifier itself doesn't deploy as part of the Worker workflow — it runs in `.github/workflows/check-campsites.yml` via the cron.

### Task D2: Manually trigger the notifier cron + verify

```bash
gh workflow run check-campsites.yml --ref main
sleep 5
gh run watch <RUN_ID> --exit-status
gh run view <RUN_ID> --log 2>&1 | grep -iE "Targets|Plan|first run|new match|Updated state" | head -40
```

Expected log lines (depending on KV state):
- `[Targets] 1 users` (or however many have set up a watchlist).
- `[Plan] X unique (campground, month) fetches`. X should equal the union of months across all users, not the sum.
- Per-user `[<email>] ...` lines.
- `[Done] Updated state for N users`.

No emails should be sent on this first cutover run (first-run seeding mode). Confirm by checking your inbox: the only emails you should see from CampWatch are the legacy ones from before the cutover.

### Task D3: Wait for the next cron run + verify

Set a 15-minute timer. After the next scheduled run:

```bash
gh run list --workflow=check-campsites.yml --limit 1
gh run view <RUN_ID> --log 2>&1 | grep -iE "Targets|Plan|new match|Updated state" | head -40
```

Now the per-user state is seeded; this run should diff against it. If new availability appeared during the 15-minute window, you should see `[<email>] N new match(es) — sending email` and receive an email.

If nothing changed, expect `[<email>] 0 new matches` across the board.

### Task D4: Open PR

```bash
gh pr create --base main --head feature/phase-5-notifier-rewire \
    --title "Phase 5: Notifier rewire with per-user lists + dedup" \
    --body "..."
```

PR body covers:
- New endpoints: `/api/admin/notification-targets` (GET) and `/api/admin/notifier-state` (PUT). Both gated by `API_SECRET`.
- `UserProfile` gains `lastNotifiedAt?: string` (no migration; missing field treated as "never").
- Notifier driver rewritten to fetch users + dedupe + fan-out + diff + email per user. Local `state.json` cache step removed from the workflow.
- First-run seeding behavior: on cutover, users have no `notifier-state` yet, so the first run just seeds their state without sending email. Prevents duplicate-alert spam.
- `<NotificationSubscribe />` removed from the dashboard footer. Legacy `/api/subscribe` and `email:*` KV records stay in place but unused. Existing unsubscribe links in already-sent emails still work via the unchanged `/api/unsubscribe` endpoint.
- Live verification: CI cron triggered manually + the next scheduled run logged the expected fan-out shape.

---

## Self-review checklist

- [ ] `GET /api/admin/notification-targets` returns per-user data + the user's prior `notifier-state`.
- [ ] `PUT /api/admin/notifier-state` persists both state AND `lastNotifiedAt` on the profile.
- [ ] Notifier honors `notifications.enabled = false` (skips entire user).
- [ ] Notifier honors `frequencyMinutes` (skips user until interval elapsed since `lastNotifiedAt`).
- [ ] Dedup: each unique (campgroundId, month) is fetched exactly once per cycle, regardless of how many users watch it.
- [ ] First-run seeding doesn't email; subsequent runs do.
- [ ] Unsubscribe links in already-sent emails continue to work.
- [ ] No code path still reads the anonymous `email:*` KV namespace.
- [ ] `PRIORITY_EMAILS` env variable is no longer required (or is harmless if still passed by the workflow).
- [ ] The local `state.json` cache step is removed from `.github/workflows/check-campsites.yml`.

## After this lands

The multi-user rebuild is structurally complete. Remaining polish (not part of any plan):

- Build a one-shot script to delete orphan `email:*` KV records.
- Onboarding email when a user creates an account.
- Better empty-state messaging on `/app` when a user has notifications disabled.
- Re-enable per-campground notification rules (per-campground `notifyAll` already exists; per-user override patterns could be added).
- Add an "I'm leaving" survey to the delete-account flow.

But those are deferred — Phase 5 closes the multi-user spec.
