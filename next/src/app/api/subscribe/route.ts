import { getKv } from "@/lib/cloudflare";
import { isValidEmail, normalizeEmail } from "@/lib/email";
import { jsonResponse, withCors } from "@/lib/responses";

export const runtime = "edge";

export async function POST(request: Request): Promise<Response> {
    let body: { email?: string };
    try {
        body = await request.json();
    } catch {
        return withCors(jsonResponse({ error: "Invalid request body" }, 400));
    }

    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) {
        return withCors(jsonResponse({ error: "Valid email address required" }, 400));
    }

    const kv = getKv();
    const existing = await kv.get(`email:${email}`);
    if (existing) {
        return withCors(jsonResponse({ message: "Already subscribed" }));
    }

    await kv.put(
        `email:${email}`,
        JSON.stringify({ email, subscribedAt: new Date().toISOString() }),
    );
    return withCors(jsonResponse({ message: "Subscribed successfully" }));
}

export async function OPTIONS(): Promise<Response> {
    return withCors(new Response(null, { status: 204 }));
}
