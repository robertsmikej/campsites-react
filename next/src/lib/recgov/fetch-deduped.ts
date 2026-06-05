export interface FetchPlanItem {
    campgroundId: string;
    month: string;
}

export interface FetchDedupedOptions {
    /** Max fetches in flight at once. Keep ≤ 6 (Workers connection limit). */
    concurrency?: number;
    /** Retries after the initial attempt when the fetch returns null. */
    maxRetries?: number;
    /** Backoff before each retry, ms; index clamps to last entry. */
    backoffMs?: number[];
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch every (campground, month) in the plan with bounded concurrency and
 * retry-on-null backoff. `fetchOne` returns the raw result or null on failure
 * (rec.gov error / network). Results are grouped by campgroundId, preserving the
 * per-campground month order of the plan. A campground that never succeeds gets
 * a null in its slot (callers treat all-null as "no data").
 */
export async function fetchDedupedConcurrent<T>(
    plan: FetchPlanItem[],
    fetchOne: (campgroundId: string, month: string) => Promise<T | null>,
    options: FetchDedupedOptions = {},
): Promise<Record<string, (T | null)[]>> {
    const concurrency = Math.max(1, options.concurrency ?? 6);
    const maxRetries = Math.max(0, options.maxRetries ?? 2);
    const backoffMs = options.backoffMs ?? [500, 1000];

    // Pre-size per-campground result arrays so out-of-order completion still
    // lands each result at its correct month index.
    const slotIndex: number[] = [];
    const results: Record<string, (T | null)[]> = {};
    for (const { campgroundId } of plan) {
        if (!results[campgroundId]) results[campgroundId] = [];
        slotIndex.push(results[campgroundId].length);
        results[campgroundId].push(null);
    }

    let next = 0;
    async function worker(): Promise<void> {
        while (next < plan.length) {
            const i = next++;
            const item = plan[i]!;
            let value: T | null = null;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                value = await fetchOne(item.campgroundId, item.month);
                if (value !== null) break;
                if (attempt < maxRetries) {
                    await sleep(backoffMs[Math.min(attempt, backoffMs.length - 1)] ?? 0);
                }
            }
            results[item.campgroundId]![slotIndex[i]!] = value;
        }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, plan.length) }, () => worker()));
    return results;
}
