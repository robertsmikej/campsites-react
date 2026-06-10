import { type Tier, isWeekendNight, siteTier } from "@/lib/timeline";
import { toLocalIso } from "@/components/dashboard/helpers";
import type { BlackoutRange, ProcessedCampground } from "@/types/campground";
import { stayOverlapsBlackout } from "@/lib/blackout";

const DAY_MS = 86400000;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface PlanWindow {
    start: Date;
    end: Date;
}

export interface CandidateTrip {
    campgroundId: string;
    campgroundName: string;
    area: string;
    siteId: string;
    siteName: string;
    tier: Tier;
    from: string;
    to: string;
    nights: number;
    includesWeekend: boolean;
}

export interface PlannedTrip extends CandidateTrip {
    id: string;
    slotIndex: number;
    bookUrl: string;
    locked: boolean;
}

export interface SummerPlan {
    trips: PlannedTrip[];
    stats: { tripCount: number; campgroundCount: number; weekendCount: number; window: PlanWindow };
    notes: string[];
}

export interface PlanOptions {
    window: PlanWindow;
    targetTrips: number;
    lockedTripIds?: string[];
    excludeTripIds?: string[];
    /** Only consider trips that include a Fri/Sat night. */
    weekendOnly?: boolean;
    /** Only consider ★ favorite-tagged sites. */
    favoritesOnly?: boolean;
    /** User blackout ranges — trips overlapping any blacked-out night are excluded. */
    blackoutDates?: BlackoutRange[];
}

