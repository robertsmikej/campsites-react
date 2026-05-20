"use client";

import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { CW } from "@/components/field-notes/cw-tokens";
import { FI, FM } from "@/components/field-notes/tokens";

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
            {/* Group toggle */}
            <div style={{ display: "inline-flex", border: `1px solid ${CW.ink}`, borderRadius: 2, overflow: "hidden" }}>
                {(["region", "status", "all"] as const).map((v, i) => (
                    <button
                        key={v}
                        onClick={() => onGroupBy(v)}
                        style={{
                            font: `700 ${isMobile ? 10 : 11}px/1 ${FM}`, letterSpacing: "0.12em", textTransform: "uppercase",
                            background: groupBy === v ? CW.ink : "transparent",
                            color: groupBy === v ? CW.cream : CW.ink,
                            border: "none",
                            borderLeft: i === 0 ? "none" : `1px solid ${CW.rule}`,
                            padding: isMobile ? "8px 10px" : "9px 12px", cursor: "pointer",
                        }}
                    >
                        {v === "region" ? "By Region" : v === "status" ? "By Status" : "All"}
                    </button>
                ))}
            </div>

            {/* Date picker */}
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                    <button style={{
                        font: `700 ${isMobile ? 10 : 11}px/1 ${FM}`, letterSpacing: "0.12em", textTransform: "uppercase",
                        background: "transparent", color: CW.ink, border: `1px solid ${CW.rule}`,
                        padding: isMobile ? "8px 10px" : "9px 12px", cursor: "pointer", borderRadius: 2,
                        display: "inline-flex", alignItems: "center", gap: 8,
                    }}>
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
                            <rect x="1.5" y="3" width="11" height="10" rx="1" />
                            <path d="M1.5 6 H12.5" />
                            <path d="M4 1.5 V4 M10 1.5 V4" />
                        </svg>
                        Pick dates →
                    </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        mode="range"
                        selected={calRange}
                        onSelect={handleCalSelect}
                        numberOfMonths={isMobile ? 1 : 2}
                    />
                </PopoverContent>
            </Popover>

            <span style={{ font: `500 italic 14px/1 ${FI}`, color: CW.inkSoft }}>
                {formatShortRange(dateRange.start, dateRange.end)}
            </span>

            {/* Legend */}
            {!isMobile && (
                <div style={{ marginLeft: "auto", display: "flex", gap: 14, alignItems: "center", font: `400 italic 13px/1 ${FI}`, color: CW.inkSoft }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 8, height: 8, background: CW.forest, borderRadius: 2 }} />open
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 8, height: 8, background: CW.inkFaint, borderRadius: 2 }} />booked
                    </span>
                </div>
            )}
        </div>
    );
}
