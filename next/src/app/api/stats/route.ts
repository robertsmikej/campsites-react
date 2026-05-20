import { getKv } from "@/lib/cloudflare";
import { withCors } from "@/lib/responses";
import type { NotifierStats } from "@/app/api/admin/stats/route";

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

export async function GET(): Promise<Response> {
    const stats = (await getKv().get(KEY, "json")) as NotifierStats | null;
    const fresh =
        stats &&
        stats.lastPollAt &&
        Date.now() - new Date(stats.lastPollAt).getTime() < STALE_THRESHOLD_MS;
    let body: NotifierStats | null = fresh ? stats : null;
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
