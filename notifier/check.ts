// Campsite Availability Notifier — per-user rewire (Phase 5)
// Pulls per-user campground lists from /api/admin/notification-targets,
// deduplicates recreation.gov fetches, and emails each user about their own matches.
// Designed to run as a GitHub Actions scheduled workflow.

import { stayOverlapsBlackout } from "../next/src/lib/blackout";
import { processCampgroundResults, getAllDatesInRange } from "../next/src/lib/recgov/match-detection";
import { IGNORE_CAMPSITE_TYPES } from "../next/src/lib/recgov/types";
import { RestKvAdapter } from "../next/src/lib/recgov/rest-kv";
import { fetchProducedNoData } from "../next/src/lib/recgov/raw-results";
import { findAdjacentGroups, type AdjacentGroup, type AdjacencySite } from "../next/src/lib/adjacent-groups";
import { getSiteDetailsCached, type KvLike } from "../next/src/lib/site-details-cache";
import { findNewMatches, generateSignature } from "./lib/diff";
import { formatEmail, sendEmail } from "./lib/email";
import { resolveNotifyScope, matchPassesScope } from "./lib/notify-scope";
import {
    buildFastLanePlan,
    buildSweepPlan,
    buildNotifyPlan,
    readCachedMonths,
    fetchToCache,
} from "./fetch-jobs";
import { acquireSweepLock, type LockKv } from "./sweep-lock";
import type { Campground, GlobalSettings, NotifyScope } from "../next/src/types/campground";
import type { MatchResult, SiteConfigForDiff, CampgroundResult } from "./lib/diff";
import type { SiteAvailabilityMap } from "../next/src/lib/recgov/types";
import type { AvailabilitySnapshot, SnapshotCampground } from "../next/src/lib/recgov/cache";
import type { KvAdapter } from "../next/src/lib/recgov/cache";

export interface RunConfig {
    subscriberApiUrl: string;
    subscriberApiSecret: string;
    resendApiKey: string;
    siteUrl: string;
    forceEmail: boolean;
    dryRun: boolean;
    kvAdapter: KvAdapter | null;
    now: Date;
}

export function buildKvAdapter(): RestKvAdapter | null {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const namespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !namespaceId || !apiToken) {
        console.warn("[KV] Cloudflare creds not configured — running without KV cache");
        return null;
    }
    return new RestKvAdapter({ accountId, namespaceId, apiToken });
}

let kvAdapter: KvAdapter | null = null;

// getSiteDetailsCached needs the raw getJson/put KvLike surface, which RestKvAdapter
// exposes but the cache-only KvAdapter interface (and the test stub) does not. Return
// the adapter typed as KvLike only when it actually implements those methods, so geo
// enrichment degrades to number-fallback adjacency instead of crashing.
function kvAsKvLike(kv: KvAdapter | null): KvLike | null {
    if (
        kv &&
        typeof (kv as Partial<KvLike>).getJson === "function" &&
        typeof (kv as Partial<KvLike>).put === "function"
    ) {
        return kv as unknown as KvLike;
    }
    return null;
}

// Non-curator users don't receive an email about a new match until this many
// milliseconds after the global first-sighting. Curators are notified immediately.
const LEAD_TIME_MS = 15 * 60 * 1000;

// Once an opening (exact signature) has been emailed, suppress re-alerting it for
// this long after it was last seen. This is the dedup cooldown: it stops the same
// opening from re-sending every cycle and absorbs brief disappear→reappear flicker,
// while still re-alerting if the opening genuinely frees up again a day+ later.
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

// ── API response types ────────────────────────────────────────────────────────

