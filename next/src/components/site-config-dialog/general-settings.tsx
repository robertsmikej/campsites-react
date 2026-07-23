"use client";

import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Trash2 } from "lucide-react";
import type { BlackoutRange } from "@/types/campground";
import { ALL_DAYS, STAY_MAX, STAY_MIN } from "./types";

interface GeneralSettingsProps {
    stayRange: [number, number];
    onStayRangeChange: (range: [number, number]) => void;
    validStartDays: string[];
    onValidStartDaysChange: (days: string[]) => void;
    useMockData: boolean;
    onToggleMockData: (event: React.ChangeEvent<HTMLInputElement>) => void;
    blackoutDates: BlackoutRange[];
    onBlackoutDatesChange: (next: BlackoutRange[]) => void;
}

export function GeneralSettings(props: GeneralSettingsProps) {
    const {
        stayRange,
        onStayRangeChange,
        validStartDays,
        onValidStartDaysChange,
        useMockData,
        onToggleMockData,
        blackoutDates,
        onBlackoutDatesChange,
    } = props;

    const synthEvent = (checked: boolean) =>
        ({
            target: { checked },
            currentTarget: { checked },
        }) as unknown as React.ChangeEvent<HTMLInputElement>;

    return (
        <Accordion type="single" collapsible>
            <AccordionItem value="general">
                <AccordionTrigger className="text-sm font-medium">General Settings</AccordionTrigger>
                <AccordionContent className="space-y-6 pt-2">
                    <div>
                        <p className="text-sm">
                            Stay Length (nights): {stayRange[0]} – {stayRange[1]}
                        </p>
                        <Slider
                            value={stayRange}
                            min={STAY_MIN}
                            max={STAY_MAX}
                            step={1}
                            onValueChange={(v) => onStayRangeChange([v[0] ?? STAY_MIN, v[1] ?? STAY_MAX])}
                            className="mt-2"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                            Only show stays between {stayRange[0]} and {stayRange[1]} nights
                        </p>
                    </div>
                    <div>
                        <p className="text-sm">Valid Start Days</p>
                        <div className="mt-2 flex flex-wrap gap-3">
                            {ALL_DAYS.map((day) => (
                                <label key={day} className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={validStartDays.includes(day)}
                                        onCheckedChange={(checked) => {
                                            if (checked) {
                                                onValidStartDaysChange([...validStartDays, day]);
                                            } else {
                                                // Don't allow removing all days
                                                if (validStartDays.length === 1) return;
                                                onValidStartDaysChange(
                                                    validStartDays.filter((d) => d !== day),
                                                );
                                            }
                                        }}
                                    />
                                    {day.slice(0, 3)}
                                </label>
                            ))}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Only show stays that start on these days
                        </p>
                    </div>
                    <div>
                        <div className="mb-1 flex items-center gap-2">
                            <p className="text-sm">Blackout Dates</p>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() =>
                                    onBlackoutDatesChange([...blackoutDates, { from: "", to: "", label: "" }])
                                }
                            >
                                Add blackout
                            </Button>
                        </div>
                        <p className="mb-2 text-xs text-muted-foreground">
                            Dates you&apos;re already booked or busy — greyed out on calendars, skipped by the
                            planner, and no alert emails for stays that overlap them.
                        </p>
                        {blackoutDates.map((b, i) => (
                            <div key={i} className="mb-2 flex flex-wrap items-center gap-2 sm:flex-nowrap">
                                <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
                                    <input
                                        type="date"
                                        value={b.from}
                                        onChange={(e) =>
                                            onBlackoutDatesChange(
                                                blackoutDates.map((x, j) =>
                                                    j === i ? { ...x, from: e.target.value } : x,
                                                ),
                                            )
                                        }
                                        className="min-w-0 flex-1 rounded border bg-cw-cream px-2 py-1 text-sm sm:flex-initial"
                                    />
                                    <span className="text-xs">→</span>
                                    <input
                                        type="date"
                                        value={b.to}
                                        onChange={(e) =>
                                            onBlackoutDatesChange(
                                                blackoutDates.map((x, j) =>
                                                    j === i ? { ...x, to: e.target.value } : x,
                                                ),
                                            )
                                        }
                                        className="min-w-0 flex-1 rounded border bg-cw-cream px-2 py-1 text-sm sm:flex-initial"
                                    />
                                </div>
                                <div className="flex w-full min-w-0 flex-1 items-center gap-2 sm:w-auto">
                                    <input
                                        type="text"
                                        placeholder="label (optional)"
                                        value={b.label ?? ""}
                                        maxLength={80}
                                        onChange={(e) =>
                                            onBlackoutDatesChange(
                                                blackoutDates.map((x, j) =>
                                                    j === i
                                                        ? { ...x, label: e.target.value || undefined }
                                                        : x,
                                                ),
                                            )
                                        }
                                        className="min-w-0 flex-1 rounded border bg-cw-cream px-2 py-1 text-sm"
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-7"
                                        aria-label="Remove blackout"
                                        onClick={() =>
                                            onBlackoutDatesChange(blackoutDates.filter((_, j) => j !== i))
                                        }
                                    >
                                        <Trash2 className="size-3.5" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="space-y-3">
                        <label className="flex items-start gap-3">
                            <Switch
                                checked={useMockData}
                                onCheckedChange={(checked) => onToggleMockData(synthEvent(checked))}
                            />
                            <span className="flex flex-col">
                                <span className="text-sm">Use mock data</span>
                                <span className="text-xs text-muted-foreground">
                                    Skip the live Recreation.gov calls and render canned data for development.
                                </span>
                            </span>
                        </label>
                    </div>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
}
