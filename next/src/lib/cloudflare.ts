import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { KVNamespace } from "@cloudflare/workers-types";

export interface CampWatchEnv {
    SUBSCRIBERS: KVNamespace;
    API_SECRET?: string;
    CONFIG_KEY?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    SESSION_SECRET?: string;
    BOOTSTRAP_ADMIN_EMAIL?: string;
    DEV_USER?: string;
}

let testEnvOverride: CampWatchEnv | undefined;

/**
 * Test-only: bypass the Cloudflare context lookup and inject a synthetic env
 * for the duration of a test. Pass undefined to clear.
 */
export function __setEnvForTests(env: CampWatchEnv | undefined): void {
    testEnvOverride = env;
}

/**
 * Returns the Cloudflare bindings for the current request. Throws if called
 * outside a request context (e.g., during static analysis or build).
 */
export function getEnv(): CampWatchEnv {
    if (testEnvOverride) return testEnvOverride;
    const ctx = getCloudflareContext({ async: false });
    return ctx.env as unknown as CampWatchEnv;
}

export function getKv(): KVNamespace {
    return getEnv().SUBSCRIBERS;
}
