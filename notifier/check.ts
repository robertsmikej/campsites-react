// Campsite Availability Notifier — per-user rewire (Phase 5)
// Pulls per-user campground lists from /api/admin/notification-targets,
// deduplicates recreation.gov fetches, and emails each user about their own matches.
// Designed to run as a GitHub Actions scheduled workflow.

import { fetchMonth } from "../next/src/lib/recgov/fetch-month";
import { processCampgroundResults, getAllDatesInRange } from "../next/src/lib/recgov/match-detection";
import { RestKvAdapter } from "../next/src/lib/recgov/rest-kv";
import { fetchMonthWithCache } from "../next/src/lib/recgov/fetch-with-cache";
import { findNewMatches, generateSignature } from "./lib/diff";
import { formatEmail, sendEmail } from "./lib/email";
import { resolveNotifyScope, matchPassesScope } from "./lib/notify-scope";
import type { Campground, GlobalSettings, NotifyScope } from "../next/src/types/campground";
import type { MatchResult, SiteConfigForDiff, CampgroundResult } from "./lib/diff";
import type { SiteAvailabilityMap } from "../next/src/lib/recgov/types";
import type { AvailabilitySnapshot, SnapshotCampground } from "../next/src/lib/recgov/cache";

function buildKvAdapter(): RestKvAdapter | null {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const namespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !namespaceId || !apiToken) {
        console.warn("[KV] Cloudflare creds not configured — running without KV cache");
        return null;
    }
    return new RestKvAdapter({ accountId, namespaceId, apiToken });
}

const kvAdapter = buildKvAdapter();

const DELAY_BETWEEN_FETCHES_MS = 500;

// Non-curator users don't receive an email about a new match until this many
// milliseconds after the global first-sighting. Curators are notified immediately.
const LEAD_TIME_MS = 15 * 60 * 1000;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ── API response types ────────────────────────────────────────────────────────

interface NotifierState {
    signatures: string[];
}

interface NotificationSettings {
    enabled: boolean;
    frequencyMinutes: number;
}

interface NotificationTarget {
    email: string;
    roles?: string[];
    notifications?: NotificationSettings;
    defaultNotifyScope?: NotifyScope;
    lastNotifiedAt?: string | null;
    notifierState?: NotifierState | null;
    campgrounds: {
        "recreation.gov"?: Campground[];
    };
    globalSettings?: GlobalSettings;
}

interface NotificationTargetsResponse {
    targets: NotificationTarget[];
}

interface StateUpdate {
    email: string;
    state: NotifierState;
    lastNotifiedAt?: string;
}

interface FirstSeenMap {
    [signature: string]: string; // ISO timestamp
}

interface RecentOpening {
    signature: string;
    campgroundId: string;
    campgroundName: string;
    siteId: string;
    siteName: string;
    from: string;
    to: string;
    nights: number;
    detectedAt: string;
}

interface DailyHistoryEntry {
    date: string;
    count: number;
}

interface StatsBody {
    lastPollAt: string;
    campgroundsTracked: number;
    openingsSentToday: number;
    openingsSentLast7Days: number;
    medianLatencyMs: number;
    sampleSize: number;
    todayKey: string;
    _latencyWindow: number[];
    _dailyHistory: DailyHistoryEntry[];
}

interface PriorStats {
    todayKey?: string;
    openingsSentToday?: number;
    medianLatencyMs?: number;
    _latencyWindow?: number[];
    _dailyHistory?: DailyHistoryEntry[];
}

interface FetchPlanItem {
    campgroundId: string;
    month: string;
}

// ── Eligibility ───────────────────────────────────────────────────────────────

function isEligible(target: NotificationTarget, now: Date, forceEmail: boolean): boolean {
    if (forceEmail) return true;
    if (!target.notifications?.enabled) return false;
    const last = target.lastNotifiedAt ? new Date(target.lastNotifiedAt) : null;
    if (!last) return true;
    const elapsedMin = (now.getTime() - last.getTime()) / 60000;
    return elapsedMin >= target.notifications.frequencyMinutes;
}

// ── Dedup fetch plan ──────────────────────────────────────────────────────────

