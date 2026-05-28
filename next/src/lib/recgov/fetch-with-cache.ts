import { fetchMonth } from "./fetch-month";
import type { KvAdapter } from "./cache";
import type { RawMonthResult } from "./types";

// Reads from cache; on miss, fetches rec.gov and writes through.
// Returns null if both cache and rec.gov fail to produce a value.
export async function fetchMonthWithCache(
    facilityId: string,
    month: string,
    kv: KvAdapter,
): Promise<RawMonthResult | null> {
    const cached = await kv.getRaw(facilityId, month);
    if (cached) return cached;

    const fresh = await fetchMonth(facilityId, month);
    if (fresh) {
        await kv.putRaw(facilityId, month, fresh);
    }
    return fresh;
}
