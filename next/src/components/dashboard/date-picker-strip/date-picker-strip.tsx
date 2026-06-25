"use client";

import type { DateRange } from "react-day-picker";
import { DateRangeCalendar } from "./date-range-calendar";
import { Legend } from "./legend";
function formatShortRange(start: Date, end: Date): string {
    const wd = new Intl.DateTimeFormat("en-US", { weekday: "short" });
    const md = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
    const fmt = (d: Date) => `${wd.format(d)} ${md.format(d)}`; // "Sat Aug 8"
    return `${fmt(start)} – ${fmt(end)}`;
}

interface DatePickerStripProps {
    dateRange: { start: Date; end: Date };
    calRange: DateRange | undefined;
    datePickerOpen: boolean;
    setDatePickerOpen: (open: boolean) => void;
    handleCalSelect: (range: DateRange | undefined) => void;
    isMobile: boolean;
    hasCustomRange?: boolean;
    onClearDates?: () => void;
}

export function DatePickerStrip({
    dateRange,
    calRange,
    datePickerOpen,
    setDatePickerOpen,
    handleCalSelect,
    isMobile,
    hasCustomRange,
    onClearDates,
}: DatePickerStripProps) {
    return (
        <div className="flex gap-[10px] items-center mb-6 flex-wrap">
            <DateRangeCalendar
                calRange={calRange}
                datePickerOpen={datePickerOpen}
                setDatePickerOpen={setDatePickerOpen}
                handleCalSelect={handleCalSelect}
                isMobile={isMobile}
                hasCustomRange={hasCustomRange}
                onClearDates={onClearDates}
            />

            <span className="font-italic-serif text-[14px] font-medium italic leading-none text-cw-ink-soft">
                {formatShortRange(dateRange.start, dateRange.end)}
            </span>

            {!isMobile && <Legend />}
        </div>
    );
}
