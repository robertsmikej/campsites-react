// Campsite Availability Notifier — per-user rewire (Phase 5)
// Pulls per-user campground lists from /api/admin/notification-targets,
// deduplicates recreation.gov fetches, and emails each user about their own matches.
// Runs as the campwatch-notifier Cloudflare Worker on cron triggers (tick + sweep); see worker.ts.

import { stayOverlapsBlackout } from "../next/src/lib/blackout";
import { processCampgroundResults, getAllDatesInRange } from "../next/src/lib/recgov/match-detection";
import { IGNORE_CAMPSITE_TYPES } from "../next/src/lib/recgov/types";
import { RestKvAdapter } from "../next/src/lib/recgov/rest-kv";
import { fetchProducedNoData } from "../next/src/lib/recgov/raw-results";
import { findAdjacentGroups, type AdjacentGroup, type AdjacencySite } from "../next/src/lib/adjacent-groups";
import { getSiteDetailsCached, type KvLike } from "../next/src/lib/site-details-cache";
import { findNewMatches, generateSignature } from "./lib/diff";
import { formatEmail, sendEmail, formatDate, buildReservationLink } from "./lib/email";
import { resolveNotifyScope, matchPassesScope } from "./lib/notify-scope";
import {
    buildFastLanePlan,
    buildSweepPlan,
    buildNotifyPlan,
    readCachedMonths,
    fetchToCache,
} from "./fetch-jobs";
import { acquireSweepLock, type LockKv } from "./sweep-lock";
import { acquireNotifyLock, releaseNotifyLock } from "./notify-lock";
import { sendWebPush } from "./lib/push";
import type { PushSubscriptionRecord } from "../next/src/lib/push/subscription";
import type { Campground, GlobalSettings, NotifyScope } from "../next/src/types/campground";
import type { MatchResult, SiteConfigForDiff, CampgroundResult } from "./lib/diff";
import type { SiteAvailabilityMap } from "../next/src/lib/recgov/types";
import type { AvailabilitySnapshot, SnapshotCampground } from "../next/src/lib/recgov/cache";
import type { KvAdapter } from "../next/src/lib/recgov/cache";
import { tripHitsForCampground, type TripSiteHit } from "../next/src/lib/trip-windows";
import { TRIP_COOLDOWN_MS } from "../next/src/lib/notifier-state-merge";
import type { TripWindow } from "../next/src/types/campground";

export interface RunConfig {
    subscriberApiUrl: string;
    subscriberApiSecret: string;
    resendApiKey: string;
    siteUrl: string;
    forceEmail: boolean;
    dryRun: boolean;
    kvAdapter: KvAdapter | null;
    now: Date;
    /** When set, the notify pass also sends Web Push (additive to email). */
    vapid?: { privateJWK: JsonWebKey; subject: string };
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

const PUSH_MAX_LINES = 5;
// Tier marker matching the app/email legend: ★ favorite, ◇ worthwhile.
const tierMark = (t: string) => (t === "favorites" ? "★ " : t === "worthwhile" ? "◇ " : "");
const TIER_ORDER: Record<string, number> = { favorites: 0, worthwhile: 1, "all-others": 2 };

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
    /** trip key ("windowId:campgroundId:siteId") -> alerted runs with last-ALERT ISO.
     *  6h cooldown (TRIP_COOLDOWN_MS): the age-out IS the re-alert cadence, so
     *  `seen` is stamped only when a hit actually fires, never refreshed on sight. */
    trips?: Record<string, Array<{ from: string; to: string; seen: string }>>;
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
    pushSubscriptions?: PushSubscriptionRecord[];
}

interface NotificationTargetsResponse {
    targets: NotificationTarget[];
}

interface StateUpdate {
    email: string;
    state: NotifierState;
    lastNotifiedAt?: string;
}

export interface FirstSeenMap {
    [signature: string]: string; // ISO timestamp
}

