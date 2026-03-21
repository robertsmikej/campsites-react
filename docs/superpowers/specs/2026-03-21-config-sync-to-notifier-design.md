# Design: Sync UI Config to Email Notifier via Cloudflare KV

**Date:** 2026-03-21
**Status:** Approved

## Problem

When campground settings (dates, favorites, etc.) are changed in the React UI, those changes are saved to `localStorage` only. The GitHub Action email notifier reads configuration from the committed `siteConfigurations.js` file, so UI changes never propagate to the notification logic. Additionally, `App.js` overwrites user-saved dates with hardcoded defaults on every page load.

## Solution

Store campground configuration in Cloudflare KV (via the existing Worker) so both the UI and the notifier share a single source of truth. The UI writes config to KV on save; the notifier fetches config from KV at runtime.

## Architecture

```
React UI (save settings)
    |
    +---> localStorage (fast local cache, unchanged)
    +---> PUT /api/config --> Cloudflare KV (config:campgrounds)
                                    ^
                                    |
GitHub Action (every 15 min) --> GET /api/config --> uses config for availability checks
                                    |
                              (fallback: read siteConfigurations.js if API unavailable)
```

## Components

### 1. Cloudflare Worker — new endpoints

**File:** `workers-site/index.js`

Two new endpoints added to the existing Worker:

#### `GET /api/config`
- **Auth:** Bearer token (`API_SECRET`), same pattern as `/api/subscribers`
- **Consumer:** GitHub Action notifier
- **Returns:** JSON object with two keys:
  - `campgrounds` — the full campground configuration (same shape as `defaultCampgroundConfigurations` in `siteConfigurations.js`)
  - `globalSettings` — object with `stayLengths` and `validStartDays`
- **If no config in KV:** returns `404` (notifier falls back to committed file)

#### `PUT /api/config`
- **Auth:** Bearer token with a separate `CONFIG_KEY` secret (see Auth section below)
- **Consumer:** React app on settings save
- **Accepts:** JSON body with `campgrounds` and `globalSettings` keys
- **Validates:** body is valid JSON and is a non-empty object
- **Stores:** KV key `config:campgrounds`

#### CORS update
The existing `cors()` helper (line 14) only allows `GET, POST, OPTIONS` methods and `Content-Type, Authorization` headers. Must be updated:
- Add `PUT` to `Access-Control-Allow-Methods`
- No new headers needed since PUT uses `Authorization` (Bearer token), same as GET

#### KV storage
- Reuses the existing `SUBSCRIBERS` KV namespace
- Key: `config:campgrounds` — stores the full config JSON (campgrounds + global settings)
- Future per-user support: `config:user:{email}` keys

#### New environment variable
- `CONFIG_KEY` — added to the Worker's env vars via Cloudflare dashboard (as a secret). Used to authenticate UI config writes via Bearer token.

### 2. React UI changes

**File:** `src/App.js`

