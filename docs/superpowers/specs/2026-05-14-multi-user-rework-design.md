# CampWatch Multi-User Rework

## Goals

Convert CampWatch from a single-shared-config app into a multi-user product:

- Anyone can sign in with Google and get their own private campground watchlist persisted server-side.
- A small set of curators (initially: one — Mike) manage a public "curated default" list that anonymous visitors can browse on `/discover` and that new users can clone as a starter.
- Email notifications are tied to Google identity, not anonymous subscribers. Each user gets alerts based on their own list.
- The notifier deduplicates campground fetches across users — if 50 users watch the same campground, we hit recreation.gov once and fan out.
- A modern public landing page communicates what the app does before requiring sign-in.

## Non-Goals

- Public sharing of personal lists (deferred — stretch in a later phase).
- Mobile app / push notifications (web + email only).
- Payment / paid tiers.
- Migrating existing anonymous email subscribers (explicit user decision — they'll need to sign in fresh).
- Image upload to R2 (auto-pull from recreation.gov + optional URL override is enough; see "Image handling").

## High-Level Architecture

```
                            ┌─────────────────────────────┐
                            │  React SPA (CRA)            │
                            │  ┌───────────────────────┐  │
   Anonymous visitor ──────►│  │  /                    │  │
                            │  │  /discover            │  │
                            │  └───────────────────────┘  │
                            │  ┌───────────────────────┐  │
   Signed-in user   ───────►│  │  /app, /app/account   │  │
                            │  │  (session cookie req) │  │
                            │  └───────────────────────┘  │
                            └──────────────┬──────────────┘
                                           │
                                           ▼
                            ┌─────────────────────────────┐
                            │  Cloudflare Worker          │
                            │  ┌───────────────────────┐  │
                            │  │ /auth/google/*        │  │
                            │  │ /api/me               │  │
                            │  │ /api/users/me/*       │  │
                            │  │ /api/default/*        │  │
                            │  │ /api/admin/* (curator)│  │
                            │  └───────────────────────┘  │
                            └──────────────┬──────────────┘
                                           │
                                           ▼
                            ┌─────────────────────────────┐
                            │  KV (SUBSCRIBERS namespace) │
                            │                             │
                            │  config:default             │
                            │  user:<email>:profile       │
                            │  user:<email>:campgrounds   │
                            │  session:<sessionId>        │
                            └─────────────────────────────┘

                            ┌─────────────────────────────┐
                            │  Notifier (GH Actions cron) │
                            │   ┌───────────────────────┐ │
                            │   │ 1. List all users     │ │
                            │   │ 2. Union all watched  │ │
                            │   │    campgrounds        │ │
                            │   │ 3. Fetch each once    │ │
                            │   │ 4. Fan out matches    │ │
                            │   │    per user → email   │ │
                            │   └───────────────────────┘ │
                            └─────────────────────────────┘
```

## Data Model

All keys live in the existing `SUBSCRIBERS` KV namespace.

### `config:default`

The curator-owned canonical list. Read-publicly via `GET /api/default`. Write-restricted to users with the `curator` role.

Same shape as today's `config:campgrounds`: `{ campgrounds: { 'recreation.gov': [...] }, globalSettings: {...} }`.

### `user:<email>:profile`

```typescript
{
    email: string,
    name: string,           // From Google ID token
    picture: string,        // Google avatar URL
    roles: string[],        // e.g., ['curator']. Empty for normal users.
    createdAt: string,      // ISO timestamp
    notifications: {
        enabled: boolean,
        frequencyMinutes: 15 | 60 | 240,
    },
}
```

Email is the primary identity. We use the verified email from Google's ID token, lowercased. No email-change story for v1 (Google handles email changes upstream).

### `user:<email>:campgrounds`

```typescript
{
    campgrounds: { 'recreation.gov': Campground[] },
    globalSettings: { stayLengths: number[], validStartDays: string[] },
}
```

Same shape as today's per-user config. The home view (`/app`) reads/writes this.

### `session:<sessionId>`

```typescript
{
    email: string,
    createdAt: string,
    expiresAt: string,      // 30 days from creation, sliding
    userAgent: string,      // For "active sessions" UI later
}
```

Sessions are opaque random tokens (32 bytes, hex-encoded). Stored server-side so they can be revoked. The cookie value is the session ID; the cookie itself is `HttpOnly, Secure, SameSite=Lax`. Lookup on every authenticated request adds one KV read — fine at this scale.

We do NOT use JWTs. JWTs are stateless and can't be invalidated server-side without keeping a denylist anyway; opaque session tokens are simpler and more secure for this app.

### Bootstrap admin

Worker env: `BOOTSTRAP_ADMIN_EMAIL` — the email that gets `curator` role granted automatically on first sign-in if KV has no existing curators. After that, env is ignored; admins manage themselves via the UI.

## Auth Flow

### Sign in

1. User clicks "Sign in with Google" on `/` or `/app` (redirected from a protected page).
2. Worker `GET /auth/google/start` generates a random `state` token, sets it in a short-lived (10 min) HttpOnly cookie, redirects to Google's authorization URL with `state`, `client_id`, `redirect_uri=/auth/google/callback`, and `scope=openid email profile`.
3. Google redirects back to `/auth/google/callback?code=...&state=...`.
4. Worker validates `state` against the cookie. Exchanges `code` for tokens via Google's token endpoint. Verifies the ID token signature against Google's JWKS (cached in Worker memory).
5. Extracts `email`, `email_verified`, `name`, `picture` from ID token. Rejects if `email_verified === false`.
6. If `user:<email>:profile` doesn't exist, creates it with default settings. If `BOOTSTRAP_ADMIN_EMAIL` matches AND no other curator exists in KV, grants `curator` role.
7. Generates a session token, stores `session:<id>` in KV, sets cookie, redirects to `/app` (or a `returnTo` param if present).

### Sign out

`POST /auth/logout` deletes the KV session record, clears the cookie, redirects to `/`.

### Authorization middleware

- `requireSession(request)` — reads session cookie, looks up KV, returns user profile or 401. Used on `/api/me`, `/api/users/me/*`.
- `requireCurator(request)` — same as above plus checks `roles.includes('curator')`. Returns 403 otherwise. Used on `/api/default` PUT and `/api/admin/*`.

### Token rotation / refresh

Session has a 30-day absolute expiry. On every authenticated request, if more than 24h remain, no-op. If less, regenerate session ID (new KV entry, delete old) — this gives a sliding window for active users while preventing long-lived static tokens.

## API Surface

| Path | Method | Auth | Purpose |
|---|---|---|---|
| `/auth/google/start` | GET | none | Begin OAuth flow |
| `/auth/google/callback` | GET | none | Complete OAuth flow |
| `/auth/logout` | POST | session | End session |
| `/api/me` | GET | session | Current user profile |
| `/api/me` | PATCH | session | Update notification prefs, name |
| `/api/me` | DELETE | session | Delete account (wipes profile + campgrounds + sessions) |
| `/api/users/me/campgrounds` | GET | session | This user's watchlist |
| `/api/users/me/campgrounds` | PUT | session | Replace this user's watchlist |
| `/api/users/me/campgrounds/clone-default` | POST | session | Clone curator's default into this user's list |
| `/api/default` | GET | none | The curated default (public read) |
| `/api/default` | PUT | curator | Update the curated default |
| `/api/admin/users` | GET | curator | List all users (for managing roles) |
| `/api/admin/users/:email/roles` | PUT | curator | Grant/revoke roles |
| `/api/recgov/facility/:id` | GET | session | Server-side proxy to recreation.gov for metadata fetch (handles edge cases + caches) |

The internal-only notifier still hits `/api/admin/users` (or a dedicated `/api/admin/notification-targets`) to enumerate who-watches-what, gated by `API_SECRET` for service-to-service auth.

## Page-by-Page UX

### `/` — Public landing

Above the fold:
- Hero: large background image of mountains/lake at dusk. Tagline: "Never miss a campsite opening at your favorite spots."
- Sub-headline: "CampWatch checks recreation.gov every 15 minutes and emails you when sites you want come available."
- Primary CTA: "Sign in with Google" (one-click sign-up + sign-in).
- Secondary link: "Browse Mike's picks →" to `/discover`.

Below the fold (the "sample view" piece):
- A live or static preview of three example campground cards in the new design language. Shows what an alert looks like in the UI.
- "How it works" — 3-step illustration: pick campgrounds → set dates → get emails.
- "Built by a camper, for campers" + small footer (privacy, source on GitHub).

Mobile responsive from the start. No login wall before seeing any of this.

### `/discover` — Curated default (public read)

Read-only view of the curator's default list. Same card UI as `/app`, but:
- "Add this campground to my list" button on each card → if not signed in, prompts sign-in; if signed in, adds to their `user:<email>:campgrounds`.
- No edit affordances. No "Configure Sites" button.
- Banner at top: "These are Mike's picks. Sign in to build your own list."

**Unauthenticated access to `/app` or `/app/*`** redirects to `/?returnTo=/app` (the landing page presents a sign-in CTA, and after auth the worker honors the `returnTo` query param to send the user back where they were headed).

### `/app` — Authenticated dashboard

The main view. Identical concept to today's home page, but the campground list comes from `user:<email>:campgrounds`. On the very first visit (no entries yet), shows the empty-state modal:

```
+----------------------------------------------------+
| Welcome to CampWatch.                              |
|                                                    |
| You can start with a curated list of Mike's        |
| favorite Idaho campgrounds, or build your own from |
| scratch. You can always edit either way later.     |
|                                                    |
|   [Clone Mike's list]   [Start blank]              |
+----------------------------------------------------+
```

Configure Sites becomes the UI-driven add/edit flow from the prior brainstorm (recreation.gov ID/URL paste, metadata auto-fetch, etc.).

### `/app/account` — Account settings

- Avatar + name + email (read-only).
- Notification toggle (on/off) and frequency (15min / 1h / 4h).
- "Sign out" button.
- "Delete account" button → confirm modal → wipes profile, campgrounds, sessions.

If the current user has the `curator` role, an extra section appears:
- "Curator dashboard" link to `/app/admin`.

### `/app/admin` — Curator-only

- List of all users (`/api/admin/users`).
- Per-user role toggle (grant/revoke `curator`).
- Link to "Edit the curated default list" — opens the same Configure Sites dialog but targeting `/api/default` instead of the user's own list.

## Notifier Rewire (Deduplication)

Current notifier reads one KV key (`config:campgrounds`), fetches each campground once, sends matches to every subscriber. Multi-user version needs to fetch each campground only once and route matches per-user.

### Algorithm

```
1. List all keys with prefix `user:` and suffix `:campgrounds`.
2. For each user, read their list. Skip users with notifications.enabled = false.
3. Build a map: campgroundId -> Set<email>. While iterating, for each user's
   campground, also stash the per-user filter (dates, favorites, stayLengths,
   validStartDays, notifyAll, enabled).
4. Union all (campgroundId, dateRange) tuples. For each unique campground,
   take the widest date range across all watchers.
5. Fetch each campground once (one API call per campground per month in range).
6. For each fetched campground, iterate the watchers and apply per-user filters
   to determine which matches are relevant.
7. Aggregate per-user matches into one email per user. Diff against last-run
   state (still stored per-user in KV) to only send NEW availability.
8. Send batched email per user via Resend.
```

### State storage for "what we already alerted on"

Today: one global `previous-matches` KV blob. Multi-user: `user:<email>:notifier-state` per user (so each user's "already alerted" set is tracked independently).

### Cost / scale notes

At 10 users with mostly-overlapping lists (typical for friends watching the same Idaho campgrounds), this approach hits recreation.gov maybe 12-15 times per run instead of 100+. At 100 users, the savings compound. The fan-out is in-memory and cheap.

### Failure mode

If the notifier fails to send to one user, others should still get their emails. Implementation: try/catch around each user's send + log.

## UI Refresh Direction

Stay on MUI (no framework rewrite) but modernize patterns:

- **Cards**: bigger hero image (or generated solid color if no image), name + area in clearer hierarchy, status pill ("3 matches" / "no availability") prominent, calendar collapsed by default in a drawer/expansion. Soft `box-shadow` instead of hard borders.
- **Typography**: bump the heading scale, lighten body text slightly, add a more generous line-height.
- **Spacing**: more whitespace between cards and sections. Less dense.
- **Color**: keep light/dark mode toggle. Add a subtle accent color (a forest green) for primary CTAs.
- **Landing page**: full-bleed hero image, larger headlines, no navigation chrome — minimal and confident.

Specific mocks deferred to implementation phase. The above sets the direction.

## Phasing Plan

The whole rework is one spec but ships in phases. Each phase is independently shippable to production.

### Phase 1 — Auth foundation

- Google OAuth in worker (`/auth/google/*`).
- Session middleware (`requireSession`, `requireCurator`).
- `user:<email>:profile` storage, bootstrap admin logic.
- `/api/me` endpoint.
- Minimal React: sign-in button on existing home page, `/app/account` page with name + sign out.
- Existing functionality (shared KV config) keeps working unchanged.

**Ships as**: existing app + login state visible in the top bar.

### Phase 2 — Per-user lists

- `user:<email>:campgrounds` storage.
- `/api/users/me/campgrounds` GET/PUT.
- `/api/default` GET (public) and PUT (curator-only).
- Existing `config:campgrounds` migrates to `config:default`.
- Routing: `/app` becomes the auth-gated dashboard, reading the user's list.
- Onboarding: clone-default vs. start-blank modal on first visit.
- Configure Sites dialog still works, but targets user's list (or, if curator + in admin mode, default).

**Ships as**: per-user lists work. Anonymous home page still shows the curated default (read-only).

### Phase 3 — Public landing + `/discover`

- New `/` landing page with hero + sample cards + CTA.
- `/discover` page showing the curated default with "Add to my list" buttons.
- React Router added (or equivalent route gating).

**Ships as**: a real product front door.

### Phase 4 — UI-driven catalog rework

- The Configure Sites dialog gets the rec.gov-fetch-by-ID flow from the prior brainstorm.
- Retire `campgroundCatalog.js` and `siteConfigurations.js` as runtime sources. Keep only as one-time seed for the curator's bootstrap.
- Per-card metadata fully editable in the dialog.

**Ships as**: no more code edits to add campgrounds.

### Phase 5 — Notifier rewire with dedup

- Notifier reads per-user lists.
- Dedup + fan-out algorithm.
- Per-user `notifier-state` for diffing.
- Per-user notification preferences honored.
- Old anonymous `email:` keys are deleted (no migration).

**Ships as**: emails are now keyed to user identity, scale-ready.

### Phase 6 — UI refresh

- New card design, typography pass, color tweaks.
- Calendar moves to a drawer.
- Mobile polish.

**Ships as**: the app looks like a finished product.

Phases can ship behind feature flags or staggered deploys. Phase 1 + 2 + 5 are the load-bearing changes; 3, 4, 6 are independent UX work that can happen any time after 2 is in.

## Error Handling

Boundaries:
- **OAuth errors** (state mismatch, expired code, unverified email) → redirect to `/?authError=<reason>` with a toast.
- **KV unavailable** (rare on Cloudflare but possible during deploy) → 503 with a "try again in a moment" page.
- **recreation.gov API errors** → already handled in the existing notifier and fetch logic; carry forward.
- **Notifier failure on one user** → log and continue to next user.

## Security Considerations

- Session cookies: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, expiry matching session TTL.
- CSRF: `SameSite=Lax` covers the common cases; for state-changing API calls, the React app and worker share an origin so cross-site requests are blocked. No CSRF token needed.
- Email is the user identity. We trust Google's `email_verified` claim. Reject unverified emails.
- Curator role grants are stored server-side; the client can't elevate by editing localStorage.
- Audit log (deferred): we can add a `audit:<timestamp>:<actor>:<action>` KV log later if we need it.
- CORS: the SPA and API are served from the same Worker origin (`campsites-finder.mikeroberts421.workers.dev`), so CORS doesn't apply to the auth flow. The existing `cors()` helper for API responses stays as-is for any cross-origin scripted clients.

## Testing Approach

- Unit tests for: session token generation, ID token verification, role check logic, notifier dedup algorithm.
- Manual end-to-end on staging (`workers.dev` subdomain) with a separate KV namespace + Google OAuth client.
- Anonymous browse → sign in → onboarding modal → clone default → edit own list → email arrives → sign out → re-sign-in restores list. Run through this each phase.

## Open Questions

None at design time. Implementation may surface a few — flagged for the writing-plans pass.

## Future Work (Explicitly Out of Scope)

- Public share link for a personal list.
- Multi-org curator (e.g., "ranger curators" who own specific regions).
- Real-time updates (websockets vs. polling).
- Native mobile app or PWA install prompt.
- Paid tier with higher notification frequency / SMS.
