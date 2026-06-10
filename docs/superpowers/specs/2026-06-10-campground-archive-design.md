# Previously-Watched Campground Archive

**Date:** 2026-06-10
**Status:** Approved

## Problem

Removing a campground from the watchlist destroys its config — starred favorites, worthwhile sites, notify scope, stay lengths. With per-campground check tiers making request budget a real constraint, users will prune aggressively at season end and want one-click re-adds next season without rebuilding any of that by hand.

## Decision summary

- **Server-side auto-archive on save (approach A).** The PUT save handler diffs the prior record against the incoming one; campgrounds that disappeared are upserted into a per-user archive. Catches every removal path with zero UI cooperation. (Rejected: client-side archive writes — misses paths; soft-delete flag in the active record — every consumer would need to filter it.)
- **Re-add restores the full prior config** (sites, notifyScope, stayLengths, validStartDays, type, description, image) with **fresh season-capped dates** (`defaultDates()`) and **check tier reset to Normal** (a stale High must not silently eat the 3-slot cap).
- **Picker lives in the Add Campground modal** (dashboard add-campground-dialog → CampgroundLookup dashboard variant) as a "Previously watched" section. Not in the site-config dialog.

## Storage

New KV key per user: `user:{email}:campground-archive`

```ts
interface ArchivedCampground extends Campground {
    removedAt: string; // ISO
}
interface CampgroundArchive {
    campgrounds: ArchivedCampground[];
}
```

- Upsert by campground `id`; a newer removal replaces the older entry (latest config wins).
- Capped at the 50 most recent (by `removedAt`); oldest dropped beyond the cap.
- Entries are never deleted on re-add — the UI filters out IDs currently on the watchlist instead, so history persists across seasons.

## Write path

In `PUT /api/users/me/campgrounds` (`putHandler`), after validation passes:

1. Load the prior record (`getUserCampgrounds`).
2. `removed = prior ids − incoming ids` (recreation.gov list).
3. If non-empty: read the archive, upsert each removed campground's full prior object + `removedAt = now`, enforce the 50-cap, write back.
4. **Best-effort:** any archive read/write failure is logged and swallowed — it must never fail the user's actual save.

The `items` route only adds campgrounds; removal flows exclusively through the full PUT, so this is the single choke point.

## Read path

New route `GET /api/users/me/campgrounds/archive`:

- Session-authed (401 unauthenticated), same pattern as the campgrounds GET.
- Returns `{ campgrounds: ArchivedCampground[] }` sorted by `removedAt` descending; empty list when no archive exists.

## Modal UI (CampgroundLookup, dashboard variant only)

A "Previously watched" section rendered below the lookup input (above the result area), only when the archive has entries not currently on the watchlist:

- Each row: name, ID, removed date (human-readable), and a **Re-add** button.
- Re-add builds the new entry from the archived config: keep `sites`, `notifyScope`/`notifyAll`, `stayLengths`, `validStartDays`, `type`, `description`, `image`, `area`; set `dates = defaultDates()`; drop `checkPriority` (Normal); `enabled: true`. Save through the existing `userCampgrounds.save` flow (same as the lookup's add button, including error-toast behavior).
- After a successful re-add the row disappears (its ID is now on the watchlist).
- Archive fetch failure or empty archive: the section simply doesn't render. Homepage variant never shows the section.

## Error handling

- Archive write failures: logged server-side, save succeeds regardless.
- Archive GET failures: modal hides the section (no error states to design).
- Re-add save failures: existing `syncError` toast path already surfaces API messages (e.g. high-cap 400s can't happen — tier resets to Normal — but body-shape rejections would surface).

## Testing

- **Route (PUT):** removing a campground archives its full config with `removedAt`; modifying without removal archives nothing; the upsert replaces an older entry for the same ID; cap enforced at 50; archive failure doesn't fail the save (mock adapter throw).
- **Route (GET archive):** 401 unauthenticated; empty shape for fresh user; sorted entries for existing archive.
- **Component (CampgroundLookup dashboard):** section renders archived entries excluding active IDs; Re-add calls save with restored favorites + `defaultDates()` dates + no `checkPriority`; homepage variant never renders the section.

## Out of scope

- Archiving from the site-config dialog UI (covered automatically via the PUT diff, but no picker UI there).
- Editing/deleting archive entries.
- Cross-user / curator-shared archives.
