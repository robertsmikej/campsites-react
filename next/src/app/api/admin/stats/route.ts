import { getEnv, getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { withErrorLogging } from "@/lib/route-helpers";
import { putIfChanged } from "@/lib/kv-utils";

export interface NotifierStats {
    lastPollAt: string;
    campgroundsTracked: number;
    openingsSentToday: number;
    openingsSentLast7Days: number;
    medianLatencyMs: number;
    sampleSize: number;
    todayKey: string;
}

// Internal-only fields used by the notifier for rolling computations.
// Stored alongside NotifierStats in the same KV blob but NEVER exposed publicly.
export interface NotifierStatsInternal extends NotifierStats {
    _latencyWindow?: number[];
    _dailyHistory?: { date: string; count: number }[];
}

const KEY = "notifier:stats";

function isAuthorized(request: Request): boolean {
    const env = getEnv();
    const auth = request.headers.get("Authorization");
    return !!env.API_SECRET && auth === `Bearer ${env.API_SECRET}`;
}

async function putHandler(request: Request): Promise<Response> {
    if (!isAuthorized(request)) {
        return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return withCors(jsonResponse({ error: "Invalid JSON" }, 400));
    }

    const b = body as Partial<NotifierStatsInternal>;
    const stats: NotifierStatsInternal = {
        lastPollAt: typeof b.lastPollAt === "string" ? b.lastPollAt : new Date().toISOString(),
        campgroundsTracked: Number(b.campgroundsTracked) || 0,
        openingsSentToday: Number(b.openingsSentToday) || 0,
        openingsSentLast7Days: Number(b.openingsSentLast7Days) || 0,
        medianLatencyMs: Number(b.medianLatencyMs) || 0,
        sampleSize: Number(b.sampleSize) || 0,
        todayKey: typeof b.todayKey === "string" ? b.todayKey : "",
        _latencyWindow: Array.isArray(b._latencyWindow) ? b._latencyWindow : undefined,
        _dailyHistory: Array.isArray(b._dailyHistory) ? b._dailyHistory : undefined,
    };

    // Skip the write when every non-timestamp field matches the stored value AND
    // lastPollAt hasn't advanced more than an hour. This conserves KV writes
    // when nothing meaningful changed (most cron cycles).
    const kv = getKv();
    const existingRaw = await kv.get(KEY);
    if (existingRaw) {
        const existing = JSON.parse(existingRaw) as NotifierStatsInternal;
        const sameNonTimestamp =
            JSON.stringify({ ...existing, lastPollAt: "" }) ===
            JSON.stringify({ ...stats, lastPollAt: "" });
        const existingMs = Date.parse(existing.lastPollAt);
        const newMs = Date.parse(stats.lastPollAt);
        const lastPollFreshEnough = Number.isFinite(existingMs) && newMs - existingMs < 60 * 60 * 1000;
        if (sameNonTimestamp && lastPollFreshEnough) {
            return withCors(jsonResponse({ ok: true, stats: existing, written: false }));
        }
    }

    const { written } = await putIfChanged(kv, KEY, JSON.stringify(stats));
    return withCors(jsonResponse({ ok: true, stats, written }));
}
export const PUT = withErrorLogging(putHandler, "PUT /api/admin/stats");