interface NotifierState {
    /** site key ("campgroundId:siteId") -> alerted date ranges, each with the ISO
     *  time it was last seen. Overlapping windows at a site are merged into one
     *  range, so a window shrinking/growing/shifting (e.g. Jun13–18 -> Jun14–18)
     *  counts as the same opening and isn't re-alerted. Retained until the range
     *  ages past the cooldown, then pruned. */
    sites?: Record<string, Array<{ from: string; to: string; seen: string }>>;
    /** group key ("campgroundId:sortedSiteIds") -> alerted windows with last-seen ISO.
     *  Separate bucket from `sites` so adjacent-group dedup is independent of per-site dedup. */
    groups?: Record<string, Array<{ from: string; to: string; seen: string }>>;
    /** @deprecated v1 cooldown shape (signature -> last-seen ISO); migrated on read. */
    notified?: Record<string, string>;
    /** @deprecated original shape (currently-visible signatures); migrated on read. */
    signatures?: string[];
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
    /** Verified alert-delivery override. Absent = deliver to the account email. */
    notificationEmail?: string;
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

// ── Eligibility ───────────────────────────────────────────────────────────────

function isEligible(target: NotificationTarget, now: Date, forceEmail: boolean): boolean {
    if (forceEmail) return true;
    if (!target.notifications?.enabled) return false;
    const last = target.lastNotifiedAt ? new Date(target.lastNotifiedAt) : null;
    if (!last) return true;
    const elapsedMin = (now.getTime() - last.getTime()) / 60000;
    return elapsedMin >= target.notifications.frequencyMinutes;
}

// ── Snapshot write ────────────────────────────────────────────────────────────

async function writeUserSnapshot(
    target: NotificationTarget,
    syntheticResults: CampgroundResult[],
    failedCampgroundIds: Set<string>,
): Promise<void> {
    if (!kvAdapter) return;
    const cgById = new Map<string, Campground>();
    for (const cg of target.campgrounds["recreation.gov"] ?? []) {
        cgById.set(cg.id, cg);
    }

    // Last-good snapshot, so we can carry forward campgrounds whose fetch failed
    // this cycle instead of clobbering them with totalSitesCount: 0.
    const prior = await kvAdapter.getSnapshot(target.email).catch(() => null);
    const priorById = new Map<string, SnapshotCampground>((prior?.campgrounds ?? []).map((c) => [c.id, c]));

    const campgrounds: SnapshotCampground[] = [];
    const emitted = new Set<string>();
    for (const r of syntheticResults) {
        const cg = cgById.get(r.campgroundId);
        if (!cg) continue;
        const totalSitesCount = Object.keys(r.sites).length;
        const sitesWithMatches: typeof r.sites = {};
        for (const [siteId, site] of Object.entries(r.sites)) {
            if (site.matches && site.matches.length > 0) {
                sitesWithMatches[siteId] = site;
            }
        }
        campgrounds.push({
            ...cg,
            siteAvailability: sitesWithMatches,
            totalSitesCount,
        });
        emitted.add(r.campgroundId);
    }

    // For campgrounds whose fetch produced no data this cycle, carry forward the
    // last-good entry rather than writing a misleading totalSitesCount: 0. A
    // brand-new campground with no prior entry is simply omitted until a fetch
    // succeeds (the dashboard's on-demand rebuild also fills it).
    for (const id of failedCampgroundIds) {
        if (emitted.has(id)) continue;
        const priorEntry = priorById.get(id);
        if (priorEntry) {
            campgrounds.push(priorEntry);
            emitted.add(id);
        }
    }

    const snapshot: AvailabilitySnapshot = {
        updatedAt: new Date().toISOString(),
        campgrounds,
    };
    try {
        await kvAdapter.putSnapshot(target.email, snapshot);
    } catch (e) {
        console.error(`[Snapshot] put failed for ${target.email}:`, (e as Error).message);
    }
}

// Reconstruct open nights per site name from the RAW month results. The processed
// SiteAvailabilityMap can't be used because processCampgroundResults deletes each
// site's `dates` after computing matches. Keyed by campsite.site (the site NAME),
// which equals AdjacencySite.id / SiteDetail.id. Mirrors Task 6's availability route.
function availableNightsByNameFromRaw(
    rawApiResults: unknown[] | undefined,
    allDates: string[],
): Record<string, string[]> {
    if (!rawApiResults) return {};
    const out: Record<string, string[]> = {};
    for (const raw of rawApiResults as Array<{
        campsites?: Record<
            string,
            { site: string; campsite_type: string; availabilities: Record<string, string> }
        >;
    }>) {
        if (!raw?.campsites) continue;
        for (const siteData of Object.values(raw.campsites)) {
            if (IGNORE_CAMPSITE_TYPES.includes(siteData.campsite_type)) continue;
            const name = siteData.site;
            if (!out[name]) out[name] = [];
            const validDates = Object.entries(siteData.availabilities)
                .filter(([, status]) => status === "Available")
                .map(([date]) => date.split("T")[0] ?? "")
                .filter((date) => allDates.includes(date));
            (out[name] as string[]).push(...validDates);
        }
    }
    return out;
}

// ── Compute matches for a single user from pre-fetched raw API data ───────────
// Returns matches in the same shape as findNewMatches (without diff), plus the
// adjacent-site groups detected across the user's campgrounds and a campgroundId ->
// name map for labeling the email's group section.

interface ComputedUserResults {
    matches: MatchResult[];
    groups: AdjacentGroup[];
    campgroundNamesById: Record<string, string>;
}

async function computeMatchesForUser(
    target: NotificationTarget,
    rawByCampground: Record<string, unknown[]>,
): Promise<ComputedUserResults> {
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
    // Campgrounds whose rec.gov fetch produced no data this cycle. Their snapshot
    // entry is carried forward from last-good instead of zeroed out.
    const failedCampgroundIds = new Set<string>();
    // Adjacent-site groups across all of this user's campgrounds, plus the name map.
    const groups: AdjacentGroup[] = [];
    const campgroundNamesById: Record<string, string> = {};

    for (const c of target.campgrounds["recreation.gov"] ?? []) {
        if (c.enabled === false) continue;
        const start = c.dates?.startDate;
        const end = c.dates?.endDate;
        if (!start || !end) continue;

        const rawApiResults = rawByCampground[c.id];
        if (fetchProducedNoData(rawApiResults)) {
            failedCampgroundIds.add(c.id);
            continue;
        }

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

        // Adjacent-group detection (only when the campground opts in). Coordinates
        // come from the cached site-details; if KV is unavailable or returns nothing,
        // synthesize coordless AdjacencySites from the availability site names so the
        // number-fallback adjacency still works.
        if (c.adjacencyAnchor) {
            const availableNightsByName = availableNightsByNameFromRaw(rawApiResults, allDates);
            let sitesForGraph: AdjacencySite[] = [];
            const kvLike = kvAsKvLike(kvAdapter);
            if (kvLike) {
                const details = await getSiteDetailsCached(c.id, kvLike).catch(() => []);
                sitesForGraph = details.map((d) => ({
                    id: d.id,
                    lat: d.lat,
                    lng: d.lng,
                    ...(d.loop ? { loop: d.loop } : {}),
                }));
            }
            if (sitesForGraph.length === 0) {
                sitesForGraph = Object.keys(availableNightsByName).map((id) => ({
                    id,
                    lat: null,
                    lng: null,
                }));
            }
            const blackoutDates = target.globalSettings?.blackoutDates;
            const cgGroups = findAdjacentGroups({
                campgroundId: c.id,
                sites: sitesForGraph,
                availableNightsByName,
                tiers: { favorites: c.sites?.favorites ?? [], worthwhile: c.sites?.worthwhile ?? [] },
                settings: {
                    stayLengths: effectiveSettings.stayLengths,
                    validStartDays: effectiveSettings.validStartDays,
                    ...(blackoutDates ? { blackoutDates } : {}),
                },
                anchorScope: c.adjacencyAnchor,
            });
            if (cgGroups.length > 0) {
                groups.push(...cgGroups);
                campgroundNamesById[c.id] = c.name;
            }
        }
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

    // Blackout suppression: don't email stays whose nights overlap the user's
    // blackout dates. Views still show everything (snapshot receives syntheticResults,
    // not sendable), so only email delivery is gated here.
    const blackouts = target.globalSettings?.blackoutDates;
    const sendable = blackouts?.length
        ? filtered.filter((m) => !stayOverlapsBlackout(m.match.from, m.match.to, blackouts))
        : filtered;

    await writeUserSnapshot(target, syntheticResults, failedCampgroundIds);

    return { matches: sendable, groups, campgroundNamesById };
}

// ── Diff per user ─────────────────────────────────────────────────────────────

// signatureForMatch wraps diff.ts's generateSignature to accept the match object shape
// that findNewMatches returns: { campgroundId, siteId, match: { from, to, nights } }
function signatureForMatch(m: MatchResult): string {
    return generateSignature(m.campgroundId, m.siteId, m.match);
}

interface SeenRange {
    from: string;
    to: string;
    seen: number; // ms
}

// Half-open [from, to) overlap on ISO date strings (lexicographic compare works).
function rangesOverlap(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
    return aFrom < bTo && bFrom < aTo;
}

function siteKeyOf(m: MatchResult): string {
    return `${m.campgroundId}:${m.siteId}`;
}

// Parse an exact signature "campgroundId:siteId:from:to:nights" into site key + range.
// from/to are ISO dates (no colons), so a plain split is safe.
function parseSig(sig: string): { siteKey: string; from: string; to: string } | null {
    const p = sig.split(":");
    if (p.length < 5) return null;
    return { siteKey: `${p[0]}:${p[1]}`, from: p[2]!, to: p[3]! };
}

// Merge overlapping ranges into consolidated spans, keeping the latest `seen`.
function mergeRanges(ranges: SeenRange[]): SeenRange[] {
    const sorted = [...ranges].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
    const out: SeenRange[] = [];
    for (const r of sorted) {
        const last = out[out.length - 1];
        if (last && r.from < last.to) {
            if (r.to > last.to) last.to = r.to;
            if (r.seen > last.seen) last.seen = r.seen;
        } else {
            out.push({ ...r });
        }
    }
    return out;
}

// Overlap-aware persistent dedup. An opening is emailed only when its date window
// overlaps NO already-alerted window for that site (within the cooldown). So a
// window shifting/shrinking/growing (Jun13–18 -> Jun14–18) is one opening, and a
// still-open or flickering one isn't re-alerted. A genuinely separate date window
// at the same site (e.g. a July opening) still alerts. Ranges are pruned once they
// age past the cooldown.
export function diffPerUser(
    matches: MatchResult[],
    priorState: NotifierState | null | undefined,
    nowMs: number,
    cooldownMs: number = COOLDOWN_MS,
): { newMatches: MatchResult[]; nextState: NotifierState } {
    const cutoff = nowMs - cooldownMs;

    // Prior alerted ranges per site (within cooldown), migrating older state shapes.
    const prior: Record<string, SeenRange[]> = {};
    const addPrior = (siteKey: string, from: string, to: string, seenMs: number) => {
        if (Number.isNaN(seenMs) || seenMs <= cutoff) return;
        (prior[siteKey] ??= []).push({ from, to, seen: seenMs });
    };
    if (priorState?.sites) {
        for (const [siteKey, ranges] of Object.entries(priorState.sites))
            for (const r of ranges) addPrior(siteKey, r.from, r.to, Date.parse(r.seen));
    } else if (priorState?.notified) {
        for (const [sig, iso] of Object.entries(priorState.notified)) {
            const ps = parseSig(sig);
            if (ps) addPrior(ps.siteKey, ps.from, ps.to, Date.parse(iso));
        }
    } else if (priorState?.signatures) {
        for (const sig of priorState.signatures) {
            const ps = parseSig(sig);
            if (ps) addPrior(ps.siteKey, ps.from, ps.to, nowMs);
        }
    }

    // Group current matches per site; process earliest-arrival, longest-stay first
    // so the representative alert for an opening is the fullest window.
    const currentBySite: Record<string, MatchResult[]> = {};
    for (const m of matches) (currentBySite[siteKeyOf(m)] ??= []).push(m);
    for (const list of Object.values(currentBySite))
        list.sort((a, b) => a.match.from.localeCompare(b.match.from) || b.match.nights - a.match.nights);

    // A current match is new if it overlaps no already-alerted range for its site
    // (prior within cooldown, or one accepted earlier this cycle — collapses the
    // multiple stay-length permutations of one opening into a single alert).
    const newMatches: MatchResult[] = [];
    for (const [siteKey, list] of Object.entries(currentBySite)) {
        const known: SeenRange[] = [...(prior[siteKey] ?? [])];
        for (const m of list) {
            const { from, to } = m.match;
            if (known.some((r) => rangesOverlap(r.from, r.to, from, to))) continue;
            newMatches.push(m);
            known.push({ from, to, seen: nowMs });
        }
    }

    // Next state: merge prior (within cooldown) with all currently-visible ranges
    // (seen = now). Visible openings refresh their last-seen; gone-but-recent ones
    // are retained until they age past the cooldown.
    const sites: NonNullable<NotifierState["sites"]> = {};
    const siteKeys = new Set([...Object.keys(prior), ...Object.keys(currentBySite)]);
    for (const siteKey of siteKeys) {
        const ranges: SeenRange[] = [...(prior[siteKey] ?? [])];
        for (const m of currentBySite[siteKey] ?? [])
            ranges.push({ from: m.match.from, to: m.match.to, seen: nowMs });
        const merged = mergeRanges(ranges).filter((r) => r.seen > cutoff);
        if (merged.length)
            sites[siteKey] = merged.map((r) => ({
                from: r.from,
                to: r.to,
                seen: new Date(r.seen).toISOString(),
            }));
    }

    return { newMatches, nextState: { sites } };
}

// ── Adjacent-group dedup ───────────────────────────────────────────────────────

// A group is keyed by its campground plus its sorted site ids, so the same set of
// adjacent sites is one opening regardless of detection order. Mirrors diffPerUser's
// window-overlap-within-cooldown semantics, keyed by group instead of site.
const groupKey = (g: AdjacentGroup): string => `${g.campgroundId}:${[...g.siteIds].sort().join(",")}`;

export function diffGroupsWithCooldown(
    currentGroups: AdjacentGroup[],
    priorState: { groups?: NotifierState["groups"] } | null | undefined,
    nowMs: number,
    cooldownMs: number = COOLDOWN_MS,
): { newGroups: AdjacentGroup[]; nextGroupState: NonNullable<NotifierState["groups"]> } {
    const cutoff = nowMs - cooldownMs;
    const prior = priorState?.groups ?? {};
    const seenIso = new Date(nowMs).toISOString();

    // Prior alerted windows per key still within cooldown.
    const priorByKey = new Map<string, Array<{ from: string; to: string }>>();
    for (const [key, ranges] of Object.entries(prior)) {
        const fresh = ranges.filter((r) => new Date(r.seen).getTime() >= cutoff);
        if (fresh.length)
            priorByKey.set(
                key,
                fresh.map((r) => ({ from: r.from, to: r.to })),
            );
    }

    const overlaps = (a: { from: string; to: string }, b: { from: string; to: string }) =>
        a.from < b.to && b.from < a.to;

    const newGroups: AdjacentGroup[] = [];
    const next: NonNullable<NotifierState["groups"]> = {};
    for (const g of currentGroups) {
        const key = groupKey(g);
        const priorRanges = priorByKey.get(key) ?? [];
        const isNew = !priorRanges.some((r) => overlaps(r, g));
        if (isNew) newGroups.push(g);
        (next[key] ??= []).push({ from: g.from, to: g.to, seen: seenIso });
    }
    // Retain prior fresh windows not re-seen this cycle.
    for (const [key, ranges] of priorByKey.entries()) {
        const merged = next[key] ?? (next[key] = []);
        for (const r of ranges) {
            if (!merged.some((m) => m.from === r.from && m.to === r.to)) {
                merged.push({ ...r, seen: seenIso });
            }
        }
    }
    return { newGroups, nextGroupState: next };
}

// ── Send email to a single user ───────────────────────────────────────────────

async function sendEmailToUser({
    user,
    matches,
    groups = [],
    campgroundNamesById = {},
    resendApiKey,
    siteUrl,
    apiSecret,
    subscriberApiUrl,
}: {
    user: NotificationTarget;
    matches: MatchResult[];
    groups?: AdjacentGroup[];
    campgroundNamesById?: Record<string, string>;
    resendApiKey: string;
    siteUrl: string;
    apiSecret: string;
    subscriberApiUrl: string;
}): Promise<void> {
    const { subject, html, unsubscribeLink } = formatEmail(matches, {
        unsubscribeUrl: `${subscriberApiUrl}/api/unsubscribe`,
        email: user.email,
        apiSecret,
        siteUrl,
        ...(groups.length > 0 ? { adjacentGroups: groups, campgroundNamesById } : {}),
    });
    // Deliver to the verified override when set; unsubscribe identity stays the account email.
    const deliverTo = user.notificationEmail ?? user.email;
    console.log(`[Email] Sending to ${deliverTo} (account ${user.email}): "${subject}"`);
    await sendEmail(deliverTo, subject, html, resendApiKey, unsubscribeLink);
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

// ── Targets fetch ─────────────────────────────────────────────────────────────

async function fetchTargets(config: RunConfig): Promise<NotificationTarget[]> {
    const res = await fetch(`${config.subscriberApiUrl}/api/admin/notification-targets`, {
        headers: { Authorization: `Bearer ${config.subscriberApiSecret}` },
    });
    if (!res.ok) throw new Error(`notification-targets returned ${res.status}`);
    const { targets } = (await res.json()) as NotificationTargetsResponse;
    return targets;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function run(config: RunConfig, prefetchedTargets?: NotificationTarget[]): Promise<void> {
    const { subscriberApiUrl, subscriberApiSecret, resendApiKey, siteUrl, forceEmail, dryRun, now } = config;
    kvAdapter = config.kvAdapter;

    if (!subscriberApiUrl || !subscriberApiSecret) throw new Error("Missing subscriberApiUrl/Secret");
    if (!resendApiKey) throw new Error("Missing resendApiKey");

    const targets = prefetchedTargets ?? (await fetchTargets(config));
    console.log(`[Targets] ${targets.length} users with non-empty campground lists`);

    const eligible = targets.filter((t) => isEligible(t, now, forceEmail));
    console.log(`[Eligible] ${eligible.length} users due for a check this cycle`);
    if (eligible.length === 0) {
        console.log("[Done] Nothing to do");
        return;
    }

    // Notify reads the KV cache only — no rec.gov calls. The cache is kept warm
    // by runTick (fast lane) and runSweep. A cache miss = carry-forward no-data.
    const nowMonth = now.toISOString().slice(0, 7);
    const plan = buildNotifyPlan(eligible, nowMonth);
    const rawByCampground = kvAdapter ? await readCachedMonths(plan, kvAdapter) : {};
    console.log(`[Notify] reading cache for ${plan.length} (campground, month) pairs`);

    // 1. Fetch the existing global first-seen map.
    const existingFirstSeenMap = await fetchFirstSeenMap(subscriberApiUrl, subscriberApiSecret);

    // 2. Compute all currently-visible match signatures across all eligible users.
    //    For each signature: record first-seen timestamp if not already present; keep existing if so.
    //    Only retain signatures still visible this cycle (stale ones drop naturally).
    //
    //    Also build a global enrichment map (sig → enriched fields) so step 9.5 can
    //    populate the recent-openings log without re-walking per-user data.
    const newFirstSeenMap: FirstSeenMap = {};
    const globalMatchesBySig: Record<string, Omit<RecentOpening, "signature" | "detectedAt">> = {};
    for (const target of eligible) {
        const { matches: userMatches } = await computeMatchesForUser(target, rawByCampground);
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

    // 3. Per user: apply lead-time filter (non-curators only), diff against their state.
    const updates: StateUpdate[] = [];
    // Tracks latency (ms from first-seen to email-sent) for each match emailed this cycle.
    const sentLatenciesMs: number[] = [];
    for (const target of eligible) {
        const {
            matches: userMatches,
            groups: userGroups,
            campgroundNamesById,
        } = await computeMatchesForUser(target, rawByCampground);
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

        // Same lead-time gate for adjacent groups: a group's age is the MAX (latest)
        // first-seen across its constituent sites' exact-window signatures, so a group
        // isn't emailed to non-curators until every member site has cleared lead-time.
        // A site whose window isn't in the first-seen map is treated as just-appeared
        // (now), conservatively delaying the group.
        const groupClearedLeadTime = (g: AdjacentGroup): boolean => {
            if (isCurator) return true;
            let maxFirstSeenMs = 0;
            for (const siteId of g.siteIds) {
                const sig = generateSignature(g.campgroundId, siteId, {
                    from: g.from,
                    to: g.to,
                    nights: g.nights,
                });
                const firstSeen = newFirstSeenMap[sig];
                const ms = firstSeen ? new Date(firstSeen).getTime() : now.getTime();
                if (ms > maxFirstSeenMs) maxFirstSeenMs = ms;
            }
            return now.getTime() - maxFirstSeenMs >= LEAD_TIME_MS;
        };
        const visibleGroups = userGroups.filter(groupClearedLeadTime);

        const priorState = target.notifierState ?? null;
        const isFirstRun = priorState === null;
        const { newMatches, nextState } = diffPerUser(visible, priorState, now.getTime());
        const { newGroups, nextGroupState } = diffGroupsWithCooldown(
            visibleGroups,
            priorState,
            now.getTime(),
        );
        // Merge the group bucket into the per-user state alongside `sites` — never
        // overwrite the sites bucket diffPerUser produced.
        const mergedState: NotifierState = { ...nextState };
        if (Object.keys(nextGroupState).length > 0) mergedState.groups = nextGroupState;

        if (isFirstRun && !forceEmail) {
            console.log(`[${target.email}] first run — seeding state, no email`);
            updates.push({ email: target.email, state: mergedState, lastNotifiedAt: now.toISOString() });
            continue;
        }

        if (newMatches.length === 0 && newGroups.length === 0) {
            console.log(`[${target.email}] 0 new matches`);
            updates.push({ email: target.email, state: mergedState });
            continue;
        }

        // Stamp each match with its global first-sighting so the email can say how
        // long the opening has been visible (same lookup the latency stats use below).
        for (const m of newMatches) {
            const firstSeen = newFirstSeenMap[signatureForMatch(m)];
            if (firstSeen) m.firstSeenAt = firstSeen;
        }

        console.log(
            `[${target.email}] ${newMatches.length} new match(es), ${newGroups.length} new group(s) — sending email`,
        );
        if (dryRun) {
            console.log(
                `[dry-run] would email ${newMatches.length} match(es) + ${newGroups.length} group(s) to ${target.email}`,
            );
            updates.push({ email: target.email, state: mergedState });
        } else {
            try {
                const sentAtMs = Date.now();
                await sendEmailToUser({
                    user: target,
                    matches: newMatches,
                    groups: newGroups,
                    campgroundNamesById,
                    resendApiKey,
                    siteUrl,
                    apiSecret: subscriberApiSecret,
                    subscriberApiUrl,
                });
                // Record latency for each match in this email.
                for (const m of newMatches) {
                    const sig = signatureForMatch(m);
                    const firstSeenIso = newFirstSeenMap[sig];
                    if (firstSeenIso) sentLatenciesMs.push(sentAtMs - new Date(firstSeenIso).getTime());
                }
                updates.push({ email: target.email, state: mergedState, lastNotifiedAt: now.toISOString() });
            } catch (err) {
                console.error(`[${target.email}] email send failed: ${(err as Error).message}`);
                updates.push({ email: target.email, state: mergedState });
            }
        }
    }

    // 4. Push state back to the API.
    if (!dryRun) {
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
    }

    // 5. Persist the updated first-seen map (pruned to only currently-visible signatures).
    if (!dryRun) await putFirstSeenMap(subscriberApiUrl, subscriberApiSecret, newFirstSeenMap);

    // 5.5: Maintain recent-openings log.
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

    if (!dryRun) {
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
    }

    // 6. Compute and PUT stats.
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

    if (!dryRun) {
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

    if (dryRun) console.log("[dry-run] complete — no writes performed");
}

// TICK (cron "* * * * *"): refresh hot campgrounds, then notify from cache.
export async function runTick(config: RunConfig): Promise<void> {
    const targets = await fetchTargets(config);
    const nowMonth = config.now.toISOString().slice(0, 7);
    if (config.kvAdapter && !config.dryRun) {
        const fastLane = buildFastLanePlan(targets, nowMonth);
        if (fastLane.length) {
            console.log(`[FastLane] fetching ${fastLane.length} high-tier (campground, month) pairs`);
            await fetchToCache(fastLane, config.kvAdapter, { concurrency: 1, delayMs: 250 });
        }
    }
    await run(config, targets);
}

// SWEEP (cron "*/5 * * * *"): refresh normal/low campgrounds into cache. Fetch
// only — no notify. Best-effort single-flight so overlapping sweeps don't double
// the rec.gov load.
export async function runSweep(config: RunConfig, lockKv: LockKv): Promise<void> {
    if (!config.kvAdapter || config.dryRun) return;
    if (!(await acquireSweepLock(lockKv, config.now.getTime()))) {
        console.log("[Sweep] prior sweep still holds the lock — skipping");
        return;
    }
    const targets = await fetchTargets(config);
    const nowMonth = config.now.toISOString().slice(0, 7);
    const minute = config.now.getUTCMinutes();
    const plan = buildSweepPlan(targets, minute, nowMonth);
    if (plan.length === 0) {
        console.log(`[Sweep] minute=${minute} — no normal/low campgrounds due`);
        return;
    }
    console.log(`[Sweep] minute=${minute} fetching ${plan.length} (campground, month) pairs`);
    await fetchToCache(plan, config.kvAdapter, { concurrency: 1, delayMs: 500 });
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
