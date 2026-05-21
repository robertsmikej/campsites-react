import { readSession } from "@/lib/sessions";
import { jsonResponse, withCors } from "@/lib/responses";
import { getUserCampgrounds, putUserCampgrounds } from "@/lib/user-campgrounds";
import { getSitewideDefaultSettings } from "@/lib/settings";
import { getUserProfile } from "@/lib/users";
import { getKv } from "@/lib/cloudflare";
import { withErrorLogging } from "@/lib/route-helpers";

const DEFAULT_CONFIG_KEY = "config:campgrounds";

function emptyRecord() {
    const defaults = getSitewideDefaultSettings({});
    return {
        campgrounds: { "recreation.gov": [] as never[] },
        globalSettings: {
            stayLengths: defaults.dates.stayLengths,
            validStartDays: defaults.dates.validStartDays,
        },
        updatedAt: null as string | null,
    };
}

function isValidBody(body: unknown): body is {
    campgrounds: { "recreation.gov": unknown[] };
    globalSettings: { stayLengths: number[]; validStartDays: string[] };
} {
    if (!body || typeof body !== "object") return false;
    const b = body as Record<string, unknown>;
    if (!b.campgrounds || typeof b.campgrounds !== "object") return false;
    const c = b.campgrounds as Record<string, unknown>;
    if (!Array.isArray(c["recreation.gov"])) return false;
    if (!b.globalSettings || typeof b.globalSettings !== "object") return false;
    const g = b.globalSettings as Record<string, unknown>;
    if (!Array.isArray(g.stayLengths)) return false;
    if (!Array.isArray(g.validStartDays)) return false;
    return true;
}

async function getHandler(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    const record = await getUserCampgrounds(session.email);
    return withCors(jsonResponse(record ?? emptyRecord()));
}
export const GET = withErrorLogging(getHandler, "GET /api/users/me/campgrounds");

async function putHandler(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return withCors(jsonResponse({ error: "Invalid JSON" }, 400));
    }
    if (!isValidBody(body)) {
        return withCors(jsonResponse({ error: "Body must include campgrounds and globalSettings" }, 400));
    }

    const stored = await putUserCampgrounds(session.email, body as never);

    // Write-through to the default config if the user is a curator.
    const profile = await getUserProfile(session.email);
    if (profile?.roles?.includes("curator")) {
        try {
            await getKv().put(DEFAULT_CONFIG_KEY, JSON.stringify(body));
        } catch (err) {
            console.error("[PUT /api/users/me/campgrounds] Failed to write default config:", err);
            // Don't fail the user save.
        }
    }

    return withCors(jsonResponse(stored));
}
export const PUT = withErrorLogging(putHandler, "PUT /api/users/me/campgrounds");
