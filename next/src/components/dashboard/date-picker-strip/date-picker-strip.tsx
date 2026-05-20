"use client";

import type { DateRange } from "react-day-picker";
import { FI } from "@/components/field-notes/tokens";
import { CW } from "@/components/field-notes/cw-tokens";
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
}: DatePickerStripProps) {
    return (
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
            <GroupingToggle groupBy={groupBy} onGroupBy={onGroupBy} isMobile={isMobile} />

            <DateRangeCalendar
                calRange={calRange}
                datePickerOpen={datePickerOpen}
                setDatePickerOpen={setDatePickerOpen}
                handleCalSelect={handleCalSelect}
                isMobile={isMobile}
            />

            <span style={{ font: `500 italic 14px/1 ${FI}`, color: CW.inkSoft }}>
                {formatShortRange(dateRange.start, dateRange.end)}
            </span>

            {!isMobile && <Legend />}
        </div>
    );
}
