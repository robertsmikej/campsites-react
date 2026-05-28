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

export class WorkerKvAdapter implements KvAdapter {
    constructor(private readonly kv: KVNamespace) {}

    async getRaw(facilityId: string, month: string): Promise<RawMonthResult | null> {
        return (await this.kv.get(rawCacheKey(facilityId, month), "json")) as RawMonthResult | null;
    }

    async putRaw(facilityId: string, month: string, value: RawMonthResult): Promise<void> {
        await this.kv.put(rawCacheKey(facilityId, month), JSON.stringify(value), {
            expirationTtl: RAW_CACHE_TTL_SECONDS,
        });
    }

    async getSnapshot(email: string): Promise<AvailabilitySnapshot | null> {
        return (await this.kv.get(snapshotCacheKey(email), "json")) as AvailabilitySnapshot | null;
    }

    async putSnapshot(email: string, value: AvailabilitySnapshot): Promise<void> {
        await this.kv.put(snapshotCacheKey(email), JSON.stringify(value), {
            expirationTtl: SNAPSHOT_CACHE_TTL_SECONDS,
        });
    }

    async deleteSnapshot(email: string): Promise<void> {
        await this.kv.delete(snapshotCacheKey(email));
    }
}
