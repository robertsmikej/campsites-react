import { getEnv, getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";

export interface NotifierStats {
    lastPollAt: string;
    campgroundsTracked: number;
    openingsSentToday: number;
    medianLatencyMs: number;
    sampleSize: number;
    todayKey: string;
    _latencyWindow?: number[];
}

const KEY = "notifier:stats";

function isAuthorized(request: Request): boolean {
    const env = getEnv();
    const auth = request.headers.get("Authorization");
    return !!env.API_SECRET && auth === `Bearer ${env.API_SECRET}`;
}

export async function PUT(request: Request): Promise<Response> {
    if (!isAuthorized(request)) {
        return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return withCors(jsonResponse({ error: "Invalid JSON" }, 400));
    }

    const b = body as Partial<NotifierStats>;
    const stats: NotifierStats = {
        lastPollAt: typeof b.lastPollAt === "string" ? b.lastPollAt : new Date().toISOString(),
        campgroundsTracked: Number(b.campgroundsTracked) || 0,
        openingsSentToday: Number(b.openingsSentToday) || 0,
        medianLatencyMs: Number(b.medianLatencyMs) || 0,
        sampleSize: Number(b.sampleSize) || 0,
        todayKey: typeof b.todayKey === "string" ? b.todayKey : "",
        _latencyWindow: Array.isArray(b._latencyWindow) ? b._latencyWindow : undefined,
    };

    await getKv().put(KEY, JSON.stringify(stats));
    return withCors(jsonResponse({ ok: true, stats }));
}
