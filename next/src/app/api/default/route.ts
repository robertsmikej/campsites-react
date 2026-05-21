import { getKv } from "@/lib/cloudflare";
import { readSession } from "@/lib/sessions";
import { getUserProfile } from "@/lib/users";
import { jsonResponse, withCors } from "@/lib/responses";
import { buildDefaultFromCatalog } from "@/data/build-default";
import { withErrorLogging } from "@/lib/route-helpers";

async function getHandler(): Promise<Response> {
    const data = await getKv().get("config:campgrounds", "json");
    if (data) return withCors(jsonResponse(data));

    // Dev fallback: when local miniflare KV hasn't been seeded yet, return the
    // built-in catalog so /discover and other consumers have something to show.
    // Production still 404s if the KV blob is genuinely missing.
    if (process.env.NODE_ENV !== "production") {
        return withCors(jsonResponse(buildDefaultFromCatalog()));
    }

    return withCors(jsonResponse({ error: "No default config found" }, 404));
}
export const GET = withErrorLogging(getHandler, "GET /api/default");

async function putHandler(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    const profile = await getUserProfile(session.email);
    if (!profile?.roles?.includes("curator")) {
        return withCors(jsonResponse({ error: "Forbidden" }, 403));
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return withCors(jsonResponse({ error: "Invalid JSON" }, 400));
    }
    if (!body || typeof body !== "object" || !("campgrounds" in body)) {
        return withCors(jsonResponse({ error: "Body must include campgrounds" }, 400));
    }

    await getKv().put("config:campgrounds", JSON.stringify(body));
    return withCors(jsonResponse({ message: "Default config saved" }));
}
export const PUT = withErrorLogging(putHandler, "PUT /api/default");
