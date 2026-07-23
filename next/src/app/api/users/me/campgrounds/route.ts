import { readSession } from "@/lib/sessions";
import { jsonResponse, withCors } from "@/lib/responses";
import { getUserCampgrounds, putUserCampgrounds } from "@/lib/user-campgrounds";
import { getSitewideDefaultSettings } from "@/lib/settings";
import { getKv } from "@/lib/cloudflare";
import { withErrorLogging } from "@/lib/route-helpers";
import { WorkerKvAdapter } from "@/lib/recgov/worker-kv";
import { HIGH_PRIORITY_CAP } from "@/types/campground";
import { archiveRemovedCampgrounds } from "@/lib/campground-archive";
import { validTripWindows, windowIsPast, serverTodayIso, TRIP_MAX_NIGHTS } from "@/lib/trip-windows";
import type { Campground, TripWindow } from "@/types/campground";

const VALID_CHECK_PRIORITIES = new Set(["high", "normal", "low"]);

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const BLACKOUT_MAX_RANGES = 50;
const BLACKOUT_MAX_LABEL = 80;

function validBlackoutDates(v: unknown): boolean {
    if (v === undefined) return true;
    if (!Array.isArray(v) || v.length > BLACKOUT_MAX_RANGES) return false;
    return v.every((r) => {
        if (!r || typeof r !== "object") return false;
        const b = r as { from?: unknown; to?: unknown; label?: unknown };
        if (typeof b.from !== "string" || !ISO_DAY.test(b.from)) return false;
        if (typeof b.to !== "string" || !ISO_DAY.test(b.to)) return false;
        if (b.from > b.to) return false;
        if (b.label !== undefined && (typeof b.label !== "string" || b.label.length > BLACKOUT_MAX_LABEL))
            return false;
        return true;
    });
}

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

    const gs = body.globalSettings as { blackoutDates?: unknown };
    if (!validBlackoutDates(gs.blackoutDates)) {
        return withCors(
            jsonResponse(
                {
                    error: "blackoutDates must be valid YYYY-MM-DD ranges (from <= to, label <= 80 chars, max 50)",
                },
                400,
            ),
        );
    }

    const gsTrips = body.globalSettings as { tripWindows?: unknown };
    if (!validTripWindows(gsTrips.tripWindows)) {
        return withCors(
            jsonResponse(
                {
                    error: `tripWindows must be valid ranges (id, YYYY-MM-DD from < to, max ${TRIP_MAX_NIGHTS} nights, label <= 80, flex 0-3 leaving >= 1 core night, max 10, unique ids)`,
                },
                400,
            ),
        );
    }
    // Past windows are dead weight: drop them on every save.
    if (Array.isArray(gsTrips.tripWindows)) {
        const todayIso = serverTodayIso();
        gsTrips.tripWindows = (gsTrips.tripWindows as TripWindow[]).filter((w) => !windowIsPast(w, todayIso));
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

    // Read the prior record BEFORE overwriting so removals can be archived.
    const prior = await getUserCampgrounds(session.email).catch(() => null);

    const stored = await putUserCampgrounds(session.email, body as never);

    // Best-effort: archive campgrounds that were just removed (full prior config),
    // so they can be one-click re-added next season. Never fails the save.
    try {
        const priorList = (prior?.campgrounds["recreation.gov"] ?? []) as Campground[];
        const incomingIds = new Set(
            (body.campgrounds["recreation.gov"] as Array<{ id?: string }>)
                .map((c) => c?.id)
                .filter((id): id is string => typeof id === "string"),
        );
        const removed = priorList.filter((c) => !incomingIds.has(c.id));
        await archiveRemovedCampgrounds(session.email, removed, new Date().toISOString());
    } catch (e) {
        console.error("[archive] failed to archive removed campgrounds:", (e as Error).message);
    }

    const adapter = new WorkerKvAdapter(getKv());
    await adapter.deleteSnapshot(session.email);

    return withCors(jsonResponse(stored));
}
export const PUT = withErrorLogging(putHandler, "PUT /api/users/me/campgrounds");