function monthsBetween(startIso: string, endIso: string): string[] {
    const start = new Date(startIso + "T00:00:00Z");
    const end = new Date(endIso + "T00:00:00Z");
    const months = new Set<string>();
    const cur = new Date(start);
    while (cur <= end) {
        const m = `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}`;
        months.add(m);
        cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
    return [...months];
}

function buildDedupedFetchPlan(targets: NotificationTarget[]): FetchPlanItem[] {
    // campgroundId → Set<"YYYY-MM">
    const ranges = new Map<string, Set<string>>();
    for (const target of targets) {
        for (const c of target.campgrounds["recreation.gov"] ?? []) {
            if (c.enabled === false) continue;
            const start = c.dates?.startDate;
            const end = c.dates?.endDate;
            if (!start || !end) continue;
            const months = monthsBetween(start, end);
            if (!ranges.has(c.id)) ranges.set(c.id, new Set());
            for (const m of months) ranges.get(c.id)!.add(m);
        }
    }
    const plan: FetchPlanItem[] = [];
    for (const [campgroundId, monthSet] of ranges) {
        for (const month of monthSet) plan.push({ campgroundId, month });
    }
    return plan;
}

// ── Fetch deduped: returns { [campgroundId]: [apiResult, ...] } across all months ──

async function fetchDeduped(plan: FetchPlanItem[]): Promise<Record<string, unknown[]>> {
    // Group months by campgroundId so we can log nicely
    const byCampground = new Map<string, string[]>();
    for (const { campgroundId, month } of plan) {
        if (!byCampground.has(campgroundId)) byCampground.set(campgroundId, []);
        byCampground.get(campgroundId)!.push(month);
    }
    for (const [id, months] of byCampground) {
        console.log(`[Fetch] Campground ${id}: ${months.length} month(s) to fetch`);
    }

    const rawByCampground: Record<string, unknown[]> = {};
    for (let i = 0; i < plan.length; i++) {
        const planEntry = plan[i];
        if (!planEntry) continue;
        const { campgroundId, month } = planEntry;
        const result = kvAdapter
            ? await fetchMonthWithCache(campgroundId, month, kvAdapter)
            : await fetchMonth(campgroundId, month);
        if (!rawByCampground[campgroundId]) rawByCampground[campgroundId] = [];
        rawByCampground[campgroundId].push(result);
        if (i < plan.length - 1) {
            await delay(DELAY_BETWEEN_FETCHES_MS);
        }
    }
    return rawByCampground;
}

// ── Snapshot write ────────────────────────────────────────────────────────────

async function writeUserSnapshot(
    target: NotificationTarget,
    syntheticResults: CampgroundResult[],
): Promise<void> {
    if (!kvAdapter) return;
    const snapshot: AvailabilitySnapshot = {
        updatedAt: new Date().toISOString(),
        campgrounds: syntheticResults.map((r): SnapshotCampground => ({
            campgroundId: r.campgroundId,
            campgroundName: r.campgroundName,
            campgroundArea: r.campgroundArea,
            campgroundDescription: r.campgroundDescription,
            sites: r.sites,
        })),
    };
    try {
        await kvAdapter.putSnapshot(target.email, snapshot);
    } catch (e) {
        console.error(`[Snapshot] put failed for ${target.email}:`, (e as Error).message);
    }
}

// ── Compute matches for a single user from pre-fetched raw API data ───────────
// Returns matches in the same shape as findNewMatches (without diff).

async function computeMatchesForUser(
    target: NotificationTarget,
    rawByCampground: Record<string, unknown[]>,
): Promise<MatchResult[]> {
    const globalSettings = target.globalSettings ?? ({} as Partial<GlobalSettings>);
    const defaultSettings = {
        stayLengths: [2, 3, 4, 5],
        validStartDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    };
    const baseSettings = {
        stayLengths: globalSettings.stayLengths ?? defaultSettings.stayLengths,
        validStartDays: globalSettings.validStartDays ?? defaultSettings.validStartDays,
    };

    // Build synthetic fetchCampground-style result objects so we can reuse findNewMatches.
    const syntheticResults: CampgroundResult[] = [];

    for (const c of target.campgrounds["recreation.gov"] ?? []) {
        if (c.enabled === false) continue;
        const start = c.dates?.startDate;
        const end = c.dates?.endDate;
        if (!start || !end) continue;

        const rawApiResults = rawByCampground[c.id];
        if (!rawApiResults) continue;

        const allDates = getAllDatesInRange(start, end);
        const effectiveSettings = {
            ...baseSettings,
            ...(c.stayLengths ? { stayLengths: c.stayLengths } : {}),
            ...(c.validStartDays ? { validStartDays: c.validStartDays } : {}),
        };

        const siteAvailability: SiteAvailabilityMap = processCampgroundResults(
            rawApiResults as Parameters<typeof processCampgroundResults>[0],
            allDates,
            effectiveSettings,
        );

        syntheticResults.push({
            campgroundId: c.id,
            campgroundName: c.name,
            campgroundArea: c.area ?? "",
            campgroundDescription: c.description ?? "",
            sites: siteAvailability,
        });
    }

    // Build a "siteConfigurations" list in the shape findNewMatches expects.
    const siteConfigurations: SiteConfigForDiff[] = (target.campgrounds["recreation.gov"] ?? []).map((c) => ({
        id: c.id,
        sites: {
            favorites: c.sites?.favorites ?? [],
            worthwhile: c.sites?.worthwhile ?? [],
        },
        notifyAll: c.notifyAll ?? false,
    }));

    // findNewMatches with an empty previousSignatures set = all current matches.
    const allMatches = findNewMatches(syntheticResults, new Set(), siteConfigurations);

    // Apply per-campground notify scope (favorites / worthwhile / all). Falls
    // back through legacy notifyAll, then the user's defaultNotifyScope.
    const scopeByCampgroundId = new Map<string, NotifyScope>();
    for (const c of target.campgrounds["recreation.gov"] ?? []) {
        scopeByCampgroundId.set(c.id, resolveNotifyScope(c, target.defaultNotifyScope));
    }
    const filtered = allMatches.filter((m) => {
        const scope = scopeByCampgroundId.get(m.campgroundId);
        if (!scope) return false;
        return matchPassesScope(m.group, scope);
    });

    await writeUserSnapshot(target, syntheticResults);

    return filtered;
}

// ── Diff per user ─────────────────────────────────────────────────────────────

// signatureForMatch wraps diff.ts's generateSignature to accept the match object shape
// that findNewMatches returns: { campgroundId, siteId, match: { from, to, nights } }
function signatureForMatch(m: MatchResult): string {
    return generateSignature(m.campgroundId, m.siteId, m.match);
}

function diffPerUser(
    matches: MatchResult[],
    priorState: NotifierState | null | undefined,
): { newMatches: MatchResult[]; nextState: NotifierState } {
    const priorSignatures = new Set(priorState?.signatures ?? []);
    const newMatches = matches.filter((m) => !priorSignatures.has(signatureForMatch(m)));
    const nextState: NotifierState = { signatures: matches.map(signatureForMatch) };
    return { newMatches, nextState };
}

// ── Send email to a single user ───────────────────────────────────────────────

async function sendEmailToUser({
    user,
    matches,
    resendApiKey,
    siteUrl,
    apiSecret,
}: {
    user: NotificationTarget;
    matches: MatchResult[];
    resendApiKey: string;
    siteUrl: string;
    apiSecret: string;
}): Promise<void> {
    const { subject, html, unsubscribeLink } = formatEmail(matches, {
        unsubscribeUrl: `${process.env.SUBSCRIBER_API_URL}/api/unsubscribe`,
        email: user.email,
        apiSecret,
        siteUrl,
    });
    console.log(`[Email] Sending to ${user.email}: "${subject}"`);
    await sendEmail(user.email, subject, html, resendApiKey, unsubscribeLink);
}

// ── First-seen map helpers ────────────────────────────────────────────────────

async function fetchFirstSeenMap(
    subscriberApiUrl: string,
    subscriberApiSecret: string,
): Promise<FirstSeenMap> {
    const res = await fetch(`${subscriberApiUrl}/api/admin/first-seen`, {
        headers: { Authorization: `Bearer ${subscriberApiSecret}` },
    });
    if (!res.ok) {
        console.error(`[Warn] first-seen GET returned ${res.status} — starting with empty map`);
        return {};
    }
    return res.json() as Promise<FirstSeenMap>;
}

async function putFirstSeenMap(
    subscriberApiUrl: string,
    subscriberApiSecret: string,
    map: FirstSeenMap,
): Promise<void> {
    const res = await fetch(`${subscriberApiUrl}/api/admin/first-seen`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${subscriberApiSecret}`,
        },
        body: JSON.stringify({ map }),
    });
    if (!res.ok) {
        console.error(`[Warn] first-seen PUT returned ${res.status}`);
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const subscriberApiUrl = process.env.SUBSCRIBER_API_URL;
    const subscriberApiSecret = process.env.SUBSCRIBER_API_SECRET;
    const resendApiKey = process.env.RESEND_API_KEY;
    const siteUrl = process.env.SITE_URL ?? "";
    const forceEmail = process.env.FORCE_EMAIL === "true";
    const now = new Date();

    if (!subscriberApiUrl || !subscriberApiSecret) {
        console.error("[Error] Missing SUBSCRIBER_API_URL or SUBSCRIBER_API_SECRET");
        process.exit(1);
    }
    if (!resendApiKey) {
        console.error("[Error] Missing RESEND_API_KEY");
        process.exit(1);
    }

    // 1. Fetch targets from the new endpoint.
    const targetsResponse = await fetch(`${subscriberApiUrl}/api/admin/notification-targets`, {
        headers: { Authorization: `Bearer ${subscriberApiSecret}` },
    });
    if (!targetsResponse.ok) {
        console.error(`[Error] notification-targets returned ${targetsResponse.status}`);
        process.exit(1);
    }
    const { targets } = (await targetsResponse.json()) as NotificationTargetsResponse;
    console.log(`[Targets] ${targets.length} users with non-empty campground lists`);

    // 2. Filter by enabled + frequency.
    const eligible = targets.filter((t) => isEligible(t, now, forceEmail));
    console.log(`[Eligible] ${eligible.length} users due for a check this cycle`);
    if (eligible.length === 0) {
        console.log("[Done] Nothing to do");
        return;
    }

    // 3. Build dedup'd fetch plan.
    const plan = buildDedupedFetchPlan(eligible);
    console.log(`[Plan] ${plan.length} unique (campground, month) fetches`);

    // 4. Fetch each (campgroundId, month) from rec.gov ONCE; accumulate raw API results per campground.
    const rawByCampground = await fetchDeduped(plan);

    // 5. Fetch the existing global first-seen map.
    const existingFirstSeenMap = await fetchFirstSeenMap(subscriberApiUrl, subscriberApiSecret);

    // 6. Compute all currently-visible match signatures across all eligible users.
    //    For each signature: record first-seen timestamp if not already present; keep existing if so.
    //    Only retain signatures still visible this cycle (stale ones drop naturally).
    //
    //    Also build a global enrichment map (sig → enriched fields) so step 9.5 can
    //    populate the recent-openings log without re-walking per-user data.
    const newFirstSeenMap: FirstSeenMap = {};
    const globalMatchesBySig: Record<string, Omit<RecentOpening, "signature" | "detectedAt">> = {};
    for (const target of eligible) {
        const userMatches = await computeMatchesForUser(target, rawByCampground);
        for (const m of userMatches) {
            const sig = signatureForMatch(m);
            if (!newFirstSeenMap[sig]) {
                newFirstSeenMap[sig] = existingFirstSeenMap[sig] ?? now.toISOString();
            }
            if (!globalMatchesBySig[sig]) {
                globalMatchesBySig[sig] = {
                    campgroundId: m.campgroundId,
                    campgroundName: m.campgroundName,
                    siteId: m.siteId,
                    siteName: m.siteName,
                    from: m.match.from,
                    to: m.match.to,
                    nights: m.match.nights,
                };
            }
        }
    }

    // 7. Per user: apply lead-time filter (non-curators only), diff against their state.
    const updates: StateUpdate[] = [];
    // Tracks latency (ms from first-seen to email-sent) for each match emailed this cycle.
    const sentLatenciesMs: number[] = [];
    for (const target of eligible) {
        const userMatches = await computeMatchesForUser(target, rawByCampground);
        const isCurator = (target.roles ?? []).includes("curator");

        // Apply curator lead-time: non-curators only see matches whose global first-sighting
        // is at least LEAD_TIME_MS in the past. This filter runs BEFORE the diff so that a
        // match that hasn't elapsed lead-time doesn't silently land in the user's prior state.
        const visible = isCurator
            ? userMatches
            : userMatches.filter((m) => {
                  const sig = signatureForMatch(m);
                  const firstSeen = newFirstSeenMap[sig];
                  if (!firstSeen) return false; // defensive; shouldn't happen
                  return now.getTime() - new Date(firstSeen).getTime() >= LEAD_TIME_MS;
              });

        const priorState = target.notifierState ?? null;
        const isFirstRun = priorState === null;
        const { newMatches, nextState } = diffPerUser(visible, priorState);

        if (isFirstRun && !forceEmail) {
            console.log(`[${target.email}] first run — seeding state, no email`);
            updates.push({ email: target.email, state: nextState, lastNotifiedAt: now.toISOString() });
            continue;
        }

        if (newMatches.length === 0) {
            console.log(`[${target.email}] 0 new matches`);
            updates.push({ email: target.email, state: nextState });
            continue;
        }

        console.log(`[${target.email}] ${newMatches.length} new match(es) — sending email`);
        try {
            const sentAtMs = Date.now();
            await sendEmailToUser({
                user: target,
                matches: newMatches,
                resendApiKey,
                siteUrl,
                apiSecret: subscriberApiSecret,
            });
            // Record latency for each match in this email.
            for (const m of newMatches) {
                const sig = signatureForMatch(m);
                const firstSeenIso = newFirstSeenMap[sig];
                if (firstSeenIso) {
                    sentLatenciesMs.push(sentAtMs - new Date(firstSeenIso).getTime());
                }
            }
            updates.push({ email: target.email, state: nextState, lastNotifiedAt: now.toISOString() });
        } catch (err) {
            console.error(`[${target.email}] email send failed: ${(err as Error).message}`);
            updates.push({ email: target.email, state: nextState });
        }
    }

    // 8. Push state back to the API.
    const stateResponse = await fetch(`${subscriberApiUrl}/api/admin/notifier-state`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${subscriberApiSecret}`,
        },
        body: JSON.stringify({ updates }),
    });
    if (!stateResponse.ok) {
        console.error(`[Warn] notifier-state PUT returned ${stateResponse.status}`);
    } else {
        const result = (await stateResponse.json()) as { updated: number };
        console.log(`[Done] Updated state for ${result.updated} user(s)`);
    }

    // 9. Persist the updated first-seen map (pruned to only currently-visible signatures).
    await putFirstSeenMap(subscriberApiUrl, subscriberApiSecret, newFirstSeenMap);

    // 9.5: Maintain recent-openings log.
    // Fetch the prior log from the public endpoint (no auth needed, falls back to []).
    const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
    const recentResp = await fetch(`${subscriberApiUrl}/api/openings/recent`).catch(() => null);
    const priorRecent: RecentOpening[] =
        recentResp && recentResp.ok ? ((await recentResp.json()) as RecentOpening[]) : [];

    // Prune entries older than 24h.
    const recent = priorRecent.filter(
        (r) => r.detectedAt && Date.now() - new Date(r.detectedAt).getTime() < RECENT_WINDOW_MS,
    );
    const existingSigs = new Set(recent.map((r) => r.signature));

    // Add any signature in the current first-seen map that isn't already in the
    // recent log and was first seen within the 24-hour retention window.
    // existingSigs is the real de-dupe mechanism; the timestamp filter only enforces retention.
    for (const [sig, firstSeen] of Object.entries(newFirstSeenMap)) {
        if (existingSigs.has(sig)) continue;
        const firstSeenMs = new Date(firstSeen).getTime();
        if (Date.now() - firstSeenMs > RECENT_WINDOW_MS) continue;
        const enriched = globalMatchesBySig[sig];
        if (!enriched) continue;
        recent.push({ signature: sig, ...enriched, detectedAt: firstSeen });
    }

    // Sort descending by detectedAt; keep at most 200 entries.
    recent.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
    const trimmedRecent = recent.slice(0, 200);

    try {
        const recentPutResp = await fetch(`${subscriberApiUrl}/api/admin/openings/recent`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${subscriberApiSecret}`,
            },
            body: JSON.stringify(trimmedRecent),
        });
        if (!recentPutResp.ok) {
            console.error(`[Warn] /api/admin/openings/recent PUT returned ${recentPutResp.status}`);
        } else {
            console.log(
                `[Recent] ${trimmedRecent.length} entries in log (${recent.length - priorRecent.filter((r) => r.detectedAt && Date.now() - new Date(r.detectedAt).getTime() < RECENT_WINDOW_MS).length} new this cycle)`,
            );
        }
    } catch (err) {
        console.error(`[Warn] /api/admin/openings/recent PUT failed: ${(err as Error).message}`);
    }

    // 10. Compute and PUT stats.
    const todayKeyUtc = now.toISOString().slice(0, 10); // "YYYY-MM-DD" UTC

    // Campgrounds tracked: unique campground IDs across ALL targets (not just eligible),
    // matching only enabled entries. Gives a stable "currently watched" count each cycle.
    const trackedIds = new Set<string>();
    for (const t of targets) {
        for (const c of t.campgrounds["recreation.gov"] ?? []) {
            if (c.enabled === false) continue;
            if (c.id) trackedIds.add(c.id);
        }
    }

    // Read prior stats so we can accumulate the daily counter and the latency window.
    let priorStats: PriorStats | null = null;
    try {
        const priorStatsResponse = await fetch(`${subscriberApiUrl}/api/stats`);
        if (priorStatsResponse.ok) {
            priorStats = (await priorStatsResponse.json()) as PriorStats;
        }
    } catch (err) {
        console.error(`[Warn] Could not fetch prior stats: ${(err as Error).message}`);
    }

    // Daily counter: reset to 0 if the date has rolled over; otherwise accumulate.
    const priorOpenings =
        priorStats?.todayKey === todayKeyUtc ? Number(priorStats.openingsSentToday) || 0 : 0;
    const openingsSentToday = priorOpenings + sentLatenciesMs.length;

    // Daily history for the rolling 7-day window.
    const priorHistory = Array.isArray(priorStats?._dailyHistory) ? priorStats._dailyHistory : [];
    const dailyHistory = updateDailyHistory(priorHistory, todayKeyUtc, openingsSentToday);
    const openingsSentLast7Days = dailyHistory.reduce((acc, entry) => acc + (Number(entry.count) || 0), 0);

    // Latency window: carry forward up to 200 prior samples, then append this cycle's.
    const priorWindow =
        priorStats?.todayKey === todayKeyUtc && Array.isArray(priorStats._latencyWindow)
            ? priorStats._latencyWindow.slice(-200)
            : [];
    const latencyWindow = [...priorWindow, ...sentLatenciesMs].slice(-200);

    // Compute median.
    const sortedLatencies = [...latencyWindow].sort((a, b) => a - b);
    const medianLatencyMs =
        sortedLatencies.length === 0
            ? Number(priorStats?.medianLatencyMs) || 0
            : sortedLatencies.length % 2 === 1
              ? (sortedLatencies[(sortedLatencies.length - 1) / 2] ?? 0)
              : Math.round(
                    ((sortedLatencies[sortedLatencies.length / 2 - 1] ?? 0) +
                        (sortedLatencies[sortedLatencies.length / 2] ?? 0)) /
                        2,
                );

    const statsBody: StatsBody = {
        lastPollAt: now.toISOString(),
        campgroundsTracked: trackedIds.size,
        openingsSentToday,
        openingsSentLast7Days,
        medianLatencyMs,
        sampleSize: sortedLatencies.length,
        todayKey: todayKeyUtc,
        _latencyWindow: latencyWindow,
        _dailyHistory: dailyHistory,
    };

    try {
        const statsResponse = await fetch(`${subscriberApiUrl}/api/admin/stats`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${subscriberApiSecret}`,
            },
            body: JSON.stringify(statsBody),
        });
        if (!statsResponse.ok) {
            console.error(`[Warn] /api/admin/stats PUT returned ${statsResponse.status}`);
        } else {
            console.log(
                `[Stats] ${trackedIds.size} cgs tracked, ${sentLatenciesMs.length} sent this cycle, ${openingsSentLast7Days} last 7d, ${medianLatencyMs}ms median`,
            );
        }
    } catch (err) {
        console.error(`[Warn] /api/admin/stats PUT failed: ${(err as Error).message}`);
    }
}

// Returns a new daily-history array with today's entry updated/inserted and
// any entries older than 7 days dropped.
function updateDailyHistory(
    prior: DailyHistoryEntry[],
    todayKey: string,
    todayCount: number,
): DailyHistoryEntry[] {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const todayMs = new Date(todayKey + "T00:00:00Z").getTime();
    const cutoff = todayMs - SEVEN_DAYS_MS;
    const filtered = (prior ?? [])
        .filter((entry) => {
            if (!entry || typeof entry.date !== "string") return false;
            const entryMs = new Date(entry.date + "T00:00:00Z").getTime();
            if (!Number.isFinite(entryMs)) return false;
            return entryMs >= cutoff && entry.date !== todayKey;
        })
        .map((entry) => ({ date: entry.date, count: Number(entry.count) || 0 }));
    filtered.push({ date: todayKey, count: Number(todayCount) || 0 });
    filtered.sort((a, b) => a.date.localeCompare(b.date));
    return filtered;
}

main().catch((err) => {
    console.error("[Fatal]", err);
    process.exit(1);
});
