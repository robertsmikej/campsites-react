"use client";

import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PickDatesButton } from "./pick-dates-button";

interface DateRangeCalendarProps {
    calRange: DateRange | undefined;
    datePickerOpen: boolean;
    setDatePickerOpen: (open: boolean) => void;
    handleCalSelect: (range: DateRange | undefined) => void;
    isMobile: boolean;
    hasCustomRange?: boolean;
    onClearDates?: () => void;
}

export function DateRangeCalendar({
    calRange,
    datePickerOpen,
    setDatePickerOpen,
    handleCalSelect,
    isMobile,
    hasCustomRange,
    onClearDates,
}: DateRangeCalendarProps) {
    return (
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
                <PickDatesButton />
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="range"
                    // resetOnSelect: clicking when a complete range is already
                    // selected starts a fresh range (from = clicked day, to =
                    // open) instead of collapsing the existing one. Picking
                    // always takes two clicks (start, end) and re-picking an
                    // existing range starts clean rather than anchoring to the
                    // old start.
                    resetOnSelect
                    selected={calRange}
                    onSelect={handleCalSelect}
                    numberOfMonths={isMobile ? 1 : 2}
                />
                {hasCustomRange && onClearDates && (
                    <div className="flex justify-end border-t border-cw-rule-soft p-2">
                        <button
                            type="button"
                            onClick={onClearDates}
                            className="font-mono-field text-[12px] font-bold uppercase tracking-[0.12em] text-cw-ink-soft hover:text-cw-ink px-2 py-1 cursor-pointer bg-transparent border-none"
                        >
                            Clear → default window
                        </button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
