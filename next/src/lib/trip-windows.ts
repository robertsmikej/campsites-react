// Trip windows: user-declared "I want to camp these dates" ranges that boost
// alerts. Matching is deliberately independent of stayLengths/validStartDays,
// notify scope, blackouts, and the campground watch dates: a trip match means
// "this one site can host the whole (flex-adjusted) stay".
// ISO YYYY-MM-DD strings compare correctly as strings; day arithmetic goes
// through UTC so DST can't shift a calendar day.

import { IGNORE_CAMPSITE_TYPES } from "./recgov/types";
import type { StayMatch, TripWindow, Campground } from "@/types/campground";

export const TRIP_MAX_WINDOWS = 10;
export const TRIP_MAX_FLEX_DAYS = 3;
export const TRIP_MAX_LABEL = 80;
/** Longest span (in nights) a single trip window may cover. Unbounded spans
 *  amplify rec.gov fetch volume (every month in range joins the fetch plan). */
export const TRIP_MAX_NIGHTS = 30;
/** Fast-lane (every-minute) polling starts this many days before arrival. */
export const TRIP_FAST_LANE_LEAD_DAYS = 14;

export interface TripSiteHit {
    windowId: string;
    campgroundId: string;
    campgroundName: string;
    siteId: string;
    siteName: string;
    tier: "favorites" | "worthwhile" | "all-others";
    /** Maximal consecutive open run within [window.from, window.to) covering the core. */
    run: StayMatch;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Server-side "today" for trip-window liveness. Uses an 8h westward grace
 *  (UTC-8) so a window stays live through its final evening for US users;
 *  after the grace it is genuinely past everywhere in the US. */
export function serverTodayIso(now: Date = new Date()): string {
    return new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** Whole days from `fromIso` to `toIso` (positive when to > from). */
export function diffDays(fromIso: string, toIso: string): number {
    return Math.round((Date.parse(toIso + "T00:00:00Z") - Date.parse(fromIso + "T00:00:00Z")) / DAY_MS);
}

/** The nights that MUST be open: the window shrunk by flexDays on each end. */
export function coreRange(w: TripWindow): { from: string; to: string } {
    const flex = w.flexDays ?? 0;
    return { from: addDaysIso(w.from, flex), to: addDaysIso(w.to, -flex) };
}

/** Checkout day has arrived or passed (the last night is to - 1). */
export function windowIsPast(w: TripWindow, todayIso: string): boolean {
    return w.to <= todayIso;
}

/** Inside the fast-lane lead window and not past. */
export function windowIsImminent(w: TripWindow, todayIso: string): boolean {
    return !windowIsPast(w, todayIso) && addDaysIso(w.from, -TRIP_FAST_LANE_LEAD_DAYS) <= todayIso;
}

export function windowTargets(w: TripWindow, campgroundId: string): boolean {
    return !w.campgroundIds || w.campgroundIds.length === 0 || w.campgroundIds.includes(campgroundId);
}

/** Non-past windows that target the campground. */
export function activeWindowsFor(
    windows: TripWindow[] | undefined,
    campgroundId: string,
    todayIso: string,
): TripWindow[] {
    return (windows ?? []).filter((w) => !windowIsPast(w, todayIso) && windowTargets(w, campgroundId));
}

export function isNightInWindow(nightIso: string, w: TripWindow): boolean {
    return w.from <= nightIso && nightIso < w.to;
}

export function isNightInAnyWindow(nightIso: string, windows: TripWindow[] | undefined): boolean {
    return (windows ?? []).some((w) => isNightInWindow(nightIso, w));
}

/** Every core night open at this site. */
export function siteMatchesWindow(openNights: ReadonlySet<string>, w: TripWindow): boolean {
    const core = coreRange(w);
    if (core.from >= core.to) return false; // flex ate the window; validation prevents this
    for (let night = core.from; night < core.to; night = addDaysIso(night, 1)) {
        if (!openNights.has(night)) return false;
    }
    return true;
}

/** Longest consecutive open run inside [w.from, w.to) containing the core, or
 *  null when the core isn't fully open. This is what alerts display and what
 *  the dedup state records. */
export function maximalRunInWindow(openNights: ReadonlySet<string>, w: TripWindow): StayMatch | null {
    if (!siteMatchesWindow(openNights, w)) return null;
    const core = coreRange(w);
    let from = core.from;
    while (from > w.from && openNights.has(addDaysIso(from, -1))) from = addDaysIso(from, -1);
    let to = core.to;
    while (to < w.to && openNights.has(to)) to = addDaysIso(to, 1);
    return { from, to, nights: diffDays(from, to) };
}

interface RawSiteMonth {
    site: string;
    campsite_type: string;
    availabilities: Record<string, string>;
}

/** Open nights per siteId from raw rec.gov month blobs. Null slots (cache
 *  misses) are skipped; datetimes normalize to YYYY-MM-DD; only "Available"
 *  nights count; ignored campsite types are dropped. */
export function openNightsBySiteFromRaw(
    rawApiResults: unknown[] | null | undefined,
): Map<string, { siteId: string; siteName: string; nights: Set<string> }> {
    const out = new Map<string, { siteId: string; siteName: string; nights: Set<string> }>();
    for (const raw of (rawApiResults ?? []) as Array<{
        campsites?: Record<string, RawSiteMonth>;
    } | null>) {
        if (!raw?.campsites) continue;
        for (const [siteId, siteData] of Object.entries(raw.campsites)) {
            if (IGNORE_CAMPSITE_TYPES.includes(siteData.campsite_type)) continue;
            let entry = out.get(siteId);
            if (!entry) {
                entry = { siteId, siteName: siteData.site, nights: new Set() };
                out.set(siteId, entry);
            }
            for (const [date, status] of Object.entries(siteData.availabilities)) {
                if (status !== "Available") continue;
                const day = date.split("T")[0];
                if (day) entry.nights.add(day);
            }
        }
    }
    return out;
}

/** All trip hits at one campground for the user's windows. */
export function tripHitsForCampground(
    rawApiResults: unknown[] | null | undefined,
    campground: Pick<Campground, "id" | "name" | "sites">,
    windows: TripWindow[] | undefined,
    todayIso: string,
): TripSiteHit[] {
    const active = activeWindowsFor(windows, campground.id, todayIso);
    if (active.length === 0) return [];
    const bySite = openNightsBySiteFromRaw(rawApiResults);
    if (bySite.size === 0) return [];
    const favorites = new Set(campground.sites?.favorites ?? []);
    const worthwhile = new Set(campground.sites?.worthwhile ?? []);
    const hits: TripSiteHit[] = [];
    for (const w of active) {
        for (const site of bySite.values()) {
            const run = maximalRunInWindow(site.nights, w);
            if (!run) continue;
            const tier = favorites.has(site.siteName)
                ? ("favorites" as const)
                : worthwhile.has(site.siteName)
                  ? ("worthwhile" as const)
                  : ("all-others" as const);
            hits.push({
                windowId: w.id,
                campgroundId: campground.id,
                campgroundName: campground.name,
                siteId: site.siteId,
                siteName: site.siteName,
                tier,
                run,
            });
        }
    }
    return hits;
}

/** PUT-body validation for globalSettings.tripWindows. */
export function validTripWindows(v: unknown): boolean {
    if (v === undefined) return true;
    if (!Array.isArray(v) || v.length > TRIP_MAX_WINDOWS) return false;
    const seenIds = new Set<string>();
    return v.every((r) => {
        if (!r || typeof r !== "object") return false;
        const w = r as Partial<TripWindow>;
        if (typeof w.id !== "string" || w.id.length === 0 || w.id.length > 64) return false;
        // Duplicate ids would double-fire dedup keys and collide push tags.
        if (seenIds.has(w.id)) return false;
        seenIds.add(w.id);
        if (typeof w.from !== "string" || !ISO_DAY_RE.test(w.from)) return false;
        if (typeof w.to !== "string" || !ISO_DAY_RE.test(w.to)) return false;
        if (w.from >= w.to) return false;
        if (diffDays(w.from, w.to) > TRIP_MAX_NIGHTS) return false;
        if (w.label !== undefined && (typeof w.label !== "string" || w.label.length > TRIP_MAX_LABEL))
            return false;
        if (w.flexDays !== undefined) {
            if (typeof w.flexDays !== "number" || !Number.isInteger(w.flexDays)) return false;
            if (w.flexDays < 0 || w.flexDays > TRIP_MAX_FLEX_DAYS) return false;
            // The core must keep at least one night.
            if (diffDays(w.from, w.to) <= 2 * w.flexDays) return false;
        }
        if (w.campgroundIds !== undefined) {
            if (!Array.isArray(w.campgroundIds) || w.campgroundIds.length > 100) return false;
            if (!w.campgroundIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 64))
                return false;
        }
        return true;
    });
}
