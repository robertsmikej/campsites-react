import { getEnv } from "@/lib/cloudflare";
import { verifySignedValue } from "@/lib/crypto-helpers";
import { normalizeEmail } from "@/lib/email";
import { exchangeCodeForToken, verifyIdToken } from "@/lib/google-oauth";
import { createSession } from "@/lib/sessions";
import { createUserProfile, getUserProfile, bootstrapCuratorIfFirst } from "@/lib/users";

const OAUTH_STATE_COOKIE = "campwatch_oauth_state";

function clearStateCookie(): string {
    return [
        `${OAUTH_STATE_COOKIE}=`,
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
        "Path=/",
        "Max-Age=0",
    ].join("; ");
}

function readCookie(request: Request, name: string): string | null {
    const header = request.headers.get("Cookie");
    if (!header) return null;
    for (const part of header.split(";")) {
        const [k, ...rest] = part.trim().split("=");
        if (k === name) return rest.join("=");
    }
    return null;
}

function failureResponse(reason: string, origin: string): Response {
    const response = Response.redirect(`${origin}/?authError=${reason}`, 302);
    const mutable = new Response(response.body, response);
    mutable.headers.append("Set-Cookie", clearStateCookie());
    return mutable;
}

export async function GET(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const origin = url.origin;

    const env = getEnv();
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.SESSION_SECRET) {
        return failureResponse("oauth_not_configured", origin);
    }

    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    if (!code || !stateParam) return failureResponse("missing_params", origin);

    const signedCookie = readCookie(request, OAUTH_STATE_COOKIE);
    if (!signedCookie) return failureResponse("missing_state_cookie", origin);

    const inner = await verifySignedValue(signedCookie, env.SESSION_SECRET);
    if (!inner) return failureResponse("invalid_state_cookie", origin);

    let parsed: { state?: string; returnTo?: string };
    try {
        parsed = JSON.parse(inner);
    } catch {
        return failureResponse("invalid_state_payload", origin);
    }
    if (parsed.state !== stateParam) return failureResponse("state_mismatch", origin);

    let token;
    try {
        token = await exchangeCodeForToken({
            code,
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            redirectUri: `${origin}/auth/google/callback`,
        });
    } catch {
        return failureResponse("token_exchange_failed", origin);
    }

    let payload;
    try {
        payload = await verifyIdToken(token.id_token, env.GOOGLE_CLIENT_ID);
    } catch {
        return failureResponse("verify_failed", origin);
    }

    const email = normalizeEmail(payload.email);
    if (!email) return failureResponse("missing_email", origin);

    const existing = await getUserProfile(email);
    if (!existing) {
        await createUserProfile(email, {
            name: payload.name ?? email,
            picture: payload.picture,
        });
    }

    await bootstrapCuratorIfFirst(email, env.BOOTSTRAP_ADMIN_EMAIL);

    const { cookie } = await createSession(email, request);

    const safeReturnTo =
        typeof parsed.returnTo === "string" &&
        parsed.returnTo.startsWith("/") &&
        !parsed.returnTo.includes("://")
            ? parsed.returnTo
            : "/app";

    const response = Response.redirect(`${origin}${safeReturnTo}`, 302);
    const mutable = new Response(response.body, response);
    mutable.headers.append("Set-Cookie", cookie);
    mutable.headers.append("Set-Cookie", clearStateCookie());
    return mutable;
}
