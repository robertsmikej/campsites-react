"use client";

import { useState } from "react";
import { GripVertical, Trash2, CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";

import {
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";

import {
    ALL_DAYS,
    STAY_MAX,
    STAY_MIN,
    DEFAULT_SHOW_HIDE,
    type EditableCampground,
} from "./types";

interface CampgroundEditorProps {
    campground: EditableCampground;
    index: number;
    isOnlyCampground: boolean;
    expanded: boolean;
    availableSites: string[];
    globalStayRange: [number, number];
    globalValidStartDays: string[];
    dragHandleProps?: Record<string, unknown>;
    onToggleEnabled: (checked: boolean) => void;
    onFieldChange: <K extends keyof EditableCampground>(field: K, value: EditableCampground[K]) => void;
    onDateChange: (key: "startDate" | "endDate", value: string) => void;
    onShowOrHideChange: (key: "Favorites" | "Worthwhile" | "All Others", checked: boolean) => void;
    onRemove: () => void;
    onExpandedChange: (expanded: boolean) => void;
}

function DatePickerField({
    label,
    value,
    onChange,
    minDate,
    maxDate,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    minDate?: Date;
    maxDate?: Date;
}) {
    const [open, setOpen] = useState(false);
    const parsed = value ? new Date(value + "T00:00:00") : undefined;

    return (
        <div className="flex-1">
            <Label className="text-xs">{label}</Label>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className="mt-1 w-full justify-start text-left font-normal"
                        size="sm"
                    >
                        <CalendarIcon className="mr-2 size-4 opacity-50" />
                        {parsed ? (
                            format(parsed, "MM/dd/yyyy")
                        ) : (
                            <span className="text-muted-foreground">Pick a date</span>
                        )}
                        {parsed && (
                            <span
                                role="button"
                                className="ml-auto opacity-60 hover:opacity-100"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChange("");
                                    setOpen(false);
                                }}
                            >
                                <X className="size-3" />
                            </span>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        mode="single"
                        selected={parsed}
                        onSelect={(date) => {
                            onChange(date ? format(date, "yyyy-MM-dd") : "");
                            setOpen(false);
                        }}
                        disabled={[
                            ...(minDate ? [{ before: minDate }] : []),
                            ...(maxDate ? [{ after: maxDate }] : []),
                        ]}
                    />
                </PopoverContent>
            </Popover>
            <p className="mt-1 text-xs text-muted-foreground">Optional. Leave blank to use global settings.</p>
        </div>
    );
}

function MultiSelectSites({
    label,
    value,
    options,
    onChange,
    helperText,
}: {
    label: string;
    value: string[];
    options: string[];
    onChange: (next: string[]) => void;
    helperText?: string;
}) {
    const [open, setOpen] = useState(false);
    const [inputValue, setInputValue] = useState("");

    const allOptions = Array.from(new Set([...options, ...value]));

    const handleSelect = (option: string) => {
        if (value.includes(option)) {
            onChange(value.filter((v) => v !== option));
        } else {
            onChange([...value, option]);
        }
    };

    const handleAddCustom = () => {
        const trimmed = inputValue.trim();
        if (trimmed && !value.includes(trimmed)) {
            onChange([...value, trimmed]);
        }
        setInputValue("");
    };

    return (
        <div className="flex-1">
            <Label className="text-xs">{label}</Label>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className="mt-1 w-full justify-start text-left font-normal h-auto min-h-9 flex-wrap gap-1 py-1.5"
                        size="sm"
                    >
                        {value.length === 0 ? (
                            <span className="text-muted-foreground">Select sites...</span>
                        ) : (
                            value.map((v) => (
                                <Badge key={v} variant="secondary" className="text-xs">
                                    {v}
                                    <span
                                        role="button"
                                        className="ml-1 opacity-60 hover:opacity-100"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onChange(value.filter((s) => s !== v));
                                        }}
                                    >
                                        <X className="size-2.5" />
                                    </span>
                                </Badge>
                            ))
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="start">
                    <Command>
                        <CommandInput
                            placeholder="Search or add site..."
                            value={inputValue}
                            onValueChange={setInputValue}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && inputValue.trim()) {
                                    e.preventDefault();
                                    handleAddCustom();
                                }
                            }}
                        />
                        <CommandList>
                            <CommandEmpty>
                                {inputValue.trim() ? (
                                    <button
                                        className="w-full px-3 py-2 text-left text-sm"
                                        onClick={handleAddCustom}
                                    >
                                        Add &quot;{inputValue.trim()}&quot;
                                    </button>
                                ) : (
                                    "No sites found."
                                )}
                            </CommandEmpty>
                            <CommandGroup>
                                {allOptions.map((option) => (
                                    <CommandItem
                                        key={option}
                                        value={option}
                                        onSelect={() => handleSelect(option)}
                                    >
                                        <Checkbox
                                            checked={value.includes(option)}
                                            className="mr-2"
                                        />
                                        {option}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
            {helperText && (
                <p className="mt-1 text-xs text-muted-foreground">{helperText}</p>
            )}
        </div>
    );
}

export function CampgroundEditor({
    campground,
    index,
    isOnlyCampground,
    availableSites,
    globalStayRange,
    globalValidStartDays,
    dragHandleProps,
    onToggleEnabled,
    onFieldChange,
    onDateChange,
    onShowOrHideChange,
    onRemove,
}: CampgroundEditorProps) {
    const isEnabled = campground.enabled !== false;

    const hasCampgroundDays = !!campground.validStartDays;
    const hasCampgroundStay = !!campground.stayLengths;

    const effectiveDays = hasCampgroundDays
        ? campground.validStartDays!
        : globalValidStartDays;

    const effectiveStayRange: [number, number] = hasCampgroundStay
        ? [Math.min(...campground.stayLengths!), Math.max(...campground.stayLengths!)]
        : globalStayRange;

    const handleCampgroundDayToggle = (day: string, checked: boolean) => {
        const current = campground.validStartDays ?? [...globalValidStartDays];
        if (checked) {
            onFieldChange("validStartDays", [...current, day]);
        } else {
            if (current.length === 1) return;
            onFieldChange("validStartDays", current.filter((d) => d !== day));
        }
    };

    const buildStayLengths = (range: [number, number]) => {
        const lengths: number[] = [];
        for (let i = range[0]; i <= range[1]; i++) lengths.push(i);
        return lengths;
    };

    const startDateParsed = campground.dates?.startDate
        ? new Date(campground.dates.startDate + "T00:00:00")
        : undefined;
    const endDateParsed = campground.dates?.endDate
        ? new Date(campground.dates.endDate + "T00:00:00")
        : undefined;

    return (
        <AccordionItem
            value={`campground-${index}`}
            className={`rounded-lg border ${!isEnabled ? "opacity-60" : ""}`}
        >
            <AccordionTrigger className="px-3 py-2 hover:no-underline [&>svg]:hidden" asChild={false}>
                <div className="flex w-full items-center gap-2">
                    <span
                        className="cursor-grab text-muted-foreground"
                        {...(dragHandleProps as React.HTMLAttributes<HTMLSpanElement>)}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <GripVertical className="size-4" />
                    </span>
                    <span className="flex-1 text-left text-sm font-medium">
                        {campground.name || `Campground ${index + 1}`}
                        {!isEnabled && (
                            <span className="ml-2 text-xs font-normal italic text-muted-foreground">
                                disabled
                            </span>
                        )}
                    </span>
                    <span
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Switch
                                        checked={isEnabled}
                                        onCheckedChange={onToggleEnabled}
                                        className="scale-75"
                                    />
                                </TooltipTrigger>
                                <TooltipContent>
                                    {isEnabled ? "Watching — turn off to skip API calls" : "Disabled — no API calls"}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-7"
                                        onClick={onRemove}
                                        disabled={isOnlyCampground}
                                        aria-label="Remove campground"
                                    >
                                        <Trash2 className="size-3.5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Remove campground</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </span>
                </div>
            </AccordionTrigger>

            <AccordionContent className="space-y-4 px-3 pb-3 pt-1">
                {/* Basic info */}
                <div className="flex gap-3">
                    <div className="flex-1 space-y-2">
                        <div>
                            <Label className="text-xs">Campground Name *</Label>
                            <Input
                                className="mt-1"
                                value={campground.name}
                                onChange={(e) => onFieldChange("name", e.target.value)}
                                placeholder="Campground name"
                            />
                        </div>
                        <div>
                            <Label className="text-xs">Area / Region</Label>
                            <Input
                                className="mt-1"
                                value={campground.area ?? ""}
                                onChange={(e) => onFieldChange("area", e.target.value)}
                                placeholder="e.g. Tahoe National Forest"
                            />
                        </div>
                        <div>
                            <Label className="text-xs">Facility ID *</Label>
                            <Input
                                className="mt-1"
                                value={campground.id}
                                onChange={(e) => onFieldChange("id", e.target.value)}
                                placeholder="Recreation.gov facility ID"
                            />
                            <p className="mt-1 text-xs text-muted-foreground">
                                Matches the Recreation.gov facility ID
                            </p>
                        </div>
                        <div>
                            <Label className="text-xs">Source</Label>
                            <Input
                                className="mt-1"
                                value={campground.site ?? ""}
                                onChange={(e) => onFieldChange("site", e.target.value)}
                                placeholder="recreation.gov"
                            />
                        </div>
                        <div>
                            <Label className="text-xs">Type</Label>
                            <Input
                                className="mt-1"
                                value={campground.type ?? ""}
                                onChange={(e) => onFieldChange("type", e.target.value)}
                                placeholder="campground"
                            />
                        </div>
                        <div>
                            <Label className="text-xs">Description</Label>
                            <Textarea
                                className="mt-1"
                                value={campground.description ?? ""}
                                onChange={(e) => onFieldChange("description", e.target.value)}
                                rows={3}
                            />
                        </div>
                    </div>
                    {/* Image preview */}
                    {campground.image && (
                        <div className="w-32 shrink-0">
                            <div className="overflow-hidden rounded-lg border">
                                <img
                                    src={`/images/sites/${campground.image}`}
                                    alt={campground.name || "Campground map"}
                                    className="h-full w-full object-cover"
                                    style={{ minHeight: 96 }}
                                    loading="lazy"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Date pickers */}
                <div className="flex gap-3">
                    <DatePickerField
                        label="Start Date"
                        value={campground.dates?.startDate ?? ""}
                        onChange={(v) => onDateChange("startDate", v)}
                        maxDate={endDateParsed}
                    />
                    <DatePickerField
                        label="End Date"
                        value={campground.dates?.endDate ?? ""}
                        onChange={(v) => onDateChange("endDate", v)}
                        minDate={startDateParsed}
                    />
                </div>

                {/* Site multi-selects */}
                <div className="flex gap-3">
                    {availableSites.length > 0 ? (
                        <>
                            <MultiSelectSites
                                label="Favorite Sites"
                                value={campground.favoritesArray}
                                options={availableSites}
                                onChange={(next) => {
                                    onFieldChange("favoritesArray", next);
                                    onFieldChange("favoritesText", next.join(", "));
                                }}
                                helperText="Select favorites. Type to add unlisted sites."
                            />
                            <MultiSelectSites
                                label="Worthwhile Sites"
                                value={campground.worthwhileArray}
                                options={availableSites}
                                onChange={(next) => {
                                    onFieldChange("worthwhileArray", next);
                                    onFieldChange("worthwhileText", next.join(", "));
                                }}
                                helperText="Select worthwhile sites. Type to add unlisted."
                            />
                        </>
                    ) : (
                        <>
                            <div className="flex-1">
                                <Label className="text-xs">Favorite Sites</Label>
                                <Input
                                    className="mt-1"
                                    value={campground.favoritesText}
                                    onChange={(e) => onFieldChange("favoritesText", e.target.value)}
                                    placeholder="012, 014, 016"
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {campground.id
                                        ? "Loading sites... or enter comma-separated"
                                        : "Comma-separated list (e.g., 012, 014, 016)"}
                                </p>
                            </div>
                            <div className="flex-1">
                                <Label className="text-xs">Worthwhile Sites</Label>
                                <Input
                                    className="mt-1"
                                    value={campground.worthwhileText}
                                    onChange={(e) => onFieldChange("worthwhileText", e.target.value)}
                                    placeholder="017, 018"
                                />
                                <p className="mt-1 text-xs text-muted-foreground">Comma-separated list</p>
                            </div>
                        </>
                    )}
                </div>

                {/* Show/hide toggles */}
                <div className="flex flex-wrap gap-4">
                    {(Object.keys(DEFAULT_SHOW_HIDE) as Array<"Favorites" | "Worthwhile" | "All Others">).map(
                        (key) => (
                            <label key={key} className="flex items-center gap-2 text-sm">
                                <Switch
                                    checked={campground.showOrHide?.[key] ?? DEFAULT_SHOW_HIDE[key]}
                                    onCheckedChange={(checked) => onShowOrHideChange(key, checked)}
                                    className="scale-75"
                                />
                                Show {key}
                            </label>
                        ),
                    )}
                </div>

                {/* Per-campground start days */}
                <div>
                    <div className="mb-1 flex items-center gap-2">
                        <p className="text-sm">Start Days</p>
                        {hasCampgroundDays ? (
                            <>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs"
                                    onClick={() => onFieldChange("validStartDays", undefined)}
                                >
                                    Use global
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs"
                                    onClick={() => onFieldChange("validStartDays", ["Friday", "Saturday"])}
                                >
                                    Prime Days
                                </Button>
                            </>
                        ) : (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() => onFieldChange("validStartDays", [...globalValidStartDays])}
                            >
                                Customize
                            </Button>
                        )}
                    </div>
                    <div className={`flex flex-wrap gap-3 ${!hasCampgroundDays ? "opacity-50" : ""}`}>
                        {ALL_DAYS.map((day) => (
                            <label key={day} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                    checked={effectiveDays.includes(day)}
                                    onCheckedChange={
                                        hasCampgroundDays
                                            ? (checked) => handleCampgroundDayToggle(day, !!checked)
                                            : undefined
                                    }
                                    disabled={!hasCampgroundDays}
                                />
                                {day.slice(0, 3)}
                            </label>
                        ))}
                    </div>
                </div>

                {/* Per-campground stay length */}
                <div>
                    <div className="mb-1 flex items-center gap-2">
                        <p className="text-sm">Stay Length</p>
                        {hasCampgroundStay ? (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() => onFieldChange("stayLengths", undefined)}
                            >
                                Use global
                            </Button>
                        ) : (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() => onFieldChange("stayLengths", buildStayLengths(globalStayRange))}
                            >
                                Customize
                            </Button>
                        )}
                    </div>
                    <div className={!hasCampgroundStay ? "opacity-50" : ""}>
                        <Slider
                            value={effectiveStayRange}
                            min={STAY_MIN}
                            max={STAY_MAX}
                            step={1}
                            disabled={!hasCampgroundStay}
                            onValueChange={
                                hasCampgroundStay
                                    ? (v) =>
                                          onFieldChange(
                                              "stayLengths",
                                              buildStayLengths([v[0] ?? STAY_MIN, v[1] ?? STAY_MAX]),
                                          )
                                    : undefined
                            }
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                            {effectiveStayRange[0]} – {effectiveStayRange[1]} nights
                            {!hasCampgroundStay ? " (global)" : ""}
                        </p>
                    </div>
                </div>
            </AccordionContent>
        </AccordionItem>
    );
}
