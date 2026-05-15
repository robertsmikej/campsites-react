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
