# Unify the default list and the curator watchlist

**Date:** 2026-06-04
**Status:** Design — awaiting review

## Problem

CampWatch shows two different campground lists from two different KV keys, kept
loosely in sync by a one-directional write-through. They have drifted.

| Surface | Path | KV key |
|---|---|---|
| Anonymous homepage / `/discover` / postcard | `GET /api/default` | `config:campgrounds` |
| Logged-in curator dashboard (`/app`) | `GET /api/users/me/campgrounds` via `useUserCampgrounds` | `user:{email}:campgrounds` |
| Admin "Edit default list" dialog (`/app/admin`) | `GET`/`PUT /api/default` | `config:campgrounds` |

Drift sources:
- The dashboard's curator save write-through (`users/me/campgrounds/route.ts:70-76`)
  copies into `config:campgrounds`, but nothing flows the other way.
- The admin "Edit default list" dialog edits `config:campgrounds` directly,
  bypassing the dashboard record.
- `POST /api/admin/migrate` seeds `config:campgrounds` from the in-repo catalog
  but never touches the curator's record.

## Goal

One source of truth. The default list (what anonymous visitors see, what new
users clone) **is** the primary curator's watchlist, read live. Editing the
dashboard changes the default by definition. No copy, no write-through, no drift.

Multi-user capability stays intact: non-curator users keep their own
`user:{email}:campgrounds` records. Only "curator list == default" is unified.

## Approach (chosen: A)

The primary curator's `user:{email}:campgrounds` record becomes the canonical
default. `config:campgrounds` is retired.

### New resolver — `lib/default-config.ts`

```ts
// Returns the email of the curator whose watchlist is the public default.
// Fast path: BOOTSTRAP_ADMIN_EMAIL (the env that anoints the first curator),
// if that user actually holds the curator role.
// Fallback: first email from listCurators() (KV scan; only on the cold path).
// Null if there is no curator yet.
resolveDefaultOwnerEmail(): Promise<string | null>

// The single "what is the default list" function. All default readers call this.
//   1. owner = resolveDefaultOwnerEmail()
//   2. if owner has a record -> return { campgrounds, globalSettings }
//   3. else -> buildDefaultFromCatalog()  (fresh-install / dev fallback)
getDefaultConfig(): Promise<{ campgrounds: SiteConfig; globalSettings: GlobalSettings }>
```

Return shape is identical to today's `GET /api/default` body, so no consumer of
that endpoint changes.

### Readers repointed to `getDefaultConfig()`

- `GET /api/default` (`api/default/route.ts`) — still serves homepage, `/discover`,
  the watchlist postcard, and the hook's `fetchDefault`. Source swaps from the KV
  key to `getDefaultConfig()`.
- Anonymous branch of `GET /api/availability` (`api/availability/route.ts`).
- `GET /api/users/me/campgrounds/items` (`items/route.ts:38`) — default lookup.
- `POST /api/users/me/campgrounds/clone-default` (`clone-default/route.ts:14`).
- New-user clone in `POST /api/admin/users` (`admin/users/route.ts:93-101`).

### Writers removed

- The curator write-through in `PUT /api/users/me/campgrounds`
  (`route.ts:68-77`) — redundant; the curator record is already the default.
- `PUT /api/default` (`api/default/route.ts:23-45`) — deleted. (`GET` stays.)
- The admin "Edit default list" dialog in `/app/admin/page.tsx`
  (`openDefaultDialog`, `saveDefault`, the dialog UI, related state) — deleted.
  The dashboard is now the only editor.

### One-time reconcile (chosen: merge both)

`POST /api/admin/migrate` becomes a one-shot, idempotent reconcile:

1. Read `config:campgrounds` and the curator's `user:{curator}:campgrounds`.
2. Merge campgrounds by `id` (union). On conflict, the **dashboard record's**
   per-campground entry wins; campgrounds present in only one side are kept.
   `globalSettings` taken from the dashboard record when present, else config.
3. Write the merged record to `user:{curator}:campgrounds`.
4. Delete `config:campgrounds`.

Idempotent: once the key is deleted, a re-run finds nothing to merge and is a
no-op. If neither source exists (fresh dev), seed the curator record from
`buildDefaultFromCatalog()`.

Note on the union: it may re-introduce a campground that was deliberately
removed from one side but still present on the other. Accepted per decision —
the merged result is reviewable on the dashboard and trimmable there afterward.

## Data flow after the change

```
Anonymous homepage / discover / postcard ─┐
Anonymous /api/availability               ─┤
clone-default / new-user clone / items    ─┼─> getDefaultConfig() ─> user:{curator}:campgrounds
GET /api/default                          ─┘                                  ▲
                                                                              │ edits
Curator dashboard /app ── PUT /api/users/me/campgrounds ───────────────────────┘
                                                          (no write-through, no second key)
```

`user:{curator}:campgrounds` is the only store. The curator edits it via the
dashboard; everyone reading "the default" reads the same record.

## Components & boundaries

- `lib/default-config.ts` — owns "who is the default owner" and "what is the
  default list." Single dependency surface: `lib/users` (`listCurators`), env
  (`BOOTSTRAP_ADMIN_EMAIL`), `lib/user-campgrounds` (`getUserCampgrounds`),
  `data/build-default` (fallback). Every default reader depends on this and
  nothing lower.
- `api/default/route.ts` — thin: `GET` delegates to `getDefaultConfig()`; `PUT`
  gone.
- `api/admin/migrate/route.ts` — one-shot reconcile described above.

## Error handling

- No curator / no record / KV miss → `getDefaultConfig()` falls back to the
  in-repo catalog (matches today's dev fallback). Anonymous surfaces always have
  something to render.
- `resolveDefaultOwnerEmail()` env fast-path avoids a KV scan on the hot
  anonymous path; the `listCurators()` scan only runs when the env is unset or
  stale.

## Testing

- `lib/default-config.test.ts` (new): env fast-path resolution; `listCurators`
  fallback; record-present path; catalog fallback when no curator/record.
- Update `api/default/route.test.ts`: `GET` now reflects the curator record;
  drop `PUT` tests.
- Update `api/admin/migrate/route.test.ts`: assert merge-by-id semantics
  (dashboard wins on conflict), `config:campgrounds` deleted afterward, re-run
  no-op, catalog seed on empty.
- Update `availability`, `clone-default`, `items`, `admin/users` tests to seed
  the curator record instead of `config:campgrounds`.
- Update `users/me/campgrounds/route.test.ts`: remove write-through assertions.

## Out of scope (YAGNI)

- A separately-curated "recommended default" distinct from the curator's own
  watchlist. If wanted later, reintroduce a dedicated record + editor; the
  resolver is the single seam to change.
- Multi-curator tie-breaking beyond "BOOTSTRAP_ADMIN_EMAIL, else first curator."
