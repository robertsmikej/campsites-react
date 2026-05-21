# Config Sync to Notifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync campground configuration from the React UI to the GitHub Action email notifier via Cloudflare KV, so UI setting changes (dates, favorites, etc.) are reflected in email notifications.

**Architecture:** The existing Cloudflare Worker gets two new endpoints (`GET /api/config` and `PUT /api/config`) backed by the existing KV namespace. The React app writes config to KV on save; the notifier fetches config from KV at runtime, falling back to the committed file.

**Tech Stack:** Cloudflare Workers, Workers KV, React 19, MUI 7, Node.js (notifier)

**Spec:** `docs/superpowers/specs/2026-03-21-config-sync-to-notifier-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `workers-site/index.js` | Modify | Add `GET /api/config`, `PUT /api/config` endpoints; update CORS |
| `src/components/SiteConfigDialog.jsx` | Modify | Preserve `notifyAll` flag through sanitization |
| `src/App.js` | Modify | Add API sync on save/reset; fix date-overwrite on load; add Snackbar |
| `notifier/check.mjs` | Modify | Fetch config from API instead of reading file; use fetched global settings |
| `.github/workflows/deploy.yml` | Modify | Pass `REACT_APP_CONFIG_KEY` env var at build time |

---

### Task 1: Cloudflare Worker — CORS and config endpoints

**Files:**
- Modify: `workers-site/index.js`

- [ ] **Step 1: Update CORS helper to allow PUT**

In `workers-site/index.js`, change line 16 from:

```js
response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
```

to:

```js
response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
```

- [ ] **Step 2: Add `handleGetConfig` handler**

Add after the `handleListSubscribers` function (after line 124):

```js
// GET /api/config — protected, returns campground config for the notifier
const handleGetConfig = async (request, env) => {
    const auth = request.headers.get('Authorization');
    if (!auth || auth !== `Bearer ${env.API_SECRET}`) {
        return json({ error: 'Unauthorized' }, 401);
    }

    const data = await env.SUBSCRIBERS.get('config:campgrounds', 'json');
    if (!data) {
        return json({ error: 'No config found' }, 404);
    }

    return json(data);
};
```

- [ ] **Step 3: Add `handlePutConfig` handler**

Add after `handleGetConfig`:

```js
// PUT /api/config — saves campground config from the UI
const handlePutConfig = async (request, env) => {
    const auth = request.headers.get('Authorization');
    if (!auth || auth !== `Bearer ${env.CONFIG_KEY}`) {
        return json({ error: 'Unauthorized' }, 401);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid JSON' }, 400);
    }

    if (!body || typeof body !== 'object' || !body.campgrounds) {
        return json({ error: 'Request body must include campgrounds' }, 400);
    }

    await env.SUBSCRIBERS.put('config:campgrounds', JSON.stringify(body));

    return json({ message: 'Config saved' });
};
```

- [ ] **Step 4: Add routes in the fetch handler**

In the `fetch` handler, add these two route checks after the `/api/subscribers` route (after line 146):

```js
if (url.pathname === '/api/config' && request.method === 'GET') {
    return cors(await handleGetConfig(request, env));
}
if (url.pathname === '/api/config' && request.method === 'PUT') {
    return cors(await handlePutConfig(request, env));
}
```

- [ ] **Step 5: Commit**

```bash
git add workers-site/index.js
git commit -m "Add GET/PUT /api/config endpoints to Cloudflare Worker

Stores and retrieves campground configuration from KV so the
GitHub Action notifier can read UI-saved settings at runtime."
```

---

### Task 2: Preserve `notifyAll` in SiteConfigDialog

**Files:**
- Modify: `src/components/SiteConfigDialog.jsx:108-136`

- [ ] **Step 1: Add `notifyAll` to `sanitizeCampground` return object**

In `src/components/SiteConfigDialog.jsx`, in the `sanitizeCampground` function, add this line after line 134 (after the `stayLengths` conditional spread):

```js
...(campground.notifyAll != null ? { notifyAll: campground.notifyAll } : {}),
```

The return block (lines 112-135) should end with:

```js
        ...(campground.validStartDays ? { validStartDays: campground.validStartDays } : {}),
        ...(campground.stayLengths ? { stayLengths: campground.stayLengths } : {}),
        ...(campground.notifyAll != null ? { notifyAll: campground.notifyAll } : {}),
    };
