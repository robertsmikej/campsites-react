import { getEnv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { verifySignedValue } from "@/lib/crypto-helpers";
import { getUserProfile, updateUserProfile } from "@/lib/users";
import { withErrorLogging } from "@/lib/route-helpers";

// Unauthenticated by design: the recipient of the verification email may not be
// signed in. The signed token IS the authorization — it can only ever route one
// account's alerts to the one address its owner received this link at.
async function getHandler(request: Request): Promise<Response> {
    const env = getEnv();
    if (!env.API_SECRET) {
        return withCors(jsonResponse({ error: "Server misconfigured" }, 500));
    }

    const token = new URL(request.url).searchParams.get("token");
    if (!token) return withCors(jsonResponse({ error: "Missing token" }, 400));

    const payload = await verifySignedValue(token, env.API_SECRET);
    if (!payload) return withCors(jsonResponse({ error: "Invalid or expired link" }, 400));

    const sep = payload.indexOf("|");
    if (sep < 1) return withCors(jsonResponse({ error: "Invalid or expired link" }, 400));
    const accountEmail = payload.slice(0, sep);
    const address = payload.slice(sep + 1);

    const profile = await getUserProfile(accountEmail);
    if (!profile) return withCors(jsonResponse({ error: "Invalid or expired link" }, 400));

    await updateUserProfile(accountEmail, {
        notificationEmail: address,
        pendingNotificationEmail: undefined,
    });

    const origin = new URL(request.url).origin;
    return new Response(null, {
        status: 302,
        headers: {
            Location: `${origin}/app/account?emailVerified=1`,
            "Cache-Control": "no-store",
        },
    });
}

export const GET = withErrorLogging(getHandler, "GET /api/me/verify-notification-email");