export interface RecentOpening {
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

export interface StatsBody {
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

export interface PriorStats {
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
    tripHitsByCg: Map<string, TripSiteHit[]>,
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
        const tripMatches = tripHitsByCg.get(r.campgroundId);
        campgrounds.push({
            ...cg,
            siteAvailability: sitesWithMatches,
            totalSitesCount,
            ...(tripMatches?.length ? { tripMatches } : {}),
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
    tripHits: TripSiteHit[];
}

async function computeMatchesForUser(
    target: NotificationTarget,
    rawByCampground: Record<string, unknown[]>,
    todayIso: string,
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

    // Trip-window hits: computed from the RAW months directly, so they ignore
    // stay-length/start-day settings, notify scope, blackouts, and the
    // campground watch dates. A disabled campground still opts out entirely.
    const tripHits: TripSiteHit[] = [];
    const tripHitsByCg = new Map<string, TripSiteHit[]>();
    for (const c of target.campgrounds["recreation.gov"] ?? []) {
        if (c.enabled === false) continue;
        const hits = tripHitsForCampground(
            rawByCampground[c.id],
            c,
            target.globalSettings?.tripWindows,
            todayIso,
        );
        if (hits.length === 0) continue;
        tripHits.push(...hits);
        tripHitsByCg.set(c.id, hits);
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

    await writeUserSnapshot(target, syntheticResults, failedCampgroundIds, tripHitsByCg);

    return { matches: sendable, groups, campgroundNamesById, tripHits };
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

// ── Trip-window dedup ─────────────────────────────────────────────────────────

// Same overlap-within-cooldown semantics as diffPerUser, keyed by
// (window, campground, site), with two deliberate differences: the cooldown is
// 6h, and a still-visible non-new run does NOT refresh `seen`. Refreshing would
// keep the range alive forever and kill the every-6h re-alert.
export function diffTripsWithCooldown(
    hits: TripSiteHit[],
    priorState: { trips?: NotifierState["trips"] } | null | undefined,
    nowMs: number,
    cooldownMs: number = TRIP_COOLDOWN_MS,
): { newHits: TripSiteHit[]; nextTripState: NonNullable<NotifierState["trips"]> } {
    const cutoff = nowMs - cooldownMs;
    const seenIso = new Date(nowMs).toISOString();

    const next: NonNullable<NotifierState["trips"]> = {};
    const priorFresh = new Map<string, Array<{ from: string; to: string; seen: string }>>();
    for (const [key, ranges] of Object.entries(priorState?.trips ?? {})) {
        const fresh = ranges.filter((r) => Date.parse(r.seen) > cutoff);
        if (fresh.length) {
            priorFresh.set(key, fresh);
            next[key] = fresh.map((r) => ({ ...r }));
        }
    }

    const newHits: TripSiteHit[] = [];
    for (const h of hits) {
        const key = `${h.windowId}:${h.campgroundId}:${h.siteId}`;
        const prior = priorFresh.get(key) ?? [];
        if (prior.some((r) => rangesOverlap(r.from, r.to, h.run.from, h.run.to))) continue;
        newHits.push(h);
        (next[key] ??= []).push({ from: h.run.from, to: h.run.to, seen: seenIso });
    }
    return { newHits, nextTripState: next };
}

// Same-run dupe suppression: a normal alert whose site+range is already covered
// by a trip digest this cycle would be a duplicate push/email card.
export function suppressTripDuplicates(matches: MatchResult[], tripHits: TripSiteHit[]): MatchResult[] {
    if (tripHits.length === 0) return matches;
    return matches.filter(
        (m) =>
            !tripHits.some(
                (h) =>
                    h.campgroundId === m.campgroundId &&
                    h.siteId === m.siteId &&
                    rangesOverlap(h.run.from, h.run.to, m.match.from, m.match.to),
            ),
    );
}

export interface TripDigest {
    window: TripWindow;
    hits: TripSiteHit[];
    push: { title: string; body: string; url: string; tag: string };
}

// One digest per window that has new hits: distinct title, per-window tag (new
// sends replace the prior notification), deep link to the sole site / sole
// campground / dashboard.
export function buildTripDigests(
    newHits: TripSiteHit[],
    windows: TripWindow[],
    siteUrl: string,
): TripDigest[] {
    if (newHits.length === 0) return [];
    const digests: TripDigest[] = [];
    for (const w of [...windows].sort((a, b) => a.from.localeCompare(b.from))) {
        const hits = newHits
            .filter((h) => h.windowId === w.id)
            .sort(
                (a, b) =>
                    (TIER_ORDER[a.tier] ?? 2) - (TIER_ORDER[b.tier] ?? 2) ||
                    a.campgroundName.localeCompare(b.campgroundName) ||
                    a.siteName.localeCompare(b.siteName),
            );
        if (hits.length === 0) continue;
        const label = w.label?.trim() || `${formatDate(w.from)} – ${formatDate(w.to)}`;
        const lines = hits.map(
            (h) =>
                `${tierMark(h.tier)}${h.campgroundName} · ${h.siteName} · ${formatDate(h.run.from)} → ${formatDate(h.run.to)}`,
        );
        const shown = lines.slice(0, PUSH_MAX_LINES);
        if (lines.length > PUSH_MAX_LINES) shown.push(`+${lines.length - PUSH_MAX_LINES} more`);
        const cgIds = new Set(hits.map((h) => h.campgroundId));
        const sole = hits.length === 1 ? hits[0] : undefined;
        const url = sole
            ? buildReservationLink(sole.siteId, sole.run.from, sole.run.nights)
            : cgIds.size === 1
              ? `https://www.recreation.gov/camping/campgrounds/${hits[0]!.campgroundId}`
              : `${siteUrl || "https://campwatch.dev"}/app`;
        digests.push({
            window: w,
            hits,
            push: { title: `Trip match: ${label}`, body: shown.join("\n"), url, tag: `cw-trip-${w.id}` },
        });
    }
    return digests;
}

// ── Send email to a single user ───────────────────────────────────────────────

async function sendEmailToUser({
    user,
    matches,
    groups = [],
    campgroundNamesById = {},
    tripDigests = [],
    resendApiKey,
    siteUrl,
    apiSecret,
    subscriberApiUrl,
}: {
    user: NotificationTarget;
    matches: MatchResult[];
    groups?: AdjacentGroup[];
    campgroundNamesById?: Record<string, string>;
    tripDigests?: TripDigest[];
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
        ...(tripDigests.length > 0 ? { tripDigests } : {}),
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

// SINGLE-FLIGHT INVARIANT: run() does read-modify-write on singleton KV keys
// (notifier:first-seen / :recent / :stats) and per-user state, none of which is
// merged server-side. It is therefore only safe with one in-flight notify pass.
// The scheduled path enforces this via runTick's notify lock; the manual CLI
// path is operator-driven. Don't call run() concurrently for the same data.
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
    const todayIso = now.toISOString().slice(0, 10);
    const plan = buildNotifyPlan(eligible, nowMonth, todayIso);
    const rawByCampground = kvAdapter ? await readCachedMonths(plan, kvAdapter) : {};
    console.log(`[Notify] reading cache for ${plan.length} (campground, month) pairs`);

    // 1. Fetch the existing global first-seen map.
    const existingFirstSeenMap = await fetchFirstSeenMap(subscriberApiUrl, subscriberApiSecret);

    // Compute each eligible user's matches/groups exactly once. Both the
    // first-seen pass and the per-user diff pass below reuse this. Computing it
    // twice per tick also re-ran the adjacency KV reads and re-wrote every
    // user's snapshot a second time for no reason.
    const computedByTarget = new Map<NotificationTarget, ComputedUserResults>();
    for (const target of eligible) {
        computedByTarget.set(target, await computeMatchesForUser(target, rawByCampground, todayIso));
    }

    // 2. Compute all currently-visible match signatures across all eligible users.
    //    For each signature: record first-seen timestamp if not already present; keep existing if so.
    //    Only retain signatures still visible this cycle (stale ones drop naturally).
    //
    //    Also build a global enrichment map (sig → enriched fields) so step 9.5 can
    //    populate the recent-openings log without re-walking per-user data.
    const newFirstSeenMap: FirstSeenMap = {};
    const globalMatchesBySig: Record<string, Omit<RecentOpening, "signature" | "detectedAt">> = {};
    for (const target of eligible) {
        const { matches: userMatches } = computedByTarget.get(target)!;
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
            tripHits,
        } = computedByTarget.get(target)!;
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
        const { newHits: newTripHits, nextTripState } = diffTripsWithCooldown(
            tripHits,
            priorState,
            now.getTime(),
        );
        // Merge the group bucket into the per-user state alongside `sites` — never
        // overwrite the sites bucket diffPerUser produced.
        const mergedState: NotifierState = { ...nextState };
        if (Object.keys(nextGroupState).length > 0) mergedState.groups = nextGroupState;
        if (Object.keys(nextTripState).length > 0) mergedState.trips = nextTripState;

        if (isFirstRun && !forceEmail) {
            console.log(`[${target.email}] first run — seeding state, no email`);
            updates.push({ email: target.email, state: mergedState, lastNotifiedAt: now.toISOString() });
            continue;
        }

        if (newMatches.length === 0 && newGroups.length === 0 && newTripHits.length === 0) {
            console.log(`[${target.email}] 0 new matches`);
            updates.push({ email: target.email, state: mergedState });
            continue;
        }

        const tripDigests = buildTripDigests(newTripHits, target.globalSettings?.tripWindows ?? [], siteUrl);
        // A normal alert whose site+range a trip digest already covers this run
        // would be a duplicate card/push line.
        const sendableMatches = suppressTripDuplicates(newMatches, newTripHits);

        // Stamp each match with its global first-sighting so the email can say how
        // long the opening has been visible (same lookup the latency stats use below).
        for (const m of sendableMatches) {
            const firstSeen = newFirstSeenMap[signatureForMatch(m)];
            if (firstSeen) m.firstSeenAt = firstSeen;
        }

        console.log(
            `[${target.email}] ${sendableMatches.length} new match(es), ${newGroups.length} new group(s), ${newTripHits.length} trip hit(s), sending email`,
        );
        if (dryRun) {
            console.log(
                `[dry-run] would email ${sendableMatches.length} match(es) + ${newGroups.length} group(s) + ${newTripHits.length} trip hit(s) to ${target.email}`,
            );
            updates.push({ email: target.email, state: mergedState });
        } else {
            try {
                const sentAtMs = Date.now();
                await sendEmailToUser({
                    user: target,
                    matches: sendableMatches,
                    groups: newGroups,
                    campgroundNamesById,
                    tripDigests,
                    resendApiKey,
                    siteUrl,
                    apiSecret: subscriberApiSecret,
                    subscriberApiUrl,
                });
                // Record latency for each match in this email.
                for (const m of sendableMatches) {
                    const sig = signatureForMatch(m);
                    const firstSeenIso = newFirstSeenMap[sig];
                    if (firstSeenIso) sentLatenciesMs.push(sentAtMs - new Date(firstSeenIso).getTime());
                }
                // Push to this user's registered devices too (additive to email),
                // one notification per campground: title = count, body = campground
                // name then each opening's site + dates. Prune subs the push service
                // reports as gone (404/410).
                if (config.vapid && (target.pushSubscriptions?.length ?? 0) > 0) {
                    const dead: string[] = [];
                    let pushSent = 0;

                    // Trip digests first: one push per window, its own tag so a
                    // new send replaces the prior notification for that window.
                    for (const d of tripDigests) {
                        for (const sub of target.pushSubscriptions ?? []) {
                            try {
                                const r = await sendWebPush(sub, d.push, config.vapid);
                                if (r.gone) {
                                    if (!dead.includes(sub.endpoint)) dead.push(sub.endpoint);
                                } else if (r.status >= 200 && r.status < 300) {
                                    pushSent++;
                                }
                            } catch (err) {
                                console.error(`[push] ${target.email}: ${(err as Error).message}`);
                            }
                        }
                    }

                    const byCg = new Map<
                        string,
                        { name: string; matches: MatchResult[]; groups: AdjacentGroup[] }
                    >();
                    for (const m of sendableMatches) {
                        const e = byCg.get(m.campgroundId) ?? {
                            name: m.campgroundName,
                            matches: [],
                            groups: [],
                        };
                        e.matches.push(m);
                        byCg.set(m.campgroundId, e);
                    }
                    for (const g of newGroups) {
                        const name = campgroundNamesById[g.campgroundId] ?? "Campground";
                        const e = byCg.get(g.campgroundId) ?? { name, matches: [], groups: [] };
                        e.groups.push(g);
                        byCg.set(g.campgroundId, e);
                    }

                    for (const [cgId, { name, matches, groups }] of byCg) {
                        const lines = [
                            ...matches.map(
                                (m) =>
                                    `${tierMark(m.group)}${m.siteName} · ${formatDate(m.match.from)} → ${formatDate(m.match.to)}`,
                            ),
                            ...groups.map((g) => {
                                const sites = g.siteNames.map((s) => s.replace(/^Site\s+/i, "")).join(", ");
                                return `${tierMark(g.anchorTier)}${sites} (adjacent) · ${formatDate(g.from)} → ${formatDate(g.to)}`;
                            }),
                        ];
                        const pushTitle = `${lines.length} new opening${lines.length === 1 ? "" : "s"}`;
                        const shown = lines.slice(0, PUSH_MAX_LINES);
                        if (lines.length > PUSH_MAX_LINES)
                            shown.push(`+${lines.length - PUSH_MAX_LINES} more`);
                        const pushBody = [name, ...shown].join("\n");
                        // Deep link: a lone opening goes straight to that site's booking
                        // page (dates pre-filled); otherwise the campground's rec.gov page.
                        const sole = matches.length === 1 && groups.length === 0 ? matches[0] : undefined;
                        const url = sole
                            ? buildReservationLink(sole.siteId, sole.match.from, sole.match.nights)
                            : `https://www.recreation.gov/camping/campgrounds/${cgId}`;
                        for (const sub of target.pushSubscriptions ?? []) {
                            try {
                                const r = await sendWebPush(
                                    sub,
                                    { title: pushTitle, body: pushBody, url, tag: `cw-${cgId}` },
                                    config.vapid,
                                );
                                if (r.gone) {
                                    if (!dead.includes(sub.endpoint)) dead.push(sub.endpoint);
                                } else if (r.status >= 200 && r.status < 300) {
                                    pushSent++;
                                }
                            } catch (err) {
                                console.error(`[push] ${target.email}: ${(err as Error).message}`);
                            }
                        }
                    }
                    if (dead.length > 0) {
                        await fetch(`${subscriberApiUrl}/api/admin/push/prune`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${subscriberApiSecret}`,
                            },
                            body: JSON.stringify({ email: target.email, endpoints: dead }),
                        }).catch(() => {});
                    }
                    if (byCg.size > 0 || tripDigests.length > 0) {
                        console.log(
                            `[push] ${target.email}: ${pushSent} sent across ${byCg.size} campground(s)` +
                                (dead.length > 0 ? `, ${dead.length} pruned` : ""),
                        );
                    }
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
    const recentResp = await fetch(`${subscriberApiUrl}/api/openings/recent`).catch(() => null);
    const priorRecent: RecentOpening[] =
        recentResp && recentResp.ok ? ((await recentResp.json()) as RecentOpening[]) : [];

    const { trimmedRecent, newThisCycle } = maintainRecentOpeningsLog({
        priorRecent,
        newFirstSeenMap,
        globalMatchesBySig,
        nowMs: Date.now(),
    });

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
                    `[Recent] ${trimmedRecent.length} entries in log (${newThisCycle} new this cycle)`,
                );
            }
        } catch (err) {
            console.error(`[Warn] /api/admin/openings/recent PUT failed: ${(err as Error).message}`);
        }
    }

    // 6. Compute and PUT stats.
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

    const statsBody = computeStatsBody({
        priorStats,
        sentLatenciesMs,
        campgroundsTracked: trackedIds.size,
        now,
    });

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
                    `[Stats] ${trackedIds.size} cgs tracked, ${sentLatenciesMs.length} sent this cycle, ${statsBody.openingsSentLast7Days} last 7d, ${statsBody.medianLatencyMs}ms median`,
                );
            }
        } catch (err) {
            console.error(`[Warn] /api/admin/stats PUT failed: ${(err as Error).message}`);
        }
    }

    if (dryRun) console.log("[dry-run] complete — no writes performed");
}

// TICK (cron "* * * * *"): refresh hot campgrounds, then notify from cache.
// `lockKv` (the raw KV namespace) gates the notify pass to one in-flight run at a
// time — run() does read-modify-write on singleton state with no server-side
// merge, so overlapping ticks would clobber each other. Omitted by the manual
// CLI path (operator-driven, not the every-minute overlap source).
export async function runTick(config: RunConfig, lockKv?: LockKv): Promise<void> {
    const lock = config.dryRun ? undefined : lockKv;
    if (lock && !(await acquireNotifyLock(lock, config.now.getTime()))) {
        console.log("[Tick] prior notify still in flight — skipping this cycle");
        return;
    }
    try {
        const targets = await fetchTargets(config);
        const nowMonth = config.now.toISOString().slice(0, 7);
        if (config.kvAdapter && !config.dryRun) {
            const fastLane = buildFastLanePlan(targets, nowMonth, config.now.toISOString().slice(0, 10));
            if (fastLane.length) {
                console.log(`[FastLane] fetching ${fastLane.length} high-tier (campground, month) pairs`);
                await fetchToCache(fastLane, config.kvAdapter, { concurrency: 1, delayMs: 250 });
            }
        }
        await run(config, targets);
    } finally {
        if (lock) await releaseNotifyLock(lock);
    }
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
    const plan = buildSweepPlan(targets, minute, nowMonth, config.now.toISOString().slice(0, 10));
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

const RECENT_OPENINGS_WINDOW_MS = 24 * 60 * 60 * 1000;
const RECENT_OPENINGS_MAX = 200;

// Pure: fold this cycle's first-seen signatures into the rolling recent-openings
// log. Prunes entries older than the 24h retention window, de-dupes by signature,
// sorts newest-first, and caps the list. `nowMs` is injected so the time math is
// testable. Returns the trimmed log plus how many entries are new this cycle.
export function maintainRecentOpeningsLog(args: {
    priorRecent: RecentOpening[];
    newFirstSeenMap: FirstSeenMap;
    globalMatchesBySig: Record<string, Omit<RecentOpening, "signature" | "detectedAt">>;
    nowMs: number;
}): { trimmedRecent: RecentOpening[]; newThisCycle: number } {
    const { priorRecent, newFirstSeenMap, globalMatchesBySig, nowMs } = args;

    // Prune entries older than 24h.
    const recent = priorRecent.filter(
        (r) => r.detectedAt && nowMs - new Date(r.detectedAt).getTime() < RECENT_OPENINGS_WINDOW_MS,
    );
    const retainedCount = recent.length;
    const existingSigs = new Set(recent.map((r) => r.signature));

    // Add any signature in the current first-seen map that isn't already in the
    // recent log and was first seen within the retention window. existingSigs is
    // the real de-dupe mechanism; the timestamp filter only enforces retention.
    for (const [sig, firstSeen] of Object.entries(newFirstSeenMap)) {
        if (existingSigs.has(sig)) continue;
        const firstSeenMs = new Date(firstSeen).getTime();
        if (nowMs - firstSeenMs > RECENT_OPENINGS_WINDOW_MS) continue;
        const enriched = globalMatchesBySig[sig];
        if (!enriched) continue;
        recent.push({ signature: sig, ...enriched, detectedAt: firstSeen });
    }

    recent.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
    return {
        trimmedRecent: recent.slice(0, RECENT_OPENINGS_MAX),
        newThisCycle: recent.length - retainedCount,
    };
}

const LATENCY_WINDOW_MAX = 200;

// Pure: assemble the stats payload from the prior stats blob and this cycle's
// sent-latency samples. Handles the daily-counter rollover, the rolling 7-day
// history, the bounded latency window, and the median. Split out of run() so the
// median / 7-day-window math is unit-testable without standing up the HTTP loop.
export function computeStatsBody(args: {
    priorStats: PriorStats | null;
    sentLatenciesMs: number[];
    campgroundsTracked: number;
    now: Date;
}): StatsBody {
    const { priorStats, sentLatenciesMs, campgroundsTracked, now } = args;
    const todayKeyUtc = now.toISOString().slice(0, 10); // "YYYY-MM-DD" UTC

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
            ? priorStats._latencyWindow.slice(-LATENCY_WINDOW_MAX)
            : [];
    const latencyWindow = [...priorWindow, ...sentLatenciesMs].slice(-LATENCY_WINDOW_MAX);

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

    return {
        lastPollAt: now.toISOString(),
        campgroundsTracked,
        openingsSentToday,
        openingsSentLast7Days,
        medianLatencyMs,
        sampleSize: sortedLatencies.length,
        todayKey: todayKeyUtc,
        _latencyWindow: latencyWindow,
        _dailyHistory: dailyHistory,
    };
}