```

Note: Uses `!= null` (not truthiness) because `notifyAll` is a boolean — a truthiness check would incorrectly strip `notifyAll: false`.

- [ ] **Step 2: Commit**

```bash
git add src/components/SiteConfigDialog.jsx
git commit -m "Preserve notifyAll flag through campground sanitization

Without this, saving config to KV would strip notifyAll: true from
campgrounds like Outlet, silently disabling non-favorite notifications."
```

---

### Task 3: React App — config sync and UI fixes

**Files:**
- Modify: `src/App.js:1-286`

- [ ] **Step 1: Add imports for Snackbar and Alert**

Add to the existing MUI imports section (after line 20, after the Typography import):

```js
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
```

- [ ] **Step 2: Add the `syncConfigToApi` utility function**

Add after the `cloneSitesConfig` function (after line 57):

```js
const syncConfigToApi = async (campgroundConfig, globalSettings) => {
    const apiUrl = process.env.REACT_APP_API_URL || '';
    const configKey = process.env.REACT_APP_CONFIG_KEY || '';
    if (!apiUrl || !configKey) {
        console.warn('[Config Sync] Missing REACT_APP_API_URL or REACT_APP_CONFIG_KEY — skipping sync');
        return { ok: false, skipped: true };
    }
    try {
        const response = await fetch(`${apiUrl}/api/config`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${configKey}`,
            },
            body: JSON.stringify({
                campgrounds: campgroundConfig,
                globalSettings: globalSettings || {},
            }),
        });
        if (!response.ok) {
            const text = await response.text();
            console.error(`[Config Sync] API returned ${response.status}: ${text}`);
            return { ok: false };
        }
        console.log('[Config Sync] Synced to notification API');
        return { ok: true };
    } catch (error) {
        console.error('[Config Sync] Failed:', error.message);
        return { ok: false };
    }
};
```

- [ ] **Step 3: Add Snackbar state**

Add after the `colorMode` state declaration (after line 97):

```js
const [syncError, setSyncError] = useState(false);
```

- [ ] **Step 4: Update `handleSaveSitesConfig` to sync to API**

Replace the `handleSaveSitesConfig` function (lines 257-276) with:

```js
const handleSaveSitesConfig = (newConfig, newGlobalSettings) => {
    // Clear cache so new settings take effect immediately
    clearCampgroundCache();
    const cloned = cloneSitesConfig(newConfig);
    setSiteConfig(cloned);
    try {
        localStorage.setItem(USER_SITES_STORAGE_KEY, JSON.stringify(cloned));
    } catch (error) {
        console.error('Failed to store custom site configuration', error);
    }
    if (newGlobalSettings) {
        setGlobalSettings(newGlobalSettings);
        try {
            localStorage.setItem(USER_GLOBAL_SETTINGS_KEY, JSON.stringify(newGlobalSettings));
        } catch (error) {
            console.error('Failed to store global settings', error);
        }
    }
    setIsConfigDialogOpen(false);

    // Fire-and-forget sync to notification API
    syncConfigToApi(cloned, newGlobalSettings || globalSettings).then(({ ok, skipped }) => {
        if (!ok && !skipped) {
            setSyncError(true);
        }
    });
};
```

- [ ] **Step 5: Update `handleResetSitesConfig` to sync defaults to API**

Replace the `handleResetSitesConfig` function (lines 278-286) with:

```js
const handleResetSitesConfig = () => {
    // Clear cache so default settings take effect immediately
    clearCampgroundCache();
    localStorage.removeItem(USER_SITES_STORAGE_KEY);
    localStorage.removeItem(USER_GLOBAL_SETTINGS_KEY);
    const defaults = cloneSitesConfig(defaultSites);
    const defaultGlobal = getInitialGlobalSettings();
    setSiteConfig(defaults);
    setGlobalSettings(defaultGlobal);
    setIsConfigDialogOpen(false);

    // Sync defaults to notification API so notifier picks up the reset
    syncConfigToApi(defaults, defaultGlobal).then(({ ok, skipped }) => {
        if (!ok && !skipped) {
            setSyncError(true);
        }
    });
};
```

- [ ] **Step 6: Fix load behavior — stop overwriting user dates**

In the `useEffect` that loads from localStorage (lines 137-166), change the merge logic. Replace lines 146-157:

```js
parsed[system] = parsed[system].map(storedCampground => {
    const defaultCampground = defaultSites[system].find(d => d.id === storedCampground.id);
    if (defaultCampground) {
        // Use dates from defaults (code), preserve user's other settings
        return {
            ...storedCampground,
            dates: defaultCampground.dates,
        };
    }
    return storedCampground;
});
```

With:

```js
parsed[system] = parsed[system].map(storedCampground => {
    // Merge any new default fields for known campgrounds,
    // but preserve all user-saved settings (including dates)
    const defaultCampground = defaultSites[system].find(d => d.id === storedCampground.id);
    if (defaultCampground) {
        return storedCampground;
    }
    return storedCampground;
});
```

Note: The `if (defaultCampground)` block now just returns `storedCampground` unchanged. The map is effectively a no-op, but the structure is retained for merging new default fields in the future (e.g., if a new property is added to siteConfigurations.js that existing localStorage data lacks).

- [ ] **Step 7: Add Snackbar JSX**

Add the Snackbar inside the outermost `<ThemeProvider>` in the return JSX, just before the closing `</ThemeProvider>` tag:

```jsx
<Snackbar
    open={syncError}
    autoHideDuration={6000}
    onClose={() => setSyncError(false)}
    anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
>
    <Alert severity="warning" onClose={() => setSyncError(false)} variant="filled">
        Settings saved locally but failed to sync to notifications
    </Alert>
</Snackbar>
```

- [ ] **Step 8: Verify the app builds**

Run: `cd campsites-react && npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 9: Commit**

```bash
git add src/App.js
git commit -m "Sync config to notification API on save and reset

Adds fire-and-forget PUT to /api/config when settings are saved.
Shows warning snackbar if sync fails. Stops overwriting user-saved
dates with hardcoded defaults on page load."
```

---

### Task 4: Notifier — fetch config from API

**Files:**
- Modify: `notifier/check.mjs:17-31`

- [ ] **Step 1: Add `fetchConfig` function**

Add after the `loadDataFile` function (after line 22):

```js
// Fetch campground config from the Cloudflare Worker API (KV-backed).
// Falls back to the committed siteConfigurations.js if the API is unavailable.
const fetchConfig = async (apiUrl, apiSecret) => {
    try {
        const response = await fetch(`${apiUrl}/api/config`, {
            headers: { Authorization: `Bearer ${apiSecret}` },
        });
        if (!response.ok) {
            if (response.status === 404) {
                console.log('[Config] No config in KV yet — using defaults from siteConfigurations.js');
            } else {
                console.warn(`[Config] API returned ${response.status} — using fallback`);
            }
            return null;
        }
        const data = await response.json();
        console.log('[Config] Loaded config from API');
        return data;
    } catch (error) {
        console.warn(`[WARNING] Failed to fetch config from API — using stale fallback from siteConfigurations.js: ${error.message}`);
        return null;
    }
};
```

- [ ] **Step 2: Replace static config loading with API fetch**

Replace lines 24-31 (the static `siteConfigurations` and `settings` declarations):

```js
const campgroundCatalog = loadDataFile('../src/json/campgroundCatalog.js', 'campgroundCatalog');
const siteConfigurations = loadDataFile('../src/json/siteConfigurations.js', 'defaultCampgroundConfigurations');

// --- Settings (matching the React app's settingsOverrides in App.js) ---
const settings = {
    stayLengths: [2, 3, 4, 5],
    validStartDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
};
```

With:

```js
const campgroundCatalog = loadDataFile('../src/json/campgroundCatalog.js', 'campgroundCatalog');

// Load config from API, fall back to committed file
const fallbackSiteConfigurations = loadDataFile('../src/json/siteConfigurations.js', 'defaultCampgroundConfigurations');

const defaultSettings = {
    stayLengths: [2, 3, 4, 5],
    validStartDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
};
```

- [ ] **Step 3: Update `main()` to use fetched config**

At the top of the `main` function, after the `siteUrl` declaration (after line 130), add the config fetch and assignment:

```js
// Fetch live config from API (KV-backed), fall back to committed file
const apiConfig = await fetchConfig(subscriberApiUrl, subscriberApiSecret);
const siteConfigurations = apiConfig?.campgrounds || fallbackSiteConfigurations;
const settings = apiConfig?.globalSettings
    ? { ...defaultSettings, ...apiConfig.globalSettings }
    : defaultSettings;
```

Note: `siteConfigurations` is now declared inside `main()` as a `const`. It is used in two places downstream — `buildCampgroundList()` (line 38) and the `notifyAll` filtering (line 185). Since `buildCampgroundList` references `siteConfigurations` from its outer scope, it needs to be updated to accept it as a parameter.

- [ ] **Step 4: Update `buildCampgroundList` to accept `siteConfigurations` as a parameter**

Change the function signature from:

```js
const buildCampgroundList = () => {
```

to:

```js
const buildCampgroundList = (siteConfigurations) => {
```

And update the call site in `main()` from:

```js
const campgrounds = buildCampgroundList();
```

to:

```js
const campgrounds = buildCampgroundList(siteConfigurations);
```

- [ ] **Step 5: Update `notifyAll` filtering to use the local `siteConfigurations`**

No code change needed — line 185 (`const allConfigs = Object.values(siteConfigurations).flat()`) already references `siteConfigurations` by name, which will resolve to the `const` declared in `main()` since it's in the same scope.

Verify this by confirming the line is inside `main()` and the `const siteConfigurations` declaration is above it in the same function.

- [ ] **Step 6: Commit**

```bash
git add notifier/check.mjs
git commit -m "Fetch campground config from API instead of committed file

The notifier now reads config from the Cloudflare Worker's KV-backed
/api/config endpoint. Falls back to siteConfigurations.js if the API
is unavailable. Also picks up globalSettings (stayLengths, validStartDays)."
```

---

### Task 5: Deploy workflow — pass config key at build time

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Add env vars to the React build step**

Change the build step (lines 21-22) from:

```yaml
- name: Build React app
  run: npm run build
```

to:

```yaml
- name: Build React app
  run: npm run build
  env:
    REACT_APP_API_URL: ${{ secrets.SITE_URL }}
    REACT_APP_CONFIG_KEY: ${{ secrets.CONFIG_KEY }}
```

Note: `SITE_URL` is already configured as a secret (used by the notifier). `CONFIG_KEY` is a new secret that must be added to the GitHub repo settings (Task 6, Step 2) **before** this workflow runs, otherwise the sync will silently skip.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "Pass config sync env vars to React build

REACT_APP_API_URL uses the existing SITE_URL secret.
REACT_APP_CONFIG_KEY is a new secret for authenticating
config writes from the UI."
```

---

### Task 6: Manual setup and verification

These steps require manual action in external dashboards — they cannot be automated via code.

- [ ] **Step 1: Add `CONFIG_KEY` secret to Cloudflare Worker**

In the Cloudflare dashboard:
1. Go to Workers & Pages → `campsites-finder`
2. Settings → Variables and Secrets
3. Add a new secret: `CONFIG_KEY` = (generate a random string, e.g., `openssl rand -hex 32`)

- [ ] **Step 2: Add `CONFIG_KEY` secret to GitHub repo**

In the GitHub repo settings:
1. Go to Settings → Secrets and variables → Actions
2. Add a new repository secret: `CONFIG_KEY` = (same value as Step 1)

- [ ] **Step 3: Deploy and verify the Worker endpoints**

Push to main to trigger the deploy workflow. After deploy completes:

Test GET (should return 404 since KV is empty):
```bash
curl -H "Authorization: Bearer <API_SECRET>" https://<site-url>/api/config
```
Expected: `{"error":"No config found"}` with status 404

Test PUT:
```bash
curl -X PUT \
  -H "Authorization: Bearer <CONFIG_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"campgrounds":{"recreation.gov":[]},"globalSettings":{}}' \
  https://<site-url>/api/config
```
Expected: `{"message":"Config saved"}`

Test GET again (should now return saved data):
```bash
curl -H "Authorization: Bearer <API_SECRET>" https://<site-url>/api/config
```
Expected: The JSON you just PUT.

- [ ] **Step 4: Verify end-to-end**

1. Open the app in a browser
2. Open browser DevTools → Console
3. Go to Configure Sites, change a date range on any campground
4. Click Save
5. Verify console shows `[Config Sync] Synced to notification API`
6. Verify no warning snackbar appears
7. Wait for the next GitHub Action run (or trigger manually) and check the logs show `[Config] Loaded config from API`
