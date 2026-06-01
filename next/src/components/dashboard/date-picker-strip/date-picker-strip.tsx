"use client";

import type { DateRange } from "react-day-picker";
import { GroupingToggle } from "./grouping-toggle";
import { DateRangeCalendar } from "./date-range-calendar";
import { Legend } from "./legend";
function formatShortRange(start: Date, end: Date): string {
    const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
    return `${fmt.format(start)} – ${fmt.format(end)}`;
}

interface DatePickerStripProps {
    dateRange: { start: Date; end: Date };
    calRange: DateRange | undefined;
    datePickerOpen: boolean;
    setDatePickerOpen: (open: boolean) => void;
    handleCalSelect: (range: DateRange | undefined) => void;
    isMobile: boolean;
    groupBy: "region" | "status" | "all";
    onGroupBy: (v: "region" | "status" | "all") => void;
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
    groupBy,
    onGroupBy,
    hasCustomRange,
    onClearDates,
}: DatePickerStripProps) {
    return (
        <div className="flex gap-[10px] items-center mb-6 flex-wrap">
            <GroupingToggle groupBy={groupBy} onGroupBy={onGroupBy} />

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
