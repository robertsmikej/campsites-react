"use client";

import { useCallback, useEffect, useState } from "react";
import type { DateRange } from "react-day-picker";
import { toLocalIso } from "@/components/dashboard/helpers";

// ---------------------------------------------------------------------------
// Types + constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "campwatch:prefs";

// Old separate keys — kept for one-time migration only.
const OLD_DATE_RANGE_KEY = "campwatch:date-range";
const OLD_GROUP_BY_KEY = "campwatch:watchlist-grouping";

export type GroupBy = "region" | "status" | "all";

export interface DashboardPrefs {
    dateRange: { from: string; to: string } | null; // ISO date strings (YYYY-MM-DD)
    groupBy: GroupBy;
    // TODO: sync to /api/me/prefs so preferences persist across devices/browsers.
}

const DEFAULT_PREFS: DashboardPrefs = {
    dateRange: null,
    groupBy: "region",
};

const DEFAULT_RANGE_DAYS = 120;

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function loadPrefs(): DashboardPrefs {
    if (typeof window === "undefined") return DEFAULT_PREFS;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };

        // One-time migration: read old separate keys, merge, write new blob, remove old keys.
        const oldDateRange = localStorage.getItem(OLD_DATE_RANGE_KEY);
        const oldGroupBy = localStorage.getItem(OLD_GROUP_BY_KEY);

        const migrated: DashboardPrefs = {
            // Old date-range shape was { start: string; end: string }; map to new { from, to }.
            dateRange: oldDateRange
                ? (() => {
                      const parsed = JSON.parse(oldDateRange) as { start: string; end: string };
                      return { from: parsed.start, to: parsed.end };
                  })()
                : null,
            groupBy: oldGroupBy ? (oldGroupBy.replace(/^"|"$/g, "") as GroupBy) : "region",
        };

        savePrefs(migrated);
        localStorage.removeItem(OLD_DATE_RANGE_KEY);
        localStorage.removeItem(OLD_GROUP_BY_KEY);

        return migrated;
    } catch {
        return DEFAULT_PREFS;
    }
}

function savePrefs(prefs: DashboardPrefs): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
        // ignore storage errors
    }
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Parse a YYYY-MM-DD string as a local-midnight Date. Using `new Date(iso)`
 *  parses date-only strings as UTC, which drifts a day in negative offsets;
 *  the default range is built from local midnight, so parse stored ISO the
 *  same way to keep the window aligned. */
function parseLocalIso(iso: string): Date {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function getDefaultRange(maxEnd?: Date): { start: Date; end: Date } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + DEFAULT_RANGE_DAYS - 1);
    // When the watchlist's latest season-end falls before the default horizon,
    // clamp the window to that end-date so we don't render dead ticks past the
    // last bookable day. As the season closes the window naturally shrinks
    // from 120 days down toward 0.
    if (maxEnd && maxEnd < end) {
        return { start, end: maxEnd };
    }
    return { start, end };
}

/** Convert stored ISO strings back to Date objects, falling back to the default range. */
function isoRangeToDates(stored: DashboardPrefs["dateRange"], maxEnd?: Date): { start: Date; end: Date } {
    if (!stored) return getDefaultRange(maxEnd);
    try {
        return { start: parseLocalIso(stored.from), end: parseLocalIso(stored.to) };
    } catch {
        return getDefaultRange(maxEnd);
    }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseDashboardPrefsReturn {
    /** Concrete Date objects, always defined (falls back to the default window from today). */
    dateRange: { start: Date; end: Date };
    /** In-progress calendar selection for the two-click range flow. `undefined`
     *  means no custom range is picked — the calendar opens empty and the
     *  dashboard uses the default window. */
    calRange: DateRange | undefined;
    /** True when a custom date range is committed (vs. the default window). */
    hasCustomRange: boolean;
    datePickerOpen: boolean;
    setDatePickerOpen: (open: boolean) => void;
    handleCalSelect: (range: DateRange | undefined) => void;
    /** Drop the custom range and snap back to the default window. */
    clearDateRange: () => void;
    groupBy: GroupBy;
    setGroupBy: (v: GroupBy) => void;
}

export function useDashboardPrefs(options?: { maxEnd?: Date }): UseDashboardPrefsReturn {
    const [prefs, setPrefs] = useState<DashboardPrefs>(DEFAULT_PREFS);
    const [datePickerOpen, setDatePickerOpen] = useState(false);
    // Transient calendar selection. Holds the in-progress two-click range
    // (and mirrors a committed custom range so reopening shows it). `undefined`
    // means no custom range — the calendar opens empty so the first click
    // starts a fresh range rather than collapsing a pre-selected one.
    const [calRange, setCalRange] = useState<DateRange | undefined>(undefined);

    // Hydrate from localStorage on mount (avoids SSR mismatch).
    useEffect(() => {
        const loaded = loadPrefs();
        setPrefs(loaded);
        if (loaded.dateRange) {
            setCalRange({
                from: parseLocalIso(loaded.dateRange.from),
                to: parseLocalIso(loaded.dateRange.to),
            });
        }
    }, []);

    // Persist whenever prefs change.
    useEffect(() => {
        savePrefs(prefs);
    }, [prefs]);

    const dateRange = isoRangeToDates(prefs.dateRange, options?.maxEnd);

    // react-day-picker fires this on every click. A partial range (`from` set,
    // `to` undefined) just updates the in-progress selection and keeps the
    // popover open; a complete range commits to prefs and closes.
    const handleCalSelect = useCallback((range: DateRange | undefined) => {
        setCalRange(range);
        if (range?.from && range?.to) {
            setPrefs((p) => ({
                ...p,
                dateRange: { from: toLocalIso(range.from!), to: toLocalIso(range.to!) },
            }));
            setDatePickerOpen(false);
        }
    }, []);

    const clearDateRange = useCallback(() => {
        setCalRange(undefined);
        setPrefs((p) => ({ ...p, dateRange: null }));
        setDatePickerOpen(false);
    }, []);

    const setGroupBy = useCallback((v: GroupBy) => {
        setPrefs((p) => ({ ...p, groupBy: v }));
    }, []);

    return {
        dateRange,
        calRange,
        hasCustomRange: prefs.dateRange !== null,
        datePickerOpen,
        setDatePickerOpen,
        handleCalSelect,
        clearDateRange,
        groupBy: prefs.groupBy,
        setGroupBy,
    };
}
