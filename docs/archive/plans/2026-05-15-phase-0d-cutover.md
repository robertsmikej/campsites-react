# Phase 0d: Production Cutover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `campwatch` Worker the production-serving stack. After this phase: the notifier reads from the new Worker's API, new emails link to the new app, the old `campsites-finder` Worker becomes a thin redirect shim (preserving existing unsubscribe links and bookmarks), and the legacy CRA tree is parked under `legacy/` so the repo root reflects the live system.

**Architecture:**

```
  Before cutover                               After cutover
  --------------                               -------------
  Old: campsites-finder.* — CRA SPA + API      Old: campsites-finder.* — 307 redirect shim
       Notifier hits this                           (preserves /api/unsubscribe etc.)
  New: campwatch.* — Next.js + API + /app      New: campwatch.* — Next.js + API + /app
       Has the same data via shared KV              Notifier hits this; new emails link here

  Repo structure:                              Repo structure:
    src/ (CRA)                                   legacy/cra/ (moved)
    public/ (CRA)                                legacy/cra-public/ (moved)
    workers-site/ (full SPA worker)              workers-site/index.js (redirect-only)
    next/ (new app)                              next/ (unchanged)
    notifier/ (Node, GH Actions)                 notifier/ (URL switch via GH secret)
```

**Tech Stack:** No new technology. The cutover is configuration + a 30-line redirect Worker + a tree relocation + secret updates.

**Reference reading:**
- `workers-site/index.js` — the existing Worker. After this phase it becomes a 30-line redirect.
- `notifier/check.mjs:170-200` — confirms the notifier reads `SUBSCRIBER_API_URL`, `SUBSCRIBER_API_SECRET`, `SITE_URL` from env. These are GitHub Secrets that the user needs to update once (Task C2).

