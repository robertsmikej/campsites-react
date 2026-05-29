import {
    rawCacheKey,
    snapshotCacheKey,
    RAW_CACHE_TTL_SECONDS,
    SNAPSHOT_CACHE_TTL_SECONDS,
    type AvailabilitySnapshot,
    type KvAdapter,
} from "./cache";
import type { RawMonthResult } from "./types";

export interface RestKvOptions {
    accountId: string;
    namespaceId: string;
    apiToken: string;
}

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

export class RestKvAdapter implements KvAdapter {
    constructor(private readonly opts: RestKvOptions) {}

    private endpoint(key: string): string {
        return `${CF_API_BASE}/accounts/${this.opts.accountId}/storage/kv/namespaces/${this.opts.namespaceId}/values/${encodeURIComponent(key)}`;
    }

    private async getJson<T>(key: string): Promise<T | null> {
        const response = await fetch(this.endpoint(key), {
            method: "GET",
            headers: { Authorization: `Bearer ${this.opts.apiToken}` },
        });
        if (response.status === 404) return null;
        if (!response.ok) {
            throw new Error(`KV REST GET ${key} failed: ${response.status}`);
        }
        return (await response.json()) as T;
    }

    private async put(key: string, value: unknown, ttlSeconds: number): Promise<void> {
        const url = `${this.endpoint(key)}?expiration_ttl=${ttlSeconds}`;
        const response = await fetch(url, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${this.opts.apiToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(value),
        });
        if (!response.ok) {
            throw new Error(`KV REST PUT ${key} failed: ${response.status}`);
        }
    }

    async getRaw(facilityId: string, month: string): Promise<RawMonthResult | null> {
        return this.getJson<RawMonthResult>(rawCacheKey(facilityId, month));
    }

    async putRaw(facilityId: string, month: string, value: RawMonthResult): Promise<void> {
        const existing = await this.getRaw(facilityId, month);
        if (existing && JSON.stringify(existing) === JSON.stringify(value)) return;
        await this.put(rawCacheKey(facilityId, month), value, RAW_CACHE_TTL_SECONDS);
    }

    async getSnapshot(email: string): Promise<AvailabilitySnapshot | null> {
        return this.getJson<AvailabilitySnapshot>(snapshotCacheKey(email));
    }

    async putSnapshot(email: string, value: AvailabilitySnapshot): Promise<void> {
        const existing = await this.getSnapshot(email);
        if (existing) {
            const a = JSON.stringify({ ...existing, updatedAt: "" });
            const b = JSON.stringify({ ...value, updatedAt: "" });
            if (a === b) return;
        }
        await this.put(snapshotCacheKey(email), value, SNAPSHOT_CACHE_TTL_SECONDS);
    }

    async deleteSnapshot(email: string): Promise<void> {
        const response = await fetch(this.endpoint(snapshotCacheKey(email)), {
            method: "DELETE",
            headers: { Authorization: `Bearer ${this.opts.apiToken}` },
        });
        if (response.status !== 200 && response.status !== 404) {
            throw new Error(`KV REST DELETE snapshot:${email} failed: ${response.status}`);
        }
    }
}
