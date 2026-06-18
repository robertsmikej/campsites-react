// Concurrency-safe merge for per-user notifier dedup state.
//
// The notifier cron fires every minute, but each run takes longer than that
// (the rec.gov fetch is deliberately slow to avoid 429s), so runs overlap. Each
// run reads the whole per-user notifier-state at the top and writes the whole
// recomputed blob at the end. A plain overwrite means a run that read stale
// state — and didn't re-fetch a given campground this cycle — erases that
// campground's alerted ranges when it writes last. That dropped the dedup
// record and re-sent duplicate emails (low/normal-tier campgrounds, which
// aren't fetched every minute, were the visible victims).
//
// Merging instead of overwriting makes the write robust to a stale read:
// omission stops meaning deletion. Ranges only leave state by aging past the
// cooldown, which is exactly the intended dedup semantics — so observable
// behavior is unchanged, just no longer corrupted by overlapping writers.

export interface SeenRange {
    from: string;
    to: string;
    seen: string; // ISO timestamp
}

export type NotifierSites = Record<string, SeenRange[]>;

// Keep this in lockstep with the notifier's COOLDOWN_MS (notifier/check.ts).
export const COOLDOWN_MS = 24 * 60 * 60 * 1000;

function isValidRange(r: unknown): r is SeenRange {
    if (!r || typeof r !== "object") return false;
    const { from, to, seen } = r as Partial<SeenRange>;
    return (
        typeof from === "string" &&
        typeof to === "string" &&
        typeof seen === "string" &&
        !Number.isNaN(Date.parse(seen))
    );
}

// Consolidate overlapping date windows into single spans, keeping the latest
// `seen`. Mirrors mergeRanges in notifier/check.ts (half-open overlap on ISO
// date strings, which compare lexicographically).
function mergeRanges(ranges: SeenRange[]): SeenRange[] {
    const sorted = [...ranges].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
    const out: SeenRange[] = [];
    for (const r of sorted) {
        const last = out[out.length - 1];
        if (last && r.from < last.to) {
            if (r.to > last.to) last.to = r.to;
            if (Date.parse(r.seen) > Date.parse(last.seen)) last.seen = r.seen;
        } else {
            out.push({ ...r });
        }
    }
    return out;
}

/**
 * Union the incoming per-site ranges into whatever is already stored, dropping
 * ranges that have aged past the cooldown. A site key present in only one side
 * is retained; a key whose ranges all age out is removed entirely.
 */
export function mergeNotifierSites(
    existing: NotifierSites | undefined,
    incoming: NotifierSites | undefined,
    nowMs: number,
    cooldownMs: number = COOLDOWN_MS,
): NotifierSites {
    const cutoff = nowMs - cooldownMs;
    const keys = new Set([...Object.keys(existing ?? {}), ...Object.keys(incoming ?? {})]);
    const out: NotifierSites = {};
    for (const key of keys) {
        const combined = [...(existing?.[key] ?? []), ...(incoming?.[key] ?? [])].filter(isValidRange);
        const merged = mergeRanges(combined).filter((r) => Date.parse(r.seen) > cutoff);
        if (merged.length) out[key] = merged;
    }
    return out;
}
