import { getKv } from "@/lib/cloudflare";
import { readSession } from "@/lib/sessions";
import { getUserProfile } from "@/lib/users";
import { jsonResponse, withCors } from "@/lib/responses";

export async function GET(): Promise<Response> {
    const data = await getKv().get("config:campgrounds", "json");
    if (!data) return withCors(jsonResponse({ error: "No default config found" }, 404));
    return withCors(jsonResponse(data));
}

export async function PUT(request: Request): Promise<Response> {
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
