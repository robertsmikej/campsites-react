// Compact "time ago" label for the dashboard freshness indicator. `nowMs` is
// injected (from useNowTick) so the value re-renders on a tick and the math
// stays testable. Returns null for missing/unparseable input so callers can
// omit the label entirely.
export function formatRelativeTime(iso: string | null | undefined, nowMs: number): string | null {
    if (!iso) return null;
    const then = Date.parse(iso);
    if (Number.isNaN(then)) return null;

    const sec = Math.max(0, Math.floor((nowMs - then) / 1000));
    if (sec < 45) return "just now";
    if (sec < 90) return "1m ago";

    const min = Math.round(sec / 60);
    if (min < 60) return `${min}m ago`;

    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;

    const day = Math.round(hr / 24);
    return `${day}d ago`;
}
