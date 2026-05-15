import { getEnv } from "@/lib/cloudflare";
import { normalizeEmail } from "@/lib/email";
import { verifyUnsubscribeToken } from "@/lib/hmac";

function htmlResponse(body: string, status = 200): Response {
    return new Response(body, { status, headers: { "Content-Type": "text/html" } });
}

export async function GET(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const email = normalizeEmail(url.searchParams.get("email"));
    const token = url.searchParams.get("token");

    if (!email || !token) {
        return new Response("Missing email or token", { status: 400 });
    }

    const env = getEnv();
    if (!env.API_SECRET) {
        return new Response("Server misconfigured: API_SECRET not set", { status: 500 });
    }

    const valid = await verifyUnsubscribeToken(email, token, env.API_SECRET);
    if (!valid) {
        return new Response("Invalid or expired unsubscribe link", { status: 403 });
    }

    await env.SUBSCRIBERS.delete(`email:${email}`);

    return htmlResponse(
        `<!DOCTYPE html>
        <html><head><meta charset="utf-8"><title>Unsubscribed</title></head>
        <body style="font-family:sans-serif;max-width:400px;margin:80px auto;text-align:center;">
            <h2>Unsubscribed</h2>
            <p>${email} has been removed from campsite availability notifications.</p>
        </body></html>`,
    );
}
