import { readSession } from "@/lib/sessions";
import { jsonResponse, withCors } from "@/lib/responses";
import { withErrorLogging } from "@/lib/route-helpers";
import { getEnv } from "@/lib/cloudflare";
import { readPushSubs, removePushSub } from "@/lib/push/subscription";
import { sendWebPush } from "@/lib/push/send";

// Sends a real Web Push to the calling user's own devices — the same path the
// notifier uses for alerts, so a delivered test confirms the full pipeline.
async function postHandler(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    const env = getEnv();
    if (!env.VAPID_PRIVATE_JWK) {
        return withCors(jsonResponse({ error: "Push not configured" }, 503));
    }
    const vapid = {
        privateJWK: JSON.parse(env.VAPID_PRIVATE_JWK) as JsonWebKey,
        subject: "mailto:hello@campwatch.dev",
    };

    const subs = await readPushSubs(session.email);
    if (subs.length === 0) {
        return withCors(jsonResponse({ error: "No push subscriptions for this account" }, 404));
    }

    let sent = 0;
    const dead: string[] = [];
    for (const sub of subs) {
        try {
            const r = await sendWebPush(
                sub,
                {
                    title: "CampWatch test",
                    body: "Push is working — you'll get alerts here.",
                    url: "/app",
                    tag: "campwatch-test",
                },
                vapid,
            );
            if (r.gone) dead.push(sub.endpoint);
            else if (r.status >= 200 && r.status < 300) sent++;
        } catch {
            // Skip a failed device; it's reflected in the sent count.
        }
    }
    for (const endpoint of dead) await removePushSub(session.email, endpoint);

    return withCors(jsonResponse({ ok: true, sent, pruned: dead.length }));
}
export const POST = withErrorLogging(postHandler, "POST /api/users/me/push/test");
