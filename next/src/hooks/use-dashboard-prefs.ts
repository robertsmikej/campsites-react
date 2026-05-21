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

const DEFAULT_RANGE_DAYS = 42;

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

function getDefaultRange(): { start: Date; end: Date } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + DEFAULT_RANGE_DAYS - 1);
    return { start, end };
}

/** Convert stored ISO strings back to Date objects, falling back to the default range. */
function isoRangeToDates(stored: DashboardPrefs["dateRange"]): { start: Date; end: Date } {
    if (!stored) return getDefaultRange();
    try {
        return { start: new Date(stored.from), end: new Date(stored.to) };
    } catch {
        return getDefaultRange();
    }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseDashboardPrefsReturn {
    /** Concrete Date objects, always defined (falls back to 42-day window from today). */
    dateRange: { start: Date; end: Date };
    /** react-day-picker DateRange mirror of dateRange, for the calendar widget. */
    calRange: DateRange | undefined;
    datePickerOpen: boolean;
    setDatePickerOpen: (open: boolean) => void;
    handleCalSelect: (range: DateRange | undefined) => void;
    groupBy: GroupBy;
    setGroupBy: (v: GroupBy) => void;
}

export function useDashboardPrefs(): UseDashboardPrefsReturn {
    const [prefs, setPrefs] = useState<DashboardPrefs>(DEFAULT_PREFS);
    const [datePickerOpen, setDatePickerOpen] = useState(false);

    // Hydrate from localStorage on mount (avoids SSR mismatch).
    useEffect(() => {
        const loaded = loadPrefs();
        setPrefs(loaded);
    }, []);

    // Persist whenever prefs change.
    useEffect(() => {
        savePrefs(prefs);
    }, [prefs]);

    const dateRange = isoRangeToDates(prefs.dateRange);

    const calRange: DateRange | undefined = prefs.dateRange
        ? { from: dateRange.start, to: dateRange.end }
        : { from: dateRange.start, to: dateRange.end };

    const handleCalSelect = useCallback((range: DateRange | undefined) => {
        if (range?.from && range?.to) {
            setPrefs((p) => ({
                ...p,
                dateRange: { from: toLocalIso(range.from!), to: toLocalIso(range.to!) },
            }));
            setDatePickerOpen(false);
        }
    }, []);

    const setGroupBy = useCallback((v: GroupBy) => {
        setPrefs((p) => ({ ...p, groupBy: v }));
    }, []);

    return {
        dateRange,
        calRange,
        datePickerOpen,
        setDatePickerOpen,
        handleCalSelect,
        groupBy: prefs.groupBy,
        setGroupBy,
    };
}
