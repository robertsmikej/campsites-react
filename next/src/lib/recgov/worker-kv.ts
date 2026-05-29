import type { KVNamespace } from "@cloudflare/workers-types";
import {
    rawCacheKey,
    snapshotCacheKey,
    RAW_CACHE_TTL_SECONDS,
    SNAPSHOT_CACHE_TTL_SECONDS,
    type AvailabilitySnapshot,
    type KvAdapter,
} from "./cache";
import type { RawMonthResult } from "./types";

// Serialize a snapshot for change-detection: strip the timestamp so two
// identical-content snapshots produced minutes apart compare equal.
function snapshotComparable(snapshot: AvailabilitySnapshot): string {
    return JSON.stringify({ ...snapshot, updatedAt: "" });
}

export class WorkerKvAdapter implements KvAdapter {
    constructor(private readonly kv: KVNamespace) {}

    async getRaw(facilityId: string, month: string): Promise<RawMonthResult | null> {
        return (await this.kv.get(rawCacheKey(facilityId, month), "json")) as RawMonthResult | null;
    }

    async putRaw(facilityId: string, month: string, value: RawMonthResult): Promise<void> {
        const key = rawCacheKey(facilityId, month);
        const existingRaw = await this.kv.get(key);
        const newRaw = JSON.stringify(value);
        if (existingRaw === newRaw) return;
        await this.kv.put(key, newRaw, { expirationTtl: RAW_CACHE_TTL_SECONDS });
    }

    async getSnapshot(email: string): Promise<AvailabilitySnapshot | null> {
        return (await this.kv.get(snapshotCacheKey(email), "json")) as AvailabilitySnapshot | null;
    }

    async putSnapshot(email: string, value: AvailabilitySnapshot): Promise<void> {
        const key = snapshotCacheKey(email);
        const existing = (await this.kv.get(key, "json")) as AvailabilitySnapshot | null;
        if (existing && snapshotComparable(existing) === snapshotComparable(value)) return;
        await this.kv.put(key, JSON.stringify(value), { expirationTtl: SNAPSHOT_CACHE_TTL_SECONDS });
    }

    async deleteSnapshot(email: string): Promise<void> {
        await this.kv.delete(snapshotCacheKey(email));
    }
}
