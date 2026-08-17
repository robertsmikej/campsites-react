# Trip Windows Decoupling

Decouple trip windows from the campground config blob into their own KV key and API endpoints so that campground saves never touch trip data and vice versa.

## Problem

Trip windows (`TripWindow[]`) live inside `globalSettings` on the `user:{email}:campgrounds` KV record. Every campground save replaces the entire blob atomically. Any code path that reconstructs `globalSettings` from local state (as the config dialog did) silently drops trip windows. The coupling also means trip window writes trigger a full campground rewrite, and campground writes must carry trip windows through even though they're unrelated.

## Data Layer

### New KV key

```
user:{email}:trip-windows
```

Record shape:

```ts
interface TripWindowsRecord {
  tripWindows: TripWindow[];
  updatedAt: string | null;
}
```

### New abstraction: `next/src/lib/user-trip-windows.ts`

Mirrors the existing `user-campgrounds.ts` pattern:

- `key(email: string)` — returns `user:${email}:trip-windows`
- `getUserTripWindows(kv, email)` — reads from the new key; includes read-through migration (see Migration section)
- `putUserTripWindows(kv, email, tripWindows)` — writes to the new key with an `updatedAt` timestamp

### GlobalSettings change

Remove `tripWindows?: TripWindow[]` from the `GlobalSettings` interface. `GlobalSettings` becomes campground-only settings: `stayLengths`, `validStartDays`, `blackoutDates`.

## API Layer

### New endpoints

**`GET /api/users/me/trip-windows`**

Returns `TripWindowsRecord`. Handles read-through migration on first access.

**`PUT /api/users/me/trip-windows`**

Request body: `{ tripWindows: TripWindow[] }`.

Processing:
1. Validate via `validTripWindows()`
2. Prune past windows via `windowIsPast(w, serverTodayIso())`
3. Write to the new KV key
4. Return the saved record

### Modified endpoints

**`GET /api/users/me/campgrounds`** — response no longer includes `tripWindows` in `globalSettings`.

**`PUT /api/users/me/campgrounds`** — stops validating or pruning `tripWindows`. Ignores the field if sent (backward compat during migration window).

**`GET /api/admin/notification-targets`** — reads trip windows from the new key via `getUserTripWindows()` alongside the campground config. Includes them in the `NotificationTarget` response. The response shape keeps `globalSettings.tripWindows` for notifier compat (or promotes to `target.tripWindows`; either way the notifier's PlannableTarget type stays the same).

**`GET /api/availability`** — reads trip windows from the new key via `getUserTripWindows()` instead of from `config.globalSettings.tripWindows`.

### Default config

`next/src/lib/default-config.ts` already strips `tripWindows` from the curator's global settings. After the migration, this strip becomes a no-op (the field won't exist). Remove the destructuring.

## Client Layer

### New hook: `useTripWindows`

Location: `next/src/hooks/use-trip-windows.ts`

Responsibilities:
- Fetch from `GET /api/users/me/trip-windows` on mount
- Expose `tripWindows: TripWindow[]` and `tripWindowsUpdatedAt: string | null`
- Expose `saveTripWindows(windows: TripWindow[]): Promise<void>` that PUTs to the new endpoint and updates local state from the response
- Expose sync status (success/error) for toast feedback
- Independent of `useUserCampgrounds`

### Modified hook: `useUserCampgrounds`

- `GlobalSettings` no longer carries `tripWindows`
- `save()` no longer transports trip windows
- No other changes

### Page wiring (`app/page.tsx`)

- Call `useTripWindows()` alongside `useUserCampgrounds()`
- Build `SiteSettingsValue.dates.tripWindows` from the new hook's state
- Pass `tripWindows` and `saveTripWindows` to `TripsCard` from the new hook
- Remove `handleTripWindowsChange` (replaced by `saveTripWindows` from the hook)

### Config dialog

- No longer needs to carry `tripWindows` through on save
- The `...globalSettings` spread fix (just committed) becomes harmless since `globalSettings` won't have `tripWindows`
- No functional changes needed; the regression test can be updated to reflect that `tripWindows` is no longer part of `globalSettings`

