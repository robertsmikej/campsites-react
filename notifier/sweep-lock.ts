export interface LockKv {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

const LOCK_KEY = "notifier:sweep-lock";
const DEFAULT_LEASE_MS = 4 * 60 * 1000;

// Best-effort single-flight for the sweep. Returns true if the caller should run
// (and records a fresh lease), false if a non-stale lease is already held. KV is
// eventually consistent, so a rare double-acquire is possible — that only costs a
// transient extra rec.gov stream, never correctness (the fetch jobs are
// idempotent and touch no per-user state).
export async function acquireSweepLock(
    kv: LockKv,
    nowMs: number,
    leaseMs: number = DEFAULT_LEASE_MS,
): Promise<boolean> {
    const raw = await kv.get(LOCK_KEY);
    const heldAt = raw === null ? NaN : Number(raw);
    if (!Number.isNaN(heldAt) && heldAt + leaseMs > nowMs) return false;
    // TTL is a backstop so a crashed sweep can't wedge the lock forever.
    await kv.put(LOCK_KEY, String(nowMs), { expirationTtl: 300 });
    return true;
}
