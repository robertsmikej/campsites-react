import { fetchMonth } from "./fetch-month";
import type { KvAdapter } from "./cache";
import type { RawMonthResult } from "./types";

export interface FetchMonthWithCacheOptions {
    /**
     * Force a fresh upstream fetch even if cached data exists. Used by the
     * notifier cron so it never reads stale data while detecting new openings;
     * the writes are conditional on content change inside the adapter, so
     * unchanged data still avoids burning a KV write.
     */
    forceFresh?: boolean;
}

// Reads from cache; on miss (or when forceFresh), fetches rec.gov and writes
// through. Returns null if both cache and rec.gov fail to produce a value.
export async function fetchMonthWithCache(
    facilityId: string,
    month: string,
    kv: KvAdapter,
    options?: FetchMonthWithCacheOptions,
): Promise<RawMonthResult | null> {
    if (!options?.forceFresh) {
        const cached = await kv.getRaw(facilityId, month);
        if (cached) return cached;
    }

    const fresh = await fetchMonth(facilityId, month);
    if (fresh) {
        await kv.putRaw(facilityId, month, fresh);
    }
    return fresh;
}
