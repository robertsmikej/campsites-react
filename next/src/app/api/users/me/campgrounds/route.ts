import { readSession } from "@/lib/sessions";
import { jsonResponse, withCors } from "@/lib/responses";
import { getUserCampgrounds, putUserCampgrounds } from "@/lib/user-campgrounds";
import { getSitewideDefaultSettings } from "@/lib/settings";
import { getKv } from "@/lib/cloudflare";
import { withErrorLogging } from "@/lib/route-helpers";
import { WorkerKvAdapter } from "@/lib/recgov/worker-kv";
import { HIGH_PRIORITY_CAP } from "@/types/campground";

const VALID_CHECK_PRIORITIES = new Set(["high", "normal", "low"]);

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
    if (!session) return withCors(jsonResponse(emptyRecord()));

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

    const invalidPriority = body.campgrounds["recreation.gov"].some((cg) => {
        if (!cg || typeof cg !== "object") return false;
        const c = cg as { checkPriority?: unknown };
        return c.checkPriority !== undefined && !VALID_CHECK_PRIORITIES.has(c.checkPriority as string);
    });
    if (invalidPriority) {
        return withCors(jsonResponse({ error: 'checkPriority must be "high", "normal", or "low"' }, 400));
    }

    const highCount = body.campgrounds["recreation.gov"].filter((cg) => {
        if (!cg || typeof cg !== "object") return false;
        const c = cg as { checkPriority?: string; enabled?: boolean };
        return c.checkPriority === "high" && c.enabled !== false;
    }).length;
    if (highCount > HIGH_PRIORITY_CAP) {
        return withCors(
            jsonResponse(
                { error: `At most ${HIGH_PRIORITY_CAP} campgrounds can be set to every-minute checking` },
                400,
            ),
        );
    }

    const stored = await putUserCampgrounds(session.email, body as never);

    const adapter = new WorkerKvAdapter(getKv());
    await adapter.deleteSnapshot(session.email);

    return withCors(jsonResponse(stored));
}
export const PUT = withErrorLogging(putHandler, "PUT /api/users/me/campgrounds");
