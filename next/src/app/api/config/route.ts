import { getEnv } from "@/lib/cloudflare";
import type { CampWatchEnv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";

function authorizedForRead(request: Request, env: CampWatchEnv): boolean {
    if (!env.CONFIG_KEY) return true;
    const auth = request.headers.get("Authorization");
    const accepted = [env.CONFIG_KEY, env.API_SECRET].filter(Boolean) as string[];
    return !!auth && accepted.some((t) => auth === `Bearer ${t}`);
}

function authorizedForWrite(request: Request, env: CampWatchEnv): boolean {
    if (!env.CONFIG_KEY) return true;
    const auth = request.headers.get("Authorization");
    return auth === `Bearer ${env.CONFIG_KEY}`;
}

export async function GET(request: Request): Promise<Response> {
    const env = getEnv();
    if (!authorizedForRead(request, env)) {
        return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    }

    const data = await env.SUBSCRIBERS.get("config:campgrounds", "json");
    if (!data) {
        return withCors(jsonResponse({ error: "No config found" }, 404));
    }
    return withCors(jsonResponse(data));
}

export async function PUT(request: Request): Promise<Response> {
    const env = getEnv();
    if (!authorizedForWrite(request, env)) {
        return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return withCors(jsonResponse({ error: "Invalid JSON" }, 400));
    }

    if (!body || typeof body !== "object" || !("campgrounds" in (body as object))) {
        return withCors(jsonResponse({ error: "Request body must include campgrounds" }, 400));
    }

    await env.SUBSCRIBERS.put("config:campgrounds", JSON.stringify(body));
    return withCors(jsonResponse({ message: "Config saved" }));
}

export async function OPTIONS(): Promise<Response> {
    return withCors(new Response(null, { status: 204 }));
}
