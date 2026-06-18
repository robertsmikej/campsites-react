import { CHECK_PRIORITY_INTERVAL_MINUTES } from "../next/src/types/campground";
import type { Campground, CheckPriority } from "../next/src/types/campground";
import type { KvAdapter } from "../next/src/lib/recgov/cache";
import type { RawMonthResult } from "../next/src/lib/recgov/types";
import { fetchMonthWithCache } from "../next/src/lib/recgov/fetch-with-cache";
import { fetchDedupedConcurrent } from "../next/src/lib/recgov/fetch-deduped";

export interface FetchPlanItem {
    campgroundId: string;
    month: string;
}

export interface PlannableTarget {
    campgrounds: { "recreation.gov"?: Campground[] };
}

function monthsBetween(startIso: string, endIso: string): string[] {
    const start = new Date(startIso + "T00:00:00Z");
    const end = new Date(endIso + "T00:00:00Z");
    const months = new Set<string>();
    const cur = new Date(start);
    while (cur <= end) {
        months.add(`${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}`);
        cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
    return [...months];
}

function tierOf(c: Campground): CheckPriority {
    return c.checkPriority ?? "normal";
}

// Shared core: union of (campgroundId, month) across targets for campgrounds
// whose tier is in `tiers`. When `minute` is provided, a campground is included
// only when minute % its-tier-interval === 0 (matches the legacy gate).
function buildPlan(
    targets: PlannableTarget[],
    tiers: CheckPriority[],
    nowMonth: string,
    minute?: number,
): FetchPlanItem[] {
    const ranges = new Map<string, Set<string>>();
    for (const target of targets) {
        for (const c of target.campgrounds["recreation.gov"] ?? []) {
            if (c.enabled === false) continue;
            const tier = tierOf(c);
            if (!tiers.includes(tier)) continue;
            if (minute !== undefined && minute % CHECK_PRIORITY_INTERVAL_MINUTES[tier] !== 0) continue;
            const start = c.dates?.startDate;
            const end = c.dates?.endDate;
            if (!start || !end) continue;
            const months = monthsBetween(start, end).filter((m) => m >= nowMonth);
            if (months.length === 0) continue;
            if (!ranges.has(c.id)) ranges.set(c.id, new Set());
            for (const m of months) ranges.get(c.id)!.add(m);
        }
    }
    const plan: FetchPlanItem[] = [];
    for (const [campgroundId, monthSet] of ranges) for (const month of monthSet) plan.push({ campgroundId, month });
    return plan;
}

// High-tier only, every tick (high interval = 1, so no effective minute gate).
export function buildFastLanePlan(targets: PlannableTarget[], nowMonth: string): FetchPlanItem[] {
    return buildPlan(targets, ["high"], nowMonth);
}

// Normal/low only, minute-gated. Runs under a */5 cron, so normal (5) fires every
// sweep and low (10) fires every other sweep.
export function buildSweepPlan(targets: PlannableTarget[], minute: number, nowMonth: string): FetchPlanItem[] {
    return buildPlan(targets, ["normal", "low"], nowMonth, minute);
}

// Every enabled campground, all due months, no gate — notify reads cache cheaply.
export function buildNotifyPlan(targets: PlannableTarget[], nowMonth: string): FetchPlanItem[] {
    return buildPlan(targets, ["high", "normal", "low"], nowMonth);
}

// Assemble the per-campground raw-results map from the KV cache, preserving the
// plan's per-campground month order. A cache miss is a null slot — callers treat
// all-null as "no data" (carry-forward), never as a reason to fetch.
export async function readCachedMonths(
    plan: FetchPlanItem[],
    kv: KvAdapter,
): Promise<Record<string, (RawMonthResult | null)[]>> {
    const out: Record<string, (RawMonthResult | null)[]> = {};
    for (const { campgroundId, month } of plan) {
        const value = await kv.getRaw(campgroundId, month);
        (out[campgroundId] ??= []).push(value);
    }
    return out;
}

// Fetch each (campground, month) fresh from rec.gov and write it through to the
// cache. Gentle footprint: serial with a throttle, no retries (a 429 just leaves
// last-good in cache for this cycle). Returns nothing — the cache is the output.
export async function fetchToCache(
    plan: FetchPlanItem[],
    kv: KvAdapter,
    opts?: { concurrency?: number; delayMs?: number },
): Promise<void> {
    if (plan.length === 0) return;
    await fetchDedupedConcurrent(
        plan,
        (campgroundId, month) => fetchMonthWithCache(campgroundId, month, kv, { forceFresh: true }),
        { concurrency: opts?.concurrency ?? 1, maxRetries: 0, delayMs: opts?.delayMs ?? 500 },
    );
}
