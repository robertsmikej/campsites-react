import { getKv } from "@/lib/cloudflare";
import { withCors } from "@/lib/responses";
import type { NotifierStats } from "@/app/api/admin/stats/route";

const KEY = "notifier:stats";

const EMPTY: NotifierStats = {
    lastPollAt: new Date(0).toISOString(),
    campgroundsTracked: 0,
    openingsSentToday: 0,
    medianLatencyMs: 0,
    sampleSize: 0,
    todayKey: "",
};

export async function GET(): Promise<Response> {
    const stats = (await getKv().get(KEY, "json")) as NotifierStats | null;
    const body = stats ?? EMPTY;
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
