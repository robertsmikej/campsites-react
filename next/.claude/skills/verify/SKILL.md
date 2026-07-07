---
name: verify
description: Build/launch/drive recipe for verifying next/ changes end-to-end against a local dev server.
---

# Verifying CampWatch next/ changes

Launch: `cd next && pnpm dev` (ready in ~10s, listens on http://localhost:3000). Poll `curl -s -o /dev/null http://localhost:3000/` until it answers. Logs mention `proxy.ts`; that's normal Next dev output.

Drive: plain curl against localhost:3000. For host-dependent behavior (e.g. the www-to-apex 301 in `src/middleware.ts`), override with `curl -H "Host: www.campwatch.dev" http://localhost:3000/...` and check `%{http_code}` / `%{redirect_url}`.

Gotchas:
- Dev skips the auth redirects in middleware (`NODE_ENV !== "production"` branches), so `/app` returns 200 without a session cookie locally. That is expected, not a regression.
- CI has a separate `pnpm format:check` gate; run `pnpm format` before pushing.
- Kill the server with `pkill -f "next dev"` when done.
