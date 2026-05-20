"use client";

import { useState, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import { toLocalIso } from "@/components/dashboard/helpers";

const DEFAULT_RANGE_DAYS = 42;
const STORAGE_KEY = "campwatch:date-range";

function getDefaultRange(): { start: Date; end: Date } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + DEFAULT_RANGE_DAYS - 1);
    return { start, end };
}

function loadDateRange(): { start: Date; end: Date } {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return getDefaultRange();
        const parsed = JSON.parse(raw) as { start: string; end: string };
        return { start: new Date(parsed.start), end: new Date(parsed.end) };
    } catch { return getDefaultRange(); }
}

function saveDateRange(start: Date, end: Date) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ start: toLocalIso(start), end: toLocalIso(end) }));
    } catch { /* ignore */ }
}

export interface UseDateRangeReturn {
    dateRange: { start: Date; end: Date };
    calRange: DateRange | undefined;
    datePickerOpen: boolean;
    setDatePickerOpen: (open: boolean) => void;
    handleCalSelect: (range: DateRange | undefined) => void;
}

export function useDateRange(): UseDateRangeReturn {
    const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>(getDefaultRange);
    const [datePickerOpen, setDatePickerOpen] = useState(false);
    const [calRange, setCalRange] = useState<DateRange | undefined>(undefined);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const r = loadDateRange();
            setDateRange(r);
            setCalRange({ from: r.start, to: r.end });
        }
    }, []);

    const handleCalSelect = (range: DateRange | undefined) => {
        setCalRange(range);
        if (range?.from && range?.to) {
            setDateRange({ start: range.from, end: range.to });
            saveDateRange(range.from, range.to);
            setDatePickerOpen(false);
        }
    };

    return { dateRange, calRange, datePickerOpen, setDatePickerOpen, handleCalSelect };
}
