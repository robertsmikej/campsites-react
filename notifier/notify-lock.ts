import type { LockKv } from "./sweep-lock";

const LOCK_KEY = "notifier:notify-lock";
const DEFAULT_LEASE_MS = 2 * 60 * 1000;

// Best-effort single-flight for the notify pass (runTick). The notify pass does
// read-modify-write on singleton KV keys (notifier:first-seen / :recent / :stats)
// and per-user state; nothing merges those server-side, so two overlapping ticks
// would clobber each other's writes (lost stats counter, resurrected first-seen
// sigs). This guards against that.
//
// Unlike the sweep lock (5-min cron, lease-only), the notify cron fires every
// minute — so the lease alone can't both prevent overlap (needs lease > run time)
// and avoid skipping normal ticks (needs lease < 60s). The holder therefore MUST
// call releaseNotifyLock on completion; the lease is only a crash backstop.
//
// KV is eventually consistent, so a rare double-acquire is still possible — this
// shrinks the overlap window dramatically rather than closing it absolutely.
export async function acquireNotifyLock(
    kv: LockKv,
    nowMs: number,
    leaseMs: number = DEFAULT_LEASE_MS,
): Promise<boolean> {
    const raw = await kv.get(LOCK_KEY);
    const heldAt = raw === null ? NaN : Number(raw);
    if (!Number.isNaN(heldAt) && heldAt > 0 && heldAt + leaseMs > nowMs) return false;
    await kv.put(LOCK_KEY, String(nowMs), { expirationTtl: Math.ceil(leaseMs / 1000) + 60 });
    return true;
}

// Release on completion so the next minute's tick can acquire immediately. "0"
// reads back as an always-stale heldAt; the 60s TTL (KV minimum) just garbage
// collects the marker.
export async function releaseNotifyLock(kv: LockKv): Promise<void> {
    await kv.put(LOCK_KEY, "0", { expirationTtl: 60 });
}