**Critical: this phase mutates production state.** Specifically:
- It deploys a redirect Worker over the existing `campsites-finder` Worker. From the moment the deploy lands, anyone hitting the old URL gets sent to the new app. The old SPA stops serving.
- It assumes the user has updated three GitHub Secrets (`SUBSCRIBER_API_URL`, `SITE_URL`, and the new app's `CONFIG_KEY` if it diverges) BEFORE the first scheduled notifier run after the deploy.

For safety, this plan stages the work so we can verify the redirect Worker and the notifier point-at-new behavior in isolation BEFORE merging.

---

## Pre-flight

### Task 0: Branch + state check

- [ ] **Step 1: Branch off main**

```bash
cd "/Users/mikeroberts/Library/Mobile Documents/com~apple~CloudDocs/Desktop/Websites/campsites-react"
git checkout main && git pull --ff-only
git checkout -b feature/phase-0d-cutover
git status -s   # expect clean
```

- [ ] **Step 2: Confirm both Workers are currently healthy**

```bash
curl -sI https://campsites-finder.mikeroberts421.workers.dev/         | head -1
curl -sI https://campsites-finder.mikeroberts421.workers.dev/api/config | head -1
curl -sI https://campwatch.mikeroberts421.workers.dev/app             | head -1
curl -sI https://campwatch.mikeroberts421.workers.dev/api/config      | head -1
```

Expected:
- Old `/` → 200 (the SPA fix from Phase 0c landed on main).
- Old `/api/config` → 200 (no `CONFIG_KEY` set, falls open).
- New `/app` → 200.
- New `/api/config` → 401 (no auth header).

If anything else, STOP. The cutover assumes the new stack is fully working before swapping production.

- [ ] **Step 3: Quick state inventory**

```bash
# Confirm what's tracked at the repo root vs in next/
git ls-files src/ | wc -l   # CRA app files
git ls-files public/ | wc -l   # CRA public assets
git ls-files workers-site/ | wc -l   # Worker code
git ls-files notifier/ | wc -l   # Notifier
git ls-files next/ | head -3   # Next.js app
```

No commit. Just establishing baseline.

---

## Section A: Redirect Worker

Rewrite `workers-site/index.js` to a small redirect shim. Same Wrangler config, same Worker name, same URL — just different behavior: every request returns a 307 redirect to the corresponding path on `campwatch.mikeroberts421.workers.dev`.

### Task A1: Write the redirect Worker

**Files:**
- Modify: `workers-site/index.js`

- [ ] **Step 1: Replace contents with the redirect implementation**

```js
// Redirect shim. The old campsites-finder Worker forwards every request to
// the new campwatch Worker, preserving path, query string, and request method.
//
// Why a 307 (Temporary Redirect): preserves the request method (GET, POST, PUT)
// for API callers like the notifier's older runs and any old unsubscribe link
// embedded in already-sent emails. Older browsers might cache 308 (Permanent
// Redirect) responses too aggressively for our taste, so 307 is the safer
// default during the migration window.

const TARGET_ORIGIN = "https://campwatch.mikeroberts421.workers.dev";

const cors = (response) => {
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return response;
};

export default {
    async fetch(request) {
        const url = new URL(request.url);

        // CORS preflight: respond directly so callers see a fast 204.
        if (request.method === "OPTIONS") {
            return cors(new Response(null, { status: 204 }));
        }

        // Bare host root → land users on the new dashboard.
        if (url.pathname === "/" || url.pathname === "") {
            return Response.redirect(`${TARGET_ORIGIN}/app`, 307);
        }

        // Everything else: same path + query against the new origin.
        const target = new URL(url.pathname + url.search, TARGET_ORIGIN);
        return Response.redirect(target.toString(), 307);
    },
};
```

- [ ] **Step 2: Strip the `[site]` bucket from the old `wrangler.toml`**

The redirect Worker no longer needs static assets. Open `wrangler.toml` at the repo root. It currently contains:

```toml
[site]
bucket = "./build"
```

Remove that block. Also remove the `kv_namespaces` block (the redirect Worker doesn't touch KV — only the new Worker does). The resulting file should be:

```toml
name = "campsites-finder"
compatibility_date = "2024-01-01"
main = "workers-site/index.js"
```

That's it. Three lines.

- [ ] **Step 3: Local sanity**

Run `node -e "import('./workers-site/index.js').then(() => console.log('ok'))"` from the repo root if you want to catch syntax errors. Otherwise just trust the deploy step.

Build artifacts for the OLD CRA app (the `./build` directory) are no longer needed for deployment. They're regenerated by the existing `deploy.yml` workflow's `npm run build` step before deploy — but that workflow ALSO needs trimming (Task A2).

- [ ] **Step 4: Commit**

```bash
git add workers-site/index.js wrangler.toml
git commit -m "Convert old campsites-finder Worker to redirect shim pointing at campwatch"
```

### Task A2: Trim the old deploy workflow

The existing `.github/workflows/deploy.yml` runs `npm install` + `npm run build` (the CRA build) before deploying. Once the redirect Worker is in place, the CRA build is dead weight on every deploy.

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Read the current workflow to know what to cut**

```bash
cat .github/workflows/deploy.yml
```

The current workflow installs deps with `npm ci`, runs `npm run build`, and then deploys with `cloudflare/wrangler-action@v3`.

- [ ] **Step 2: Replace contents with a minimal redirect-only deploy**

```yaml
name: Deploy redirect Worker (campsites-finder)

on:
    push:
        branches: [main]
        paths:
            - "workers-site/**"
            - "wrangler.toml"
            - ".github/workflows/deploy.yml"
    workflow_dispatch: {}

jobs:
    deploy:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v5

            - name: Deploy redirect Worker
              uses: cloudflare/wrangler-action@v3
              with:
                  apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
                  accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
                  command: deploy
```

No Node setup, no install, no build. The redirect Worker has no dependencies — Wrangler bundles it directly.

The `paths` filter means this workflow only fires when something actually relevant changes. The CRA `src/` tree (which we'll relocate in Section D) won't trigger a redirect-Worker redeploy.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "Slim deploy.yml to a redirect-only Worker deploy"
```

---

## Section B: Verify the redirect Worker against a preview

We don't want to roll this to main and discover the redirect doesn't behave as expected. Cloudflare Workers supports per-deploy previews via `wrangler versions upload`, but that's friction. Easier: push the branch, let CI deploy, manually verify, then proceed.

Actually CI is set up to deploy the OLD Worker on push to `main` (per `paths` in `deploy.yml`). For a feature branch, that won't fire. We need to either dispatch the workflow manually or merge to verify.

The safest path that doesn't gamble on main:

### Task B1: Manually trigger the deploy workflow on the feature branch

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feature/phase-0d-cutover
```

- [ ] **Step 2: Trigger `deploy.yml` against the feature branch via workflow_dispatch**

```bash
gh workflow run deploy.yml --ref feature/phase-0d-cutover
sleep 3
gh run list --workflow=deploy.yml --limit 1
```

The workflow has `workflow_dispatch: {}` so this is a no-arg manual run. It will check out the feature branch's HEAD, deploy the redirect Worker, and your old URL behavior changes immediately.

- [ ] **Step 3: Watch the run**

```bash
gh run watch <RUN_ID> --exit-status
```

If the deploy fails, fix and retry.

### Task B2: Live smoke against the redirect

- [ ] **Step 1: Redirect on root**

```bash
curl -sI https://campsites-finder.mikeroberts421.workers.dev/ | head -3
```

Expected:
```
HTTP/2 307
location: https://campwatch.mikeroberts421.workers.dev/app
```

- [ ] **Step 2: Redirect on `/api/config`**

```bash
curl -sI https://campsites-finder.mikeroberts421.workers.dev/api/config | head -3
```

Expected:
```
HTTP/2 307
location: https://campwatch.mikeroberts421.workers.dev/api/config
```

- [ ] **Step 3: Follow the redirect end-to-end (with `-L`)**

```bash
curl -s -L https://campsites-finder.mikeroberts421.workers.dev/api/config -H "Authorization: Bearer $TEST_BEARER" | python3 -m json.tool | head -5
```

Run with a real Bearer token for `CONFIG_KEY` if you have it handy (else the response is `{"error":"Unauthorized"}` which is expected — the redirect is still working).

- [ ] **Step 4: Notifier-style POST through the redirect**

```bash
curl -sI -X POST https://campsites-finder.mikeroberts421.workers.dev/api/subscribe \
    -H "Content-Type: application/json" \
    -d '{"email":"phase-0d-redirect-test@example.invalid"}' | head -3
```

Expected: `HTTP/2 307` with a Location header. A 307 preserves the POST method on follow-up, so any tool that follows redirects (like wrangler-action calling the API, or older notifier runs from cached state) will land on the new Worker and POST correctly.

- [ ] **Step 5: Old unsubscribe link shape works**

```bash
curl -sI "https://campsites-finder.mikeroberts421.workers.dev/api/unsubscribe?email=test@example.com&token=deadbeef" | head -3
```

Expected: 307 with Location header preserving query string.

If any of these don't look right, return to Task A1.

No commit (no file changes).

---

## Section C: Notifier cutover

The notifier reads `SUBSCRIBER_API_URL` from env. Currently that's the old Worker. After cutover it's the new Worker. We do this via a GitHub Secrets update, which is a user-side action — this plan documents the exact change and then a verification step.

### Task C1: Document the secret changes (user-side)

**Files:** none.

The user needs to make these changes in `https://github.com/robertsmikej/campsites-react/settings/secrets/actions`:

| Secret | Current value (old) | New value |
|---|---|---|
| `SUBSCRIBER_API_URL` | `https://campsites-finder.mikeroberts421.workers.dev` | `https://campwatch.mikeroberts421.workers.dev` |
| `SITE_URL` | `https://campsites-finder.mikeroberts421.workers.dev` (or whatever points to the old SPA) | `https://campwatch.mikeroberts421.workers.dev/app` |
| `SUBSCRIBER_API_SECRET` | (current value) | **unchanged** — same `API_SECRET` works on both Workers because they share the KV namespace and the same secret value is mirrored to both via the deploy workflows |

Note: if the user doesn't update these, the notifier will keep pointing at the redirect Worker, which will keep working (the redirect is correct), but every cron run will eat a 307 + retry round-trip per request. Performance fine, just unnecessary. Better to point straight at the new URL.

Print the table above to the user and stop — wait for them to confirm secrets are updated before continuing.

### Task C2: Trigger a manual notifier run and verify

Once the user confirms the secret changes:

- [ ] **Step 1: Manually trigger the notifier**

```bash
gh workflow run check-campsites.yml --ref main
sleep 3
gh run list --workflow=check-campsites.yml --limit 1
```

- [ ] **Step 2: Watch the run**

```bash
gh run watch <RUN_ID> --exit-status
```

- [ ] **Step 3: Read the run logs to confirm it hit the new URL**

```bash
gh run view <RUN_ID> --log 2>&1 | grep -iE "campsites-finder|campwatch|api/subscribers|api/config" | head -20
```

Expected: log lines reference `campwatch.mikeroberts421.workers.dev` for the API calls. If you still see `campsites-finder` in the API URL portions, the secret wasn't updated successfully — re-check Task C1.

- [ ] **Step 4: Confirm no email was sent on this run (or that any email sent contains the new SITE_URL)**

Look for "[Email]" log lines. If any emails were sent, fetch the body via Resend's dashboard and confirm `unsubscribe` links point at `campwatch.mikeroberts421.workers.dev`, not the old URL.

No commit (no file changes).

---

## Section D: Park the CRA tree

The old CRA app at repo root is dead code now. Move it to `legacy/cra/` so the repo root reflects the live system.

We move (not delete) so the git history is preserved and a rollback is one command. If after a month nothing's referenced `legacy/`, delete it.

### Task D1: Move CRA source tree into `legacy/`

**Files moved** (use `git mv` so the history follows):

- `src/` → `legacy/cra/src/`
- `public/` → `legacy/cra/public/`
- `package.json`, `package-lock.json`, `README.md` (the CRA-specific README) — these we KEEP at the repo root for now, because:
    - `package.json` at root is referenced by Cloudflare's monorepo detection, and removing it complicates `next/`'s own resolution
    - Actually, the simpler call: REPLACE the root `package.json` with a minimal stub that has no scripts and only declares the workspace structure, OR delete it outright. The new app's `package.json` is at `next/package.json`. The notifier's at `notifier/package.json`. Neither depends on the root `package.json`.

Easiest end-state: delete the root `package.json` and the CRA `package-lock.json` entirely (they were only used by the now-retired CRA app and the now-retired `deploy.yml`'s build step).

- [ ] **Step 1: Move source files**

```bash
mkdir -p legacy/cra
git mv src legacy/cra/src
git mv public legacy/cra/public
```

- [ ] **Step 2: Delete root `package.json` and `package-lock.json`**

```bash
git rm package.json package-lock.json
```

- [ ] **Step 3: Verify what's still at the root**

```bash
git ls-files | grep -v '^\(legacy\|next\|notifier\|docs\|\.github\|workers-site\)/' | grep -v '^[^/]*\.md$' | head -20
```

Expected at root after the move:
- `wrangler.toml` (now the redirect Worker config)
- `README.md` (we'll rewrite in Task D2)
- `.gitignore`, `.eslintrc*`, etc. (some of these are CRA-specific and can be deleted too — but only if they don't affect `next/` or `notifier/`. Conservative: leave them for now and clean up later.)

- [ ] **Step 4: Confirm the deploy workflows aren't broken**

```bash
grep -nE "src/|public/|build/" .github/workflows/*.yml
```

If any matches reference the moved paths, update them. Should be zero matches if Task A2 was thorough.

- [ ] **Step 5: Confirm `next/` and `notifier/` still build/install**

```bash
cd next && pnpm install --frozen-lockfile && pnpm exec tsc --noEmit && pnpm run cf:build 2>&1 | tail -3
cd ../notifier && node -e "console.log('notifier resolves')"
```

Expected: cf:build complete, notifier resolves.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Move CRA tree to legacy/cra/ and remove root package.json"
```

### Task D2: Rewrite the root README

The root README still describes a CRA app deployed on `campsites-finder`. Replace with a description of the post-cutover layout.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace contents with the new layout description**

```markdown
# CampWatch

A campsite availability tracker for recreation.gov. Watches the campgrounds and
sites you care about and emails you the moment something opens up.

Live at **https://campwatch.mikeroberts421.workers.dev/app**.

## Architecture

```
next/        — Next.js 16 + Tailwind v4 + shadcn/ui app
              Deploys as the `campwatch` Cloudflare Worker
              via @opennextjs/cloudflare on every push to main.

notifier/    — Node script run as a GitHub Actions cron every 15 minutes.
              Calls the Worker's /api/* endpoints to read configuration and
              subscribers, fetches recreation.gov availability, sends emails
              via Resend on new matches.

workers-site/ — Tiny redirect Worker (the legacy `campsites-finder` URL).
              307-redirects every request to the corresponding path on
              campwatch.*. Kept alive so old unsubscribe links in
              already-sent emails continue to work.

legacy/cra/  — The previous Create React App build of the same product.
              Retained for reference and rollback only — not deployed.
```

## Development

```bash
cd next
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # Vitest
pnpm run cf:build # local OpenNext build
```

## Deployment

- **`next/`**: `.github/workflows/deploy-next.yml` deploys the campwatch Worker on every push to main (and feature branches).
- **`workers-site/`**: `.github/workflows/deploy.yml` deploys the redirect Worker when `workers-site/` or `wrangler.toml` change.
- **`notifier/`**: `.github/workflows/check-campsites.yml` runs every 15 minutes (cron). It reads `SUBSCRIBER_API_URL`, `SUBSCRIBER_API_SECRET`, `SITE_URL`, `RESEND_API_KEY` from GitHub Secrets.

## Design docs and plans

`docs/superpowers/specs/` and `docs/superpowers/plans/` hold the architectural specs and execution plans for ongoing work. Current phase: Phase 0d cutover (this plan). After this lands the next phase is Phase 1 (Google OAuth).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Rewrite README for the post-cutover repo layout"
```

---

## Section E: Final smoke + PR

### Task E1: Final live smoke

- [ ] **Step 1: Old Worker still serves redirects**

```bash
curl -sI https://campsites-finder.mikeroberts421.workers.dev/ | head -3
curl -sI https://campsites-finder.mikeroberts421.workers.dev/api/config | head -3
curl -sI https://campsites-finder.mikeroberts421.workers.dev/api/unsubscribe?email=test@x.com\&token=deadbeef | head -3
```

All three: `HTTP/2 307` with `location:` pointing at campwatch.

- [ ] **Step 2: New Worker still serves /app and APIs**

```bash
curl -sI https://campwatch.mikeroberts421.workers.dev/app | head -2
curl -sI https://campwatch.mikeroberts421.workers.dev/api/config | head -2   # 401 unauth, expected
```

- [ ] **Step 3: Notifier ran successfully** (verified in Section C). No further action.

### Task E2: Open the PR

- [ ] **Step 1: Open PR**

```bash
gh pr create --base main --head feature/phase-0d-cutover \
    --title "Phase 0d: Production cutover to the campwatch Worker" \
    --body "$(cat <<'EOF'
## Summary

Cut production over to the new Next.js + Tailwind + shadcn stack on the `campwatch` Cloudflare Worker.

### What changed

- **`workers-site/index.js`** rewritten as a 30-line redirect shim. The legacy `campsites-finder` URL now 307-redirects every request (preserving method, path, query, headers) to `campwatch.mikeroberts421.workers.dev`. Old unsubscribe links in already-sent emails continue to work because the redirect preserves their query string.
- **`wrangler.toml`** stripped to the bare redirect config (no `[site]` bucket, no KV binding — the redirect Worker doesn't need either).
- **`.github/workflows/deploy.yml`** slimmed to a one-step redirect-Worker deploy (no Node setup, no `npm run build`). Only fires when `workers-site/` or `wrangler.toml` change.
- **CRA tree moved** to `legacy/cra/`. Root `package.json` and `package-lock.json` removed. The repo root now contains: `next/`, `notifier/`, `workers-site/`, `legacy/cra/`, `docs/`, `.github/`.
- **`README.md`** rewritten to describe the post-cutover layout.

### Required GitHub Secrets update (done before merge)

Two secrets need their values updated to point at the new Worker:

- `SUBSCRIBER_API_URL`: was `https://campsites-finder.mikeroberts421.workers.dev`, now `https://campwatch.mikeroberts421.workers.dev`
- `SITE_URL`: now `https://campwatch.mikeroberts421.workers.dev/app`
- `SUBSCRIBER_API_SECRET`: unchanged (same value mirrored to both Workers' Cloudflare secrets)

If the secrets aren't updated, the notifier still works — it hits the old URL, gets a 307, follows it to the new URL. Just an extra hop per request.

## Test plan

- [x] Redirect Worker deployed and verified via curl (root, /api/config, /api/subscribe, /api/unsubscribe — all return 307 to campwatch.*)
- [x] Notifier run triggered manually and verified to hit the new API URL successfully
- [x] cf:build clean for the new Worker
- [x] `legacy/cra/` resolves (no broken imports anywhere outside that directory)
- [x] README accurately describes the live system

## Rollback

If a critical issue surfaces post-merge:

1. Revert this commit on main: `git revert <merge-commit-sha>`. That restores the full old Worker as the SPA + API.
2. Revert the `SUBSCRIBER_API_URL` and `SITE_URL` GitHub Secrets to the previous values.
3. Push the revert. The old `deploy.yml` runs its `npm run build` against the CRA source — which now lives at `legacy/cra/` — so the revert also has to put the source back. Two options if that's the case:
   - The revert handles both: most likely scenario since it's a Git revert of the same commit that did the move.
   - Manual rollback: `git mv legacy/cra/src src && git mv legacy/cra/public public`, restore the old `package.json`, and re-deploy.

I'd treat this as a one-way door for the file moves and a two-way door for the redirect Worker (the latter can be flipped back in 10 minutes).

Implements Phase 0d of `docs/superpowers/specs/2026-05-14-multi-user-rework-design.md`. Closes the Phase 0 stack migration. Next up: Phase 1 (Google OAuth).
EOF
)"
```

- [ ] **Step 2: Hand off to the user for review**

---

## Self-review checklist

- Did every URL referenced in the redirect shim use the correct target origin?
- Does the redirect preserve method (307 vs 308 vs 302)? Yes — 307 is the right choice.
- Are there any `paths` filters in workflow files that reference the now-moved `src/` or `public/`?
- Did the README get updated to remove "production app deployed on campsites-finder Worker" language?
- Are GitHub Secrets explicitly listed as a USER action with a hand-off step? Yes — Task C1.
- Did the notifier workflow's env-var bindings stay correct after the secret-name story? Yes — the workflow references `secrets.SUBSCRIBER_API_URL` which is a name that doesn't change; only the value changes.
- Is the rollback story clear and bounded? Yes — Section E2's PR body has it.
