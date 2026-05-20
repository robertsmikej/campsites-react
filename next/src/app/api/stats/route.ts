import { getKv } from "@/lib/cloudflare";
import { withCors } from "@/lib/responses";
import type { NotifierStats } from "@/app/api/admin/stats/route";

const KEY = "notifier:stats";

// Anything older than this means the notifier hasn't actually populated stats yet.
// Returning null lets the UI fall back to its empty-state placeholders rather than
// rendering "20593 days ago".
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export async function GET(): Promise<Response> {
    const stats = (await getKv().get(KEY, "json")) as NotifierStats | null;
    const fresh =
        stats &&
        stats.lastPollAt &&
        Date.now() - new Date(stats.lastPollAt).getTime() < STALE_THRESHOLD_MS;
    const body = fresh ? stats : null;
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