### Dashboard components

No changes. `TripsCard`, timeline components, `SiteSettingsContext` all receive trip windows via props/context. The upstream source changes (new hook instead of campground hook), but the component interfaces stay the same.

## Notifier

The notifier accesses trip windows through `/api/admin/notification-targets`. That endpoint switches its data source from the campground blob to the new key. Downstream notifier code (fetch-jobs, check, email) is unchanged because it receives trip windows as part of the `PlannableTarget`/`NotificationTarget` shape.

If we promote `tripWindows` to a top-level field on `NotificationTarget` (instead of nesting in `globalSettings`), the notifier's `PlannableTarget` type and all `target.globalSettings?.tripWindows` references update to `target.tripWindows`. This is cleaner but touches more lines in the notifier. Either approach works.

## Migration

Read-through on first access, no batch script.

`getUserTripWindows(kv, email)`:
1. Read `user:{email}:trip-windows`. If it exists and has content, return it.
2. Read `user:{email}:campgrounds`. If `globalSettings.tripWindows` exists and is non-empty:
   a. Write it to `user:{email}:trip-windows` with `updatedAt: new Date().toISOString()`
   b. Strip `tripWindows` from the campground record's `globalSettings` and rewrite it
   c. Return the migrated record
3. Return `{ tripWindows: [], updatedAt: null }`

This is safe for a single-user app. No migration script, no deploy ordering, no window where data is in neither location. After the first read post-deploy, the old location is never consulted again.

### Cleanup

After confirming the migration has run (check that the new key exists via wrangler tail or a log), the fallback path in `getUserTripWindows` can be removed in a follow-up commit. No rush on this.

## Files Changed

### New files
- `next/src/lib/user-trip-windows.ts` — KV abstraction + migration
- `next/src/app/api/users/me/trip-windows/route.ts` — GET + PUT
- `next/src/hooks/use-trip-windows.ts` — client hook
- Tests for each of the above

### Modified files
- `next/src/types/campground.ts` — remove `tripWindows` from `GlobalSettings`
- `next/src/lib/user-campgrounds.ts` — no changes (it reads/writes the blob as-is; the type change propagates)
- `next/src/app/api/users/me/campgrounds/route.ts` — remove tripWindows validation and pruning from PUT
- `next/src/app/api/availability/route.ts` — read trip windows from new key
- `next/src/app/api/admin/notification-targets/route.ts` — read trip windows from new key
- `next/src/lib/default-config.ts` — remove tripWindows strip (now a no-op)
- `next/src/hooks/use-user-campgrounds.ts` — type flows through naturally (no explicit changes)
- `next/src/app/app/page.tsx` — wire new hook, update SiteSettings and TripsCard props
- `next/src/components/site-config-dialog/index.test.tsx` — update regression test

### Unchanged files
- `next/src/lib/trip-windows.ts` — all utility functions unchanged
- `next/src/contexts/site-settings.tsx` — receives tripWindows from props, source-agnostic
- All timeline components — receive tripWindows from context, source-agnostic
- `next/src/components/dashboard/trips-card/trips-card.tsx` — receives tripWindows as prop, source-agnostic
- All notifier code (fetch-jobs, check, email) — receives trip windows via PlannableTarget, source-agnostic
- `next/src/lib/notifier-state-merge.ts` — dedup logic unchanged

## Testing

- **New:** `user-trip-windows.ts` unit tests covering read, write, and the three migration paths (new key exists, old key has trip windows, neither has data)
- **New:** `trip-windows/route.ts` tests covering GET (with migration), PUT (validation, pruning, persistence)
- **New:** `use-trip-windows.ts` hook tests
- **Updated:** campground route tests — verify tripWindows field is ignored on PUT, absent from GET response
- **Updated:** availability route test — mock the new trip-windows data source
- **Updated:** notification-targets test — mock the new trip-windows data source
- **Updated:** config dialog regression test — tripWindows no longer part of globalSettings
- **Updated:** default-config test — remove the tripWindows strip assertion
- **Unchanged:** trip-windows.ts utility tests, notifier tests, trips-card component tests, timeline tests
