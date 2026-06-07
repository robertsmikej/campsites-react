import type { ProcessedCampground, SiteAvailability } from "@/types/campground";
import { toLocalIso } from "@/components/dashboard/helpers";

export type Tier = "fav" | "worth" | "other";
export const TIER_ORDER: Record<Tier, number> = { fav: 0, worth: 1, other: 2 };
export const TIER_MARK: Record<Tier, string> = { fav: "★", worth: "◇", other: "·" };

const DAY_MS = 86400000;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface Horizon {
    /** Local-midnight start of the axis. */
    start: Date;
    /** Inclusive day count across [start, end]. */
    totalDays: number;
}

export function buildHorizon(start: Date, end: Date): Horizon {
    const s = new Date(start);
    s.setHours(0, 0, 0, 0);
    const e = new Date(end);
    e.setHours(0, 0, 0, 0);
    const totalDays = Math.round((+e - +s) / DAY_MS) + 1;
    return { start: s, totalDays: Math.max(1, totalDays) };
}

function parseLocalIso(iso: string): Date {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Day index of an ISO (YYYY-MM-DD) or Date, relative to horizon start. */
export function dayIndexOf(h: Horizon, iso: string | Date): number {
    const d = typeof iso === "string" ? parseLocalIso(iso) : new Date(iso);
    d.setHours(0, 0, 0, 0);
    return Math.round((+d - +h.start) / DAY_MS);
}

export function dateAt(h: Horizon, i: number): Date {
    const d = new Date(h.start);
    d.setDate(d.getDate() + i);
    return d;
}

export function pct(h: Horizon, i: number): number {
    return (i / h.totalDays) * 100;
}

export function isWeekendNight(d: Date): boolean {
    const g = d.getDay();
    return g === 5 || g === 6;
}

export function siteTier(cg: Pick<ProcessedCampground, "sites">, siteName: string): Tier {
    if (cg.sites?.favorites?.includes(siteName)) return "fav";
    if (cg.sites?.worthwhile?.includes(siteName)) return "worth";
    return "other";
}

/** Night indices [from, to) clamped to the horizon, for one match. */
function matchNightIndices(h: Horizon, from: string, to: string): [number, number] | null {
    const a = dayIndexOf(h, from);
    const b = dayIndexOf(h, to) - 1; // departure date is not a night
    const lo = Math.max(0, a);
    const hi = Math.min(h.totalDays - 1, b);
    if (hi < lo) return null;
    return [lo, hi];
}

/** Merge sorted inclusive ranges that touch or overlap. */
function mergeRuns(ranges: Array<[number, number]>): Array<[number, number]> {
    const sorted = [...ranges].sort((x, y) => x[0] - y[0]);
    const out: Array<[number, number]> = [];
    for (const [s, e] of sorted) {
        const last = out[out.length - 1];
        if (last && s <= last[1] + 1) last[1] = Math.max(last[1], e);
        else out.push([s, e]);
    }
    return out;
}

export function siteOpenRuns(h: Horizon, site: SiteAvailability): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    for (const m of site.matches ?? []) {
        const r = matchNightIndices(h, m.from, m.to);
        if (r) ranges.push(r);
    }
    return mergeRuns(ranges);
}

export interface CampgroundRunsResult {
    open: Array<[number, number]>;
    limited: Array<[number, number]>;
    openNights: number;
    limitedNights: number;
}

/** Per-day open-site count -> status runs (>=3 open, 1-2 limited, 0 booked). */
export function campgroundRuns(h: Horizon, cg: ProcessedCampground): CampgroundRunsResult {
    const counts = new Array<number>(h.totalDays).fill(0);
    for (const site of Object.values(cg.siteAvailability ?? {})) {
        for (const [lo, hi] of siteOpenRuns(h, site)) {
            for (let i = lo; i <= hi; i++) counts[i]!++;
        }
    }
    const status = counts.map((n) => (n >= 3 ? 2 : n >= 1 ? 1 : 0));
    return {
        open: runsFromStatus(status, 2),
        limited: runsFromStatus(status, 1),
        openNights: status.filter((s) => s === 2).length,
        limitedNights: status.filter((s) => s === 1).length,
    };
}

export function runsFromStatus(arr: number[], val: number): Array<[number, number]> {
    const res: Array<[number, number]> = [];
    let i = 0;
    while (i < arr.length) {
        if (arr[i] === val) {
            let j = i;
            while (j < arr.length && arr[j] === val) j++;
            res.push([i, j - 1]);
            i = j;
        } else i++;
    }
    return res;
}

