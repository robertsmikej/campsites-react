import { getEnv, getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { withErrorLogging } from "@/lib/route-helpers";
import { putIfChanged } from "@/lib/kv-utils";
import { mergeNotifierSites, TRIP_COOLDOWN_MS, type NotifierSites } from "@/lib/notifier-state-merge";

interface UpdateEntry {
    email: string;
    state: unknown;
    lastNotifiedAt?: string;
}

function isValidBody(body: unknown): body is { updates: UpdateEntry[] } {
    if (!body || typeof body !== "object") return false;
    const updates = (body as { updates?: unknown }).updates;
    if (!Array.isArray(updates)) return false;
    return updates.every((u) => {
        if (!u || typeof u !== "object") return false;
        if (typeof (u as { email?: unknown }).email !== "string") return false;
        // `state` can be anything (including null or undefined); we just persist it.
        return true;
    });
}

// The later of two ISO timestamps; unparseable or missing values lose.
function latestTimestamp(a: string | undefined, b: string | undefined): string | undefined {
    const aMs = a ? Date.parse(a) : NaN;
    const bMs = b ? Date.parse(b) : NaN;
    if (Number.isNaN(aMs)) return Number.isNaN(bMs) ? undefined : b;
    if (Number.isNaN(bMs)) return a;
    return bMs > aMs ? b : a;
}

async function putHandler(request: Request): Promise<Response> {
    const env = getEnv();
    if (!env.API_SECRET) {
        return withCors(jsonResponse({ error: "Server misconfigured: API_SECRET not set" }, 500));
    }
    const auth = request.headers.get("Authorization");
    if (!auth || auth !== `Bearer ${env.API_SECRET}`) {
        return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return withCors(jsonResponse({ error: "Invalid JSON" }, 400));
    }
    if (!isValidBody(body)) {
        return withCors(jsonResponse({ error: "Body must include updates: UpdateEntry[]" }, 400));
    }

    const kv = getKv();
    const nowMs = Date.now();
    let updated = 0;
    let written = 0;
    for (const entry of body.updates) {
        const key = `user:${entry.email}:notifier-state`;
        // Merge incoming ranges into whatever is currently stored rather than
        // overwriting. Cron runs overlap (each takes longer than the 1-min
        // cadence), so a run that didn't re-fetch a campground this cycle must
        // not erase that campground's alerted ranges — clobbering them dropped
        // the dedup record and re-sent duplicate emails. Ranges only leave by
        // aging past the cooldown. See lib/notifier-state-merge.ts.
        const existing = (await kv.get(key, "json")) as {
            sites?: NotifierSites;
            groups?: NotifierSites;
            trips?: NotifierSites;
            lastNotifiedAt?: string;
        } | null;
        const incoming = (entry.state ?? {}) as {
            sites?: NotifierSites;
            groups?: NotifierSites;
            trips?: NotifierSites;
        };
        const sites = mergeNotifierSites(existing?.sites, incoming.sites, nowMs);
        // The adjacent-group dedup bucket has the same shape as `sites`
        // (key -> SeenRange[]) and the same overlapping-cron clobber risk, so it
        // gets the identical merge. Dropping it here meant group cooldown state
        // never persisted, so the same adjacent-site email re-sent every cycle.
        const groups = mergeNotifierSites(existing?.groups, incoming.groups, nowMs);
        // Trip-match bucket: same shape again, but a 6h cooldown. The age-out IS
        // the re-alert cadence (still-open trip sites re-fire when their range
        // expires here), so do not "fix" this to the 24h cooldown.
        const trips = mergeNotifierSites(existing?.trips, incoming.trips, nowMs, TRIP_COOLDOWN_MS);
        const nextBlob: {
            sites: NotifierSites;
            groups?: NotifierSites;
            trips?: NotifierSites;
            lastNotifiedAt?: string;
        } = { sites };
        if (Object.keys(groups).length > 0) nextBlob.groups = groups;
        if (Object.keys(trips).length > 0) nextBlob.trips = trips;
        // lastNotifiedAt lives in this notifier-owned blob, not the user profile.
        // Writing it to the profile was a read-modify-write across KV colos that
        // could resurrect a setting the user had just changed (e.g. re-enable
        // notifications they turned off). Only ever advance it, so a stale
        // concurrent write can't move it backward and re-open eligibility.
        const advanced = latestTimestamp(existing?.lastNotifiedAt, entry.lastNotifiedAt);
        if (advanced) nextBlob.lastNotifiedAt = advanced;
        const result = await putIfChanged(kv, key, JSON.stringify(nextBlob));
        if (result.written) written++;
        updated++;
    }

    return withCors(jsonResponse({ updated, written }));
}
export const PUT = withErrorLogging(putHandler, "PUT /api/admin/notifier-state");
