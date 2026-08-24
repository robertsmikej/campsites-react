"use client";

import { useCallback, useEffect, useState } from "react";
import type { DateRange } from "react-day-picker";
import { toLocalIso } from "@/components/dashboard/helpers";

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const STORAGE_KEY = "campwatch:group-date-ranges";

type StoredRanges = Record<string, { from: string; to: string }>;

function loadGroupRanges(): StoredRanges {
    if (typeof window === "undefined") return {};
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as StoredRanges) : {};
    } catch {
        return {};
    }
}

function saveGroupRanges(ranges: StoredRanges): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ranges));
    } catch {
        // ignore storage errors
    }
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const DEFAULT_RANGE_DAYS = 120;

function parseLocalIso(iso: string): Date {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Compute the default date range for a group from its derived season window. */
function getGroupDefaultRange(groupDateRange: { start: string; end: string } | null): {
    start: Date;
    end: Date;
} {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!groupDateRange) {
        const end = new Date(today);
        end.setDate(today.getDate() + DEFAULT_RANGE_DAYS - 1);
        return { start: today, end };
    }

    const seasonStart = parseLocalIso(groupDateRange.start);
    const seasonEnd = parseLocalIso(groupDateRange.end);

    // Start: later of today or season start (don't show past dates).
    const start = today > seasonStart ? today : seasonStart;
    // If start is past the season end, show season end as a collapsed window.
    if (start > seasonEnd) {
        return { start: seasonEnd, end: seasonEnd };
    }

    // End: earlier of start + 120 days or season end.
    const defaultEnd = new Date(start);
    defaultEnd.setDate(start.getDate() + DEFAULT_RANGE_DAYS - 1);
    const end = defaultEnd < seasonEnd ? defaultEnd : seasonEnd;

    return { start, end };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseGroupDateRangeReturn {
    dateRange: { start: Date; end: Date };
    calRange: DateRange | undefined;
    hasCustomRange: boolean;
    datePickerOpen: boolean;
    setDatePickerOpen: (open: boolean) => void;
    handleCalSelect: (range: DateRange | undefined) => void;
    clearDateRange: () => void;
}

/**
 * Per-group date range hook. Each group section gets independent date picker
 * state and an independently stored custom range.
 *
 * @param groupKey Stable identifier for storage. Use the group name, or a
 *   sentinel like "__default__" for the ungrouped bucket.
 * @param groupDateRange Derived season window from the group's campground dates.
 */
export function useGroupDateRange(
    groupKey: string,
    groupDateRange: { start: string; end: string } | null,
): UseGroupDateRangeReturn {
    const storageKey = groupKey || "__default__";
    const defaultRange = getGroupDefaultRange(groupDateRange);

    const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
    const [datePickerOpen, setDatePickerOpen] = useState(false);
    const [calRange, setCalRange] = useState<DateRange | undefined>(undefined);

    // Hydrate from localStorage on mount.
    useEffect(() => {
        const stored = loadGroupRanges()[storageKey];
        if (stored) {
            setCustomRange(stored);
            setCalRange({ from: parseLocalIso(stored.from), to: parseLocalIso(stored.to) });
        }
    }, [storageKey]);

    const dateRange = customRange
        ? { start: parseLocalIso(customRange.from), end: parseLocalIso(customRange.to) }
        : defaultRange;

    const handleCalSelect = useCallback(
        (range: DateRange | undefined) => {
            setCalRange(range);
            if (range?.from && range?.to) {
                const stored = { from: toLocalIso(range.from), to: toLocalIso(range.to) };
                setCustomRange(stored);
                // Persist
                const all = loadGroupRanges();
                all[storageKey] = stored;
                saveGroupRanges(all);
                setDatePickerOpen(false);
            }
        },
        [storageKey],
    );

    const clearDateRange = useCallback(() => {
        setCalRange(undefined);
        setCustomRange(null);
        const all = loadGroupRanges();
        delete all[storageKey];
        saveGroupRanges(all);
        setDatePickerOpen(false);
    }, [storageKey]);

    return {
        dateRange,
        calRange,
        hasCustomRange: customRange !== null,
        datePickerOpen,
        setDatePickerOpen,
        handleCalSelect,
        clearDateRange,
    };
}