export function rangeLabel(h: Horizon, s: number, e: number): string {
    const ds = dateAt(h, s);
    const de = dateAt(h, e);
    if (s === e) return `${MON[ds.getMonth()]} ${ds.getDate()}`;
    if (ds.getMonth() === de.getMonth()) return `${MON[ds.getMonth()]} ${ds.getDate()}–${de.getDate()}`;
    return `${MON[ds.getMonth()]} ${ds.getDate()}–${MON[de.getMonth()]} ${de.getDate()}`;
}

/** A range label that includes the day-of-week of the first/last night (mobile detail). */
export function dowRangeLabel(h: Horizon, s: number, e: number): string {
    const ds = dateAt(h, s);
    const de = dateAt(h, e);
    const fmt = (d: Date) => `${WEEKDAYS[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`;
    if (s === e) return fmt(ds);
    return `${fmt(ds)} – ${fmt(de)}`;
}

/** True when any night in the inclusive index range falls on Fri/Sat. */
export function runIncludesWeekend(h: Horizon, s: number, e: number): boolean {
    for (let i = s; i <= e; i++) if (isWeekendNight(dateAt(h, i))) return true;
    return false;
}

/** Month-start ticks within the horizon, for the axis + dividers. */
export function monthTicks(h: Horizon): Array<{ index: number; label: string; year: number }> {
    const ticks: Array<{ index: number; label: string; year: number }> = [];
    const end = dateAt(h, h.totalDays - 1);
    const cur = new Date(h.start.getFullYear(), h.start.getMonth(), 1);
    while (cur <= end) {
        const idx = Math.round((+cur - +h.start) / DAY_MS);
        ticks.push({ index: Math.max(0, idx), label: MON[cur.getMonth()]!, year: cur.getFullYear() });
        cur.setMonth(cur.getMonth() + 1);
    }
    return ticks;
}

export function nowIndex(h: Horizon, now: Date = new Date()): number | null {
    const i = dayIndexOf(h, now);
    return i >= 0 && i < h.totalDays ? i : null;
}

/** Cleaned, human-readable campsite type (no favorite suffix). */
export function siteFeature(site: SiteAvailability): string {
    const raw = site.campsite_type?.toLowerCase().replace(/_/g, " ").trim() ?? "";
    return raw
        .replace(/standard nonelectric/, "standard")
        .replace(/group standard area/, "group")
        .replace(/tent only nonelectric/, "tent only");
}

export interface DisplaySite {
    site: SiteAvailability;
    tier: Tier;
    /** true when synthesized from a tagged name with no availability (booked all season). */
    synthetic: boolean;
}

/** Sites with openings (from the snapshot), plus a "booked all season" row for
 *  every other site we know about — the full `roster` when loaded, else at least
 *  the tagged (favorite/worthwhile) sites so those always appear. Favorites-first. */
export function buildDisplaySites(cg: ProcessedCampground, roster?: string[]): DisplaySite[] {
    const present = Object.values(cg.siteAvailability ?? {});
    const presentNames = new Set(present.map((s) => s.siteName));
    const syntheticNames = new Set<string>();
    for (const name of [...(cg.sites?.favorites ?? []), ...(cg.sites?.worthwhile ?? []), ...(roster ?? [])]) {
        if (name && !presentNames.has(name)) syntheticNames.add(name);
    }
    const synthetic: SiteAvailability[] = [...syntheticNames].map((name) => ({
        siteId: name,
        siteName: name,
        dates: [],
        matches: [],
        excludedMatches: [],
    }));
    return [
        ...present.map((s) => ({ site: s, tier: siteTier(cg, s.siteName), synthetic: false })),
        ...synthetic.map((s) => ({ site: s, tier: siteTier(cg, s.siteName), synthetic: true })),
    ].sort(
        (a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.site.siteName.localeCompare(b.site.siteName),
    );
}

/** Reservation deep-link for a site (uses its first match's dates). */
export function reservationUrl(site: SiteAvailability): string {
    const m = site.matches?.[0];
    if (!m) return `https://www.recreation.gov/camping/campsites/${site.siteId}`;
    return `https://www.recreation.gov/camping/campsites/${site.siteId}?arrivalDate=${m.from}&departureDate=${m.to}`;
}

/** Reservation deep-link for a specific open run (night index range). Departure
 *  is the night after the last open night (rec.gov departure date is exclusive). */
export function siteRangeUrl(siteId: string, h: Horizon, run: [number, number]): string {
    const arrival = toLocalIso(dateAt(h, run[0]));
    const departure = toLocalIso(dateAt(h, run[1] + 1));
    return `https://www.recreation.gov/camping/campsites/${siteId}?arrivalDate=${arrival}&departureDate=${departure}`;
}