function parseLocalIso(iso: string): Date {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** First day of `startMonth` to the last day of `endMonth` (0-indexed months). */
export function monthWindow(year: number, startMonth: number, endMonth: number): PlanWindow {
    const start = new Date(year, startMonth, 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(year, endMonth + 1, 0); // day 0 of next month = last day of endMonth
    end.setHours(0, 0, 0, 0);
    return { start, end };
}

/** Jun 1 – Sep 30 of `year` (the default summer window). */
export function summerWindow(year: number): PlanWindow {
    return monthWindow(year, 5, 8);
}

/** Year with the most Jun–Sep openings across the snapshot; falls back to now's year. */
export function pickSummerYear(campgrounds: ProcessedCampground[], now: Date): number {
    const counts = new Map<number, number>();
    for (const cg of campgrounds) {
        for (const s of Object.values(cg.siteAvailability ?? {})) {
            for (const m of s.matches ?? []) {
                const d = parseLocalIso(m.from);
                const mo = d.getMonth();
                if (mo >= 5 && mo <= 8) counts.set(d.getFullYear(), (counts.get(d.getFullYear()) ?? 0) + 1);
            }
        }
    }
    let best = now.getFullYear();
    let bestN = -1;
    for (const [y, n] of counts) {
        if (n > bestN) {
            best = y;
            bestN = n;
        }
    }
    return best;
}

function matchIncludesWeekend(from: string, to: string): boolean {
    const end = parseLocalIso(to);
    for (const d = parseLocalIso(from); d < end; d.setDate(d.getDate() + 1)) {
        if (isWeekendNight(d)) return true;
    }
    return false;
}

export function buildCandidates(campgrounds: ProcessedCampground[], window: PlanWindow): CandidateTrip[] {
    const startIso = toLocalIso(window.start);
    const endIso = toLocalIso(window.end);
    const out: CandidateTrip[] = [];
    for (const cg of campgrounds) {
        for (const s of Object.values(cg.siteAvailability ?? {})) {
            const tier = siteTier(cg, s.siteName);
            for (const m of s.matches ?? []) {
                if (m.from < startIso || m.from > endIso) continue;
                out.push({
                    campgroundId: cg.id,
                    campgroundName: cg.name,
                    area: cg.area ?? "",
                    siteId: s.siteId,
                    siteName: s.siteName,
                    tier,
                    from: m.from,
                    to: m.to,
                    nights: m.nights,
                    includesWeekend: matchIncludesWeekend(m.from, m.to),
                });
            }
        }
    }
    return out;
}

const TIER_SCORE: Record<Tier, number> = { fav: 3, worth: 2, other: 1 };

function tripId(c: { campgroundId: string; siteId: string; from: string; to: string }): string {
    return `${c.campgroundId}:${c.siteId}:${c.from}:${c.to}`;
}

function bookUrlFor(c: CandidateTrip): string {
    return `https://www.recreation.gov/camping/campsites/${c.siteId}?arrivalDate=${c.from}&departureDate=${c.to}`;
}

function scoreOf(c: CandidateTrip): number {
    return TIER_SCORE[c.tier] + (c.includesWeekend ? 1.5 : 0);
}

function better(a: CandidateTrip, b: CandidateTrip): number {
    return (
        scoreOf(b) - scoreOf(a) ||
        a.from.localeCompare(b.from) ||
        b.nights - a.nights ||
        a.campgroundName.localeCompare(b.campgroundName) ||
        a.siteName.localeCompare(b.siteName)
    );
}

function pick(pool: CandidateTrip[]): CandidateTrip | null {
    if (pool.length === 0) return null;
    return [...pool].sort(better)[0]!;
}

function overlaps(a: { from: string; to: string }, b: { from: string; to: string }): boolean {
    return a.from < b.to && b.from < a.to; // [from, to) half-open
}

function totalDays(w: PlanWindow): number {
    return Math.round((+w.end - +w.start) / DAY_MS) + 1;
}

function slotOf(w: PlanWindow, iso: string, slots: number): number {
    const idx = Math.round((+parseLocalIso(iso) - +w.start) / DAY_MS);
    const per = totalDays(w) / slots;
    return Math.min(slots - 1, Math.max(0, Math.floor(idx / per)));
}

function slotLabel(w: PlanWindow, s: number, slots: number): string {
    const per = totalDays(w) / slots;
    const startD = new Date(w.start);
    startD.setDate(startD.getDate() + Math.floor(s * per));
    const endD = new Date(w.start);
    endD.setDate(endD.getDate() + Math.min(totalDays(w) - 1, Math.floor((s + 1) * per) - 1));
    const a = MON[startD.getMonth()];
    const b = MON[endD.getMonth()];
    return a === b ? `${a}` : `${a}–${b}`;
}

export function planSummer(campgrounds: ProcessedCampground[], opts: PlanOptions): SummerPlan {
    const { window, targetTrips } = opts;
    const locked = new Set(opts.lockedTripIds ?? []);
    const excluded = new Set(opts.excludeTripIds ?? []);
    let candidates = buildCandidates(campgrounds, window);
    if (opts.favoritesOnly) candidates = candidates.filter((c) => c.tier === "fav");
    if (opts.weekendOnly) candidates = candidates.filter((c) => c.includesWeekend);
    if (opts.blackoutDates?.length)
        candidates = candidates.filter(
            (c) => locked.has(tripId(c)) || !stayOverlapsBlackout(c.from, c.to, opts.blackoutDates),
        );
    const byId = new Map(candidates.map((c) => [tripId(c), c]));

    const chosen: CandidateTrip[] = [];
    const usedCg = new Set<string>();
    const notes: string[] = [];

    // Place locked trips first (fixed); their slots are skipped below.
    for (const id of locked) {
        const c = byId.get(id);
        if (c && !chosen.some((x) => tripId(x) === id)) {
            chosen.push(c);
            usedCg.add(c.campgroundId);
        }
    }
    const lockedSlots = new Set(chosen.map((c) => slotOf(window, c.from, targetTrips)));

    const taken = (c: CandidateTrip) => chosen.some((x) => tripId(x) === tripId(c));

    for (let s = 0; s < targetTrips; s++) {
        if (lockedSlots.has(s)) continue;
        const inSlot = candidates.filter(
            (c) => slotOf(window, c.from, targetTrips) === s && !excluded.has(tripId(c)) && !taken(c),
        );
        // 1) unused campground, no date overlap
        let chosenC = pick(
            inSlot.filter((c) => !usedCg.has(c.campgroundId) && !chosen.some((x) => overlaps(x, c))),
        );
        // 2) relax: allow date overlap
        if (!chosenC) {
            chosenC = pick(inSlot.filter((c) => !usedCg.has(c.campgroundId)));
            if (chosenC) notes.push(`Allowed a date overlap to fill ${slotLabel(window, s, targetTrips)}.`);
        }
        // 3) relax: allow a repeated campground
        if (!chosenC) {
            chosenC = pick(inSlot.filter((c) => !chosen.some((x) => overlaps(x, c))));
            if (chosenC)
                notes.push(
                    `Repeated ${chosenC.campgroundName} to fill ${slotLabel(window, s, targetTrips)}.`,
                );
        }
        // 4) borrow the best unused, non-overlapping candidate from anywhere in the season
        if (!chosenC) {
            chosenC = pick(
                candidates.filter(
                    (c) =>
                        !excluded.has(tripId(c)) &&
                        !taken(c) &&
                        !usedCg.has(c.campgroundId) &&
                        !chosen.some((x) => overlaps(x, c)),
                ),
            );
            if (chosenC)
                notes.push(
                    `No openings in ${slotLabel(window, s, targetTrips)}; pulled another from the season.`,
                );
        }
        if (!chosenC) {
            notes.push(`No openings to fill ${slotLabel(window, s, targetTrips)}.`);
            continue;
        }
        chosen.push(chosenC);
        usedCg.add(chosenC.campgroundId);
    }

    chosen.sort((a, b) => a.from.localeCompare(b.from));
    const trips: PlannedTrip[] = chosen.map((c, i) => ({
        ...c,
        id: tripId(c),
        slotIndex: i,
        bookUrl: bookUrlFor(c),
        locked: locked.has(tripId(c)),
    }));

    return {
        trips,
        stats: {
            tripCount: trips.length,
            campgroundCount: new Set(trips.map((t) => t.campgroundId)).size,
            weekendCount: trips.filter((t) => t.includesWeekend).length,
            window,
        },
        notes,
    };
}
