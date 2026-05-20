"use client";

import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { PickDatesButton } from "./pick-dates-button";

interface DateRangeCalendarProps {
    calRange: DateRange | undefined;
    datePickerOpen: boolean;
    setDatePickerOpen: (open: boolean) => void;
    handleCalSelect: (range: DateRange | undefined) => void;
    isMobile: boolean;
}

export function DateRangeCalendar({
    calRange,
    datePickerOpen,
    setDatePickerOpen,
    handleCalSelect,
    isMobile,
}: DateRangeCalendarProps) {
    return (
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
                <PickDatesButton isMobile={isMobile} />
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
    );
}
