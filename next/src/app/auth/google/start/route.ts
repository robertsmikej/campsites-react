import { getEnv } from "@/lib/cloudflare";
import { signValue, generateOpaqueToken } from "@/lib/crypto-helpers";
import { buildAuthorizationUrl } from "@/lib/google-oauth";
import { jsonResponse } from "@/lib/responses";

export const OAUTH_STATE_COOKIE = "campwatch_oauth_state";
const OAUTH_STATE_TTL_SECONDS = 600;

function isSafeReturnTo(value: string | null): value is string {
    if (!value) return false;
    if (!value.startsWith("/")) return false;
    if (value.includes("://")) return false;
    return true;
}

function buildOAuthCookie(value: string): string {
    return [
        `${OAUTH_STATE_COOKIE}=${value}`,
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
        "Path=/",
        `Max-Age=${OAUTH_STATE_TTL_SECONDS}`,
    ].join("; ");
}

export async function GET(request: Request): Promise<Response> {
    const env = getEnv();
    if (!env.GOOGLE_CLIENT_ID || !env.SESSION_SECRET) {
        // Friendlier dev message — production sets these via wrangler secrets.
        if (process.env.NODE_ENV !== "production") {
            const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>OAuth not configured (local dev)</title>
<style>
  body { font: 16px/1.5 -apple-system, system-ui, sans-serif; max-width: 640px; margin: 80px auto; padding: 0 24px; color: #1A1614; background: #F4EAD8; }
  h1 { font: 700 28px/1.2 -apple-system, system-ui, sans-serif; }
  code { background: rgba(0,0,0,0.06); padding: 2px 6px; border-radius: 3px; font: 13px ui-monospace, monospace; }
  pre { background: rgba(0,0,0,0.06); padding: 14px 16px; border-radius: 4px; overflow-x: auto; font: 13px/1.5 ui-monospace, monospace; }
  a { color: #1F3D2A; }
</style></head>
<body>
<h1>OAuth not configured (local dev)</h1>
<p>The Google client credentials aren't set in your <code>.dev.vars</code>. Two ways to fix:</p>
<h3>Quick: use the DEV_USER bypass</h3>
<pre>DEV_USER=mikeroberts421@gmail.com
BOOTSTRAP_ADMIN_EMAIL=mikeroberts421@gmail.com</pre>
<p>Restart <code>pnpm dev</code> and you'll be auto-signed in. The bypass is hard-gated on NODE_ENV !== "production".</p>
<h3>Or: real Google OAuth locally</h3>
<p>Add to <code>next/.dev.vars</code>:</p>
<pre>GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SESSION_SECRET=any-random-string</pre>
<p>You'll also need to add <code>http://localhost:3000/auth/google/callback</code> to the Google Cloud OAuth client's allowed redirect URIs.</p>
<p style="margin-top: 32px;"><a href="/">← back to homepage</a></p>
</body></html>`;
            return new Response(html, {
                status: 500,
                headers: { "Content-Type": "text/html; charset=utf-8" },
            });
        }
        return jsonResponse({ error: "OAuth not configured on this Worker" }, 500);
    }

    const url = new URL(request.url);
    const returnToParam = url.searchParams.get("returnTo");
    const returnTo = isSafeReturnTo(returnToParam) ? returnToParam : "/app";
    const state = generateOpaqueToken(16);

    const signed = await signValue(JSON.stringify({ state, returnTo }), env.SESSION_SECRET);

    const authUrl = buildAuthorizationUrl({
        clientId: env.GOOGLE_CLIENT_ID,
        redirectUri: `${url.origin}/auth/google/callback`,
        state,
    });

    const response = Response.redirect(authUrl, 302);
    const mutable = new Response(response.body, response);
    mutable.headers.append("Set-Cookie", buildOAuthCookie(signed));
    return mutable;
}
