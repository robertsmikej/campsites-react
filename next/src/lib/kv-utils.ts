import type { KVNamespace } from "@cloudflare/workers-types";

/**
 * Write a value to KV only if the stored serialized content differs from the
 * provided one. Returns whether a write actually happened. Use when callers
 * may overwrite the same content repeatedly (e.g., cron-driven blobs) to
 * conserve KV write quota.
 *
 * The caller pre-serializes `newSerialized` so any normalization (e.g.,
 * stripping a timestamp field for change-detection) is explicit and visible.
 */
export async function putIfChanged(
    kv: KVNamespace,
    key: string,
    newSerialized: string,
    options?: { expirationTtl?: number },
): Promise<{ written: boolean }> {
    const existing = await kv.get(key);
    if (existing === newSerialized) return { written: false };
    await kv.put(key, newSerialized, options);
    return { written: true };
}
