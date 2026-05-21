import { getKv } from "@/lib/cloudflare";
import { withCors } from "@/lib/responses";
import type { NotifierStats, NotifierStatsInternal } from "@/app/api/admin/stats/route";
import { withErrorLogging } from "@/lib/route-helpers";

const KEY = "notifier:stats";

// Anything older than this means the notifier hasn't actually populated stats yet.
// Returning null lets the UI fall back to its empty-state placeholders rather than
// rendering "20593 days ago".
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function devSyntheticStats(): NotifierStats {
    const now = new Date();
    return {
        lastPollAt: new Date(now.getTime() - 30_000).toISOString(),
        campgroundsTracked: 12,
        openingsSentToday: 3,
        openingsSentLast7Days: 47,
        medianLatencyMs: 9200,
        sampleSize: 18,
        todayKey: now.toISOString().slice(0, 10),
    };
}

async function getHandler(): Promise<Response> {
    const raw = (await getKv().get(KEY, "json")) as NotifierStatsInternal | null;
    const fresh =
        raw && raw.lastPollAt && Date.now() - new Date(raw.lastPollAt).getTime() < STALE_THRESHOLD_MS;

    let body: NotifierStats | null = null;
    if (fresh && raw) {
        // Strip internal rolling-computation fields before returning publicly.
        const { _latencyWindow: _lw, _dailyHistory: _dh, ...publicStats } = raw;
        void _lw;
        void _dh;
        body = publicStats;
    }

    // Dev-only synthetic data so the stats bar isn't blank when running against
    // an empty local miniflare KV.
    if (!body && process.env.NODE_ENV !== "production") {
        body = devSyntheticStats();
    }
    return withCors(
        new Response(JSON.stringify(body), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=30, s-maxage=30",
            },
        }),
    );
}
export const GET = withErrorLogging(getHandler, "GET /api/stats");
