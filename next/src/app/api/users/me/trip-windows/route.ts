import { readSession } from "@/lib/sessions";
import { jsonResponse, withCors } from "@/lib/responses";
import { withErrorLogging } from "@/lib/route-helpers";
import { getUserTripWindows, putUserTripWindows } from "@/lib/user-trip-windows";
import { validTripWindows, windowIsPast, serverTodayIso, TRIP_MAX_NIGHTS } from "@/lib/trip-windows";
import { getKv } from "@/lib/cloudflare";
import { WorkerKvAdapter } from "@/lib/recgov/worker-kv";
import type { TripWindow } from "@/types/campground";

const EMPTY = { tripWindows: [] as TripWindow[], updatedAt: null };

async function getHandler(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse(EMPTY));

    const record = await getUserTripWindows(session.email);
    return withCors(jsonResponse(record));
}
export const GET = withErrorLogging(getHandler, "GET /api/users/me/trip-windows");

async function putHandler(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return withCors(jsonResponse({ error: "Invalid JSON" }, 400));
    }

    if (
        !body ||
        typeof body !== "object" ||
        !Array.isArray((body as { tripWindows?: unknown }).tripWindows)
    ) {
        return withCors(jsonResponse({ error: "Body must include tripWindows array" }, 400));
    }

    const tripWindows = (body as { tripWindows: unknown[] }).tripWindows;
    if (!validTripWindows(tripWindows)) {
        return withCors(
            jsonResponse(
                {
                    error: `tripWindows must be valid ranges (id, YYYY-MM-DD from < to, max ${TRIP_MAX_NIGHTS} nights, label <= 80, flex 0-3 leaving >= 1 core night, max 10, unique ids)`,
                },
                400,
            ),
        );
    }

    // Prune past windows on every save.
    const todayIso = serverTodayIso();
    const pruned = (tripWindows as TripWindow[]).filter((w) => !windowIsPast(w, todayIso));

    const stored = await putUserTripWindows(session.email, pruned);

    const adapter = new WorkerKvAdapter(getKv());
    await adapter.deleteSnapshot(session.email);

    return withCors(jsonResponse(stored));
}
export const PUT = withErrorLogging(putHandler, "PUT /api/users/me/trip-windows");
