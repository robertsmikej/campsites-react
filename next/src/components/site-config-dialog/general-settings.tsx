"use client";

import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ALL_DAYS, STAY_MAX, STAY_MIN } from "./types";

interface GeneralSettingsProps {
    stayRange: [number, number];
    onStayRangeChange: (range: [number, number]) => void;
    validStartDays: string[];
    onValidStartDaysChange: (days: string[]) => void;
    useMockData: boolean;
    onToggleMockData: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function GeneralSettings(props: GeneralSettingsProps) {
    const {
        stayRange,
        onStayRangeChange,
        validStartDays,
        onValidStartDaysChange,
        useMockData,
        onToggleMockData,
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
