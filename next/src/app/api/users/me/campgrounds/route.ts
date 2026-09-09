import { readSession } from "@/lib/sessions";
import { jsonResponse, withCors } from "@/lib/responses";
import { getUserCampgrounds, putUserCampgrounds } from "@/lib/user-campgrounds";
import { getSitewideDefaultSettings } from "@/lib/settings";
import { getKv } from "@/lib/cloudflare";
import { withErrorLogging } from "@/lib/route-helpers";
import { WorkerKvAdapter } from "@/lib/recgov/worker-kv";
import { HIGH_PRIORITY_CAP } from "@/types/campground";
import { archiveRemovedCampgrounds } from "@/lib/campground-archive";
import type { Campground } from "@/types/campground";

const VALID_CHECK_PRIORITIES = new Set(["high", "normal", "low"]);

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const BLACKOUT_MAX_RANGES = 50;
const BLACKOUT_MAX_LABEL = 80;

// Size caps. The notifier fetches every user's full watchlist once a minute in
// a single response, so one oversized record would take alerts down for
// everyone. Real lists are a handful of campgrounds and a few KB.
const MAX_BODY_BYTES = 256 * 1024;
const MAX_CAMPGROUNDS = 100;
const MAX_SITE_NAMES = 500;
const MAX_SHORT_STRING = 200;
const MAX_LONG_STRING = 2000;
const MAX_STAY_NIGHTS = 14;
// rec.gov facility ids are numeric, but older records carry slugs; allow both, bounded.
const CAMPGROUND_ID = /^[A-Za-z0-9_-]{1,32}$/;
const WEEKDAYS = new Set(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);

function isShortString(v: unknown): boolean {
    return typeof v === "string" && v.length <= MAX_SHORT_STRING;
}

function validSiteNames(v: unknown): boolean {
    if (v === undefined) return true;
    if (!Array.isArray(v) || v.length > MAX_SITE_NAMES) return false;
    return v.every(isShortString);
}

// Returns null when the entry is acceptable, otherwise a message for the 400.
function campgroundEntryError(entry: unknown, index: number): string | null {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return `campgrounds[${index}] must be an object`;
    }
    const c = entry as Record<string, unknown>;
    if (typeof c.id !== "string" || !CAMPGROUND_ID.test(c.id)) {
        return `campgrounds[${index}].id must be a short campground id`;
    }
    if (c.name !== undefined && !isShortString(c.name)) {
        return `campgrounds[${index}].name must be a string of at most ${MAX_SHORT_STRING} characters`;
    }
    for (const [key, value] of Object.entries(c)) {
        if (typeof value === "string" && value.length > MAX_LONG_STRING) {
            return `campgrounds[${index}].${key} is too long`;
        }
    }
    if (c.sites !== undefined) {
        const sites = c.sites as { favorites?: unknown; worthwhile?: unknown } | null;
        if (!sites || typeof sites !== "object") return `campgrounds[${index}].sites must be an object`;
        if (!validSiteNames(sites.favorites) || !validSiteNames(sites.worthwhile)) {
            return `campgrounds[${index}].sites lists are limited to ${MAX_SITE_NAMES} names of ${MAX_SHORT_STRING} characters`;
        }
    }
    const dates = c.dates as { startDate?: unknown; endDate?: unknown } | undefined;
    for (const bound of [dates?.startDate, dates?.endDate]) {
        if (bound !== undefined && (typeof bound !== "string" || !ISO_DAY.test(bound))) {
            return `campgrounds[${index}].dates must be YYYY-MM-DD`;
        }
    }
    return null;
}

function campgroundsError(list: unknown[]): string | null {
    if (list.length > MAX_CAMPGROUNDS) {
        return `At most ${MAX_CAMPGROUNDS} campgrounds per watchlist`;
    }
    for (let i = 0; i < list.length; i++) {
        const error = campgroundEntryError(list[i], i);
        if (error) return error;
    }
    return null;
}

function globalSettingsError(gs: { stayLengths: unknown[]; validStartDays: unknown[] }): string | null {
    if (gs.stayLengths.length > MAX_STAY_NIGHTS) return "Too many stay lengths";
    const badNight = gs.stayLengths.some(
        (n) => typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_STAY_NIGHTS,
    );
    if (badNight) return `stayLengths must be whole nights between 1 and ${MAX_STAY_NIGHTS}`;
    if (gs.validStartDays.length > WEEKDAYS.size) return "Too many start days";
    if (gs.validStartDays.some((d) => typeof d !== "string" || !WEEKDAYS.has(d))) {
        return "validStartDays must be weekday names";
    }
    return null;
}

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

    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
        return withCors(jsonResponse({ error: "Watchlist is too large" }, 413));
    }
    let body: unknown;
    try {
        body = JSON.parse(rawBody);
    } catch {
        return withCors(jsonResponse({ error: "Invalid JSON" }, 400));
    }
    if (!isValidBody(body)) {
        return withCors(jsonResponse({ error: "Body must include campgrounds and globalSettings" }, 400));
    }

    const shapeError =
        campgroundsError(body.campgrounds["recreation.gov"]) ?? globalSettingsError(body.globalSettings);
    if (shapeError) {
        return withCors(jsonResponse({ error: shapeError }, 400));
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