#### Save handler (`handleSaveSitesConfig`, line 257)
After writing to localStorage (existing behavior), also fire an async `PUT /api/config` call:
- Fire-and-forget — localStorage remains the fast path for UI responsiveness
- Sends both the campground config and global settings (stayLengths, validStartDays) as a single payload: `{ campgrounds: newConfig, globalSettings: newGlobalSettings }`
- On failure: show a warning snackbar ("Settings saved locally but failed to sync to notifications")
- The API URL comes from a `REACT_APP_API_URL` environment variable (the Worker's URL)
- The config key comes from a `REACT_APP_CONFIG_KEY` environment variable, sent as `Authorization: Bearer <key>`

#### Reset handler (`handleResetSitesConfig`, line 278)
When user resets to defaults, also fire a `PUT /api/config` with the default config (from `siteConfigurations.js`) so the notifier picks up the reset. Without this, the notifier would continue using stale KV data after a UI reset.

#### Load behavior (lines 137-166)
- Remove the `dates: defaultCampground.dates` override at line 152 that overwrites user-saved dates with hardcoded defaults. The surrounding merge logic (finding matching defaults, spreading stored config) should remain — it's useful for inheriting new fields from defaults for existing campgrounds.
- localStorage remains the source of truth for the UI on load
- `siteConfigurations.js` defaults are only used when there is no localStorage data (fresh user)

#### Error feedback
- Add a Snackbar/toast component for showing sync failure status
- Only shown when the API call fails — success is silent

**File:** `src/components/SiteConfigDialog.jsx`

#### Preserve `notifyAll` in `sanitizeCampground` (line 108)
The `sanitizeCampground` function strips `notifyAll` from the campground config during save. This flag controls whether the notifier sends emails for all matching sites (not just favorites) at that campground. It must be preserved in the sanitized output, otherwise saving config to KV would silently disable non-favorite notifications for campgrounds like Outlet Campground that have `notifyAll: true`.

Add to the return object in `sanitizeCampground`:
```js
...(campground.notifyAll != null ? { notifyAll: campground.notifyAll } : {}),
```

### 3. Notifier changes

**File:** `notifier/check.mjs`

#### Config loading (lines 24-25)
Replace:
```js
const siteConfigurations = loadDataFile('../src/json/siteConfigurations.js', 'defaultCampgroundConfigurations');
```

With a `fetchConfig` function that:
1. Calls `GET ${SUBSCRIBER_API_URL}/api/config` with Bearer token auth (`SUBSCRIBER_API_SECRET`)
2. On success: uses `response.campgrounds` as the campground configuration, and `response.globalSettings` to override the hardcoded `settings` object (lines 28-31)
3. On failure: logs a **prominent warning** (e.g., `[WARNING] Failed to fetch config from API — using stale fallback from siteConfigurations.js`) and falls back to `loadDataFile(...)` (existing behavior). The fallback file may be arbitrarily out of date since the whole point of this change is to stop requiring code commits for config changes.

**Important:** `siteConfigurations` is referenced in **two places** — line 25 (for `buildCampgroundList`) and line 185 (for `notifyAll` filtering via `Object.values(siteConfigurations).flat()`). Both must use the fetched config. The simplest approach: assign the fetched data to the same `siteConfigurations` variable so both downstream usages are covered.

No new secrets needed — reuses `SUBSCRIBER_API_URL` and `SUBSCRIBER_API_SECRET` already available in the GitHub Action environment.

#### No other notifier changes
- `fetch-availability.mjs` — reads `campground.dates` from whatever config it receives (no change)
- `diff.mjs` — downstream, no change
- `email.mjs` — downstream, no change

### 4. GitHub Action

**File:** `.github/workflows/check-campsites.yml`

No changes needed. Existing secrets and env vars are sufficient.

## What stays the same

- **`siteConfigurations.js`** — remains as the seed/defaults and fallback. Not deleted.
- **`campgroundCatalog.js`** — untouched. Catalog data (names, IDs, areas) stays in code.
- **Subscriber endpoints** — untouched.
- **localStorage** — still the fast local cache for the UI.

## Auth considerations

Two separate secrets are used intentionally:

- **`API_SECRET`** — used by the GitHub Action for both `/api/subscribers` (returns email addresses) and `/api/config` (returns campground settings). This key grants access to subscriber PII and should not be exposed in client-side code.
- **`CONFIG_KEY`** — used only by the React app for `PUT /api/config`. Baked into the build via `REACT_APP_CONFIG_KEY` and visible in client JS. This is acceptable because: (1) it only grants write access to campground date/site preferences, not subscriber data, and (2) the data is not sensitive. When per-user support is added later, this should be replaced with proper user authentication.

## KV data shape

The KV value stored at `config:campgrounds` is a JSON object:

```json
{
  "campgrounds": {
    "recreation.gov": [
      {
        "name": "Outlet Campground",
        "area": "...",
        "id": "232358",
        "dates": { "startDate": "2026-06-01", "endDate": "2026-10-01" },
        "sites": { "favorites": ["013", "015"], "worthwhile": ["016"] },
        "showOrHide": { "Favorites": true, "Worthwhile": true, "All Others": true },
        "notifyAll": true,
        "validStartDays": null,
        "stayLengths": null
      }
    ]
  },
  "globalSettings": {
    "stayLengths": [2, 3, 4, 5],
    "validStartDays": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
  }
}
```

The `campgrounds` object has the same shape as `defaultCampgroundConfigurations` in `siteConfigurations.js`, with the addition of catalog fields (`area`, `site`, `type`, `description`, `image`) that come from the UI's merged data. The notifier's `buildCampgroundList` function handles this gracefully — it iterates catalog entries and spreads matching config on top, so extra fields are harmless.

## Future: per-user config

The design supports per-user configuration by:
1. Storing per-user overrides at `config:user:{email}` in KV
2. The notifier iterating subscribers and merging each user's overrides with the global config
3. Sending personalized notifications based on each user's date preferences

This is out of scope for the current implementation but the KV key structure and API patterns are designed to accommodate it.

## Change summary

| Layer | What changes |
|---|---|
| Cloudflare Worker | Add `GET /api/config` and `PUT /api/config`; update CORS to allow `PUT`; add `CONFIG_KEY` env var |
| KV | One new key: `config:campgrounds` (stores campground config + global settings) |
| React App (`App.js`) | Save handler also PUTs to API; reset handler syncs to API; remove date-overwrite on load; add error snackbar |
| React App (`SiteConfigDialog.jsx`) | Preserve `notifyAll` flag in `sanitizeCampground` |
| Notifier (`check.mjs`) | Fetch config + global settings from API instead of reading JS file; fall back to file with prominent warning; both `siteConfigurations` references use fetched data |
| GitHub Action | No changes |
