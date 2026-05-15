import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { KVNamespace } from "@cloudflare/workers-types";

export interface CampWatchEnv {
    SUBSCRIBERS: KVNamespace;
    API_SECRET?: string;
    CONFIG_KEY?: string;
}

/**
 * Returns the Cloudflare bindings for the current request. Throws if called
 * outside a request context (e.g., during static analysis or build).
 */
export function getEnv(): CampWatchEnv {
    const ctx = getCloudflareContext({ async: false });
    return ctx.env as unknown as CampWatchEnv;
}

export function getKv(): KVNamespace {
    return getEnv().SUBSCRIBERS;
}
