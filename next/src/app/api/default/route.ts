import { getKv } from "@/lib/cloudflare";
import { readSession } from "@/lib/sessions";
import { getUserProfile } from "@/lib/users";
import { jsonResponse, withCors } from "@/lib/responses";
import { defaultCampgroundConfigurations } from "@/data/site-configurations";
import { campgroundCatalog } from "@/data/campground-catalog";

export async function GET(): Promise<Response> {
    const data = await getKv().get("config:campgrounds", "json");
    if (data) return withCors(jsonResponse(data));

    // Dev fallback: when local miniflare KV hasn't been seeded yet, return the
    // built-in catalog so /discover and other consumers have something to show.
    // Production still 404s if the KV blob is genuinely missing.
    if (process.env.NODE_ENV !== "production") {
        const merged = (campgroundCatalog["recreation.gov"] ?? []).map((c) => {
            const cfg = (defaultCampgroundConfigurations["recreation.gov"] ?? []).find((x) => x.id === c.id);
            return { ...c, ...(cfg ?? {}) };
        });
        return withCors(
            jsonResponse({
                campgrounds: { "recreation.gov": merged },
                globalSettings: {
                    stayLengths: [2, 3, 4, 5],
                    validStartDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
                },
            }),
        );
    }

    return withCors(jsonResponse({ error: "No default config found" }, 404));
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
