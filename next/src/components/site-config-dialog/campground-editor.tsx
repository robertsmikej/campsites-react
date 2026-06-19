"use client";

import { useState } from "react";
import { GripVertical, Trash2, CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";

import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
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

import { ALL_DAYS, STAY_MAX, STAY_MIN, type EditableCampground } from "./types";
import { HIGH_PRIORITY_CAP, type CheckPriority, type NotifyScope } from "@/types/campground";
import { CW } from "@/components/field-notes/cw-tokens";
import { FieldLabel, Hint, SectionDivider, SegmentedControl, TierChip } from "./field-primitives";

interface CampgroundEditorProps {
    campground: EditableCampground;
    index: number;
    isOnlyCampground: boolean;
    expanded: boolean;
    availableSites: string[];
    globalStayRange: [number, number];
    globalValidStartDays: string[];
    dragHandleProps?: Record<string, unknown>;
    /** Count of enabled high-tier campgrounds across the whole list (for the 3-max gate). */
    highTierCount: number;
    onToggleEnabled: (checked: boolean) => void;
    onFieldChange: <K extends keyof EditableCampground>(field: K, value: EditableCampground[K]) => void;
    onDateChange: (key: "startDate" | "endDate", value: string) => void;
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
            <FieldLabel>{label}</FieldLabel>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className="mt-1 w-full justify-start bg-cw-cream text-left font-mono-field text-sm font-normal"
                        size="sm"
                    >
                        <CalendarIcon className="mr-2 size-4" style={{ color: CW.clay }} />
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
            <Hint>Optional — leave blank to use global settings.</Hint>
        </div>
    );
}

function MultiSelectSites({
    label,
    tier,
    value,
    options,
    onChange,
    helperText,
}: {
    label: string;
    tier: "fav" | "worth";
    value: string[];
    options: string[];
    onChange: (next: string[]) => void;
    helperText?: string;
}) {
    const [open, setOpen] = useState(false);
    const [inputValue, setInputValue] = useState("");

    const allOptions = Array.from(new Set([...options, ...value]));
    const isFav = tier === "fav";
    const pillBg = isFav ? CW.clay : CW.forest;
    const mark = isFav ? "★" : "◇";

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
            <FieldLabel>
                <span style={{ color: pillBg }}>{mark}</span> {label}
            </FieldLabel>
            {/* modal: the dialog's scroll-lock (react-remove-scroll) blocks wheel
                scrolling on a non-modal popover portaled outside it, so a long site
                list can't be scrolled. A modal popover owns its own scroll region. */}
            <Popover open={open} onOpenChange={setOpen} modal>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className="mt-1 h-auto min-h-9 w-full flex-wrap justify-start gap-1 bg-cw-cream py-1.5 text-left font-normal"
                        size="sm"
                    >
                        {value.length === 0 ? (
                            <span className="font-italic-serif italic" style={{ color: CW.inkFaint }}>
                                Type to add a site…
                            </span>
                        ) : (
                            value.map((v) => (
                                <span
                                    key={v}
                                    className="inline-flex items-center gap-[6px] rounded-full font-mono-field font-semibold"
                                    style={{
                                        fontSize: 13,
                                        padding: "4px 8px",
                                        background: pillBg,
                                        color: CW.cream,
                                    }}
                                >
                                    <span style={{ fontSize: 11 }}>{mark}</span>
                                    {v}
                                    <span
                                        role="button"
                                        className="opacity-70 hover:opacity-100"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onChange(value.filter((s) => s !== v));
                                        }}
                                    >
                                        <X className="size-2.5" />
                                    </span>
                                </span>
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
                                        <Checkbox checked={value.includes(option)} className="mr-2" />
                                        {option}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
            {helperText && <Hint>{helperText}</Hint>}
        </div>
    );
}

export function CampgroundEditor({
    campground,
    index,
    isOnlyCampground,
    expanded,
    availableSites,
    globalStayRange,
    globalValidStartDays,
    dragHandleProps,
    highTierCount,
    onToggleEnabled,
    onFieldChange,
    onDateChange,
    onRemove,
}: CampgroundEditorProps) {
    const isEnabled = campground.enabled !== false;
    const highTierFull = highTierCount >= HIGH_PRIORITY_CAP && campground.checkPriority !== "high";

    const hasCampgroundDays = !!campground.validStartDays;
    const hasCampgroundStay = !!campground.stayLengths;

    const effectiveDays = hasCampgroundDays ? campground.validStartDays! : globalValidStartDays;

    const effectiveStayRange: [number, number] = hasCampgroundStay
        ? [Math.min(...campground.stayLengths!), Math.max(...campground.stayLengths!)]
        : globalStayRange;

    const handleCampgroundDayToggle = (day: string, checked: boolean) => {
        const current = campground.validStartDays ?? [...globalValidStartDays];
        if (checked) {
            onFieldChange("validStartDays", [...current, day]);
        } else {
            if (current.length === 1) return;
            onFieldChange(
                "validStartDays",
                current.filter((d) => d !== day),
            );
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
            className={`rounded-none border-0 ${!isEnabled ? "opacity-60" : ""}`}
            style={{
                background: CW.cream,
                border: `1.5px solid ${CW.ink}`,
                boxShadow: expanded ? `5px 5px 0 ${CW.forest}` : `4px 4px 0 rgba(26,22,20,0.14)`,
            }}
        >
            <AccordionTrigger
                className="px-[18px] py-[15px] hover:no-underline [&>svg]:hidden"
                asChild={false}
            >
                <div className="flex w-full items-center gap-[14px]">
                    <span
                        className="cursor-grab"
                        style={{ color: CW.inkFaint }}
                        {...(dragHandleProps as React.HTMLAttributes<HTMLSpanElement>)}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <GripVertical className="size-4" />
                    </span>
                    <span
                        className="flex-1 text-left font-italic-serif italic"
                        style={{ fontSize: 23, color: expanded ? CW.ink : CW.inkSoft }}
                    >
                        {campground.name || `Campground ${index + 1}`}
                        {!isEnabled && (
                            <span className="ml-2 text-xs font-normal italic" style={{ color: CW.inkFaint }}>
                                disabled
                            </span>
                        )}
                    </span>
                    {campground.favoritesArray.length > 0 && (
                        <TierChip tier="fav" count={campground.favoritesArray.length} />
                    )}
                    {campground.worthwhileArray.length > 0 && (
                        <TierChip tier="worth" count={campground.worthwhileArray.length} />
                    )}
                    <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
                                    {isEnabled
                                        ? "Watching — turn off to skip API calls"
                                        : "Disabled — no API calls"}
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
                    <span
                        className="ml-1 inline-block transition-transform"
                        style={{
                            width: 9,
                            height: 9,
                            borderRight: `2px solid ${CW.inkSoft}`,
                            borderBottom: `2px solid ${CW.inkSoft}`,
                            transform: expanded ? "rotate(-135deg)" : "rotate(45deg)",
                        }}
                    />
                </div>
            </AccordionTrigger>

            <AccordionContent className="space-y-4 px-3 pb-3 pt-1">
                {/* Basic info */}
                <div className="flex gap-3">
                    <div className="flex-1 space-y-3">
                        <div>
                            <FieldLabel required>Campground Name</FieldLabel>
                            <Input
                                className="mt-1 bg-cw-cream"
                                value={campground.name}
                                onChange={(e) => onFieldChange("name", e.target.value)}
                                placeholder="Campground name"
                            />
                        </div>
                        <div>
                            <FieldLabel>Area / Region</FieldLabel>
                            <Input
                                className="mt-1 bg-cw-cream"
                                value={campground.area ?? ""}
                                onChange={(e) => onFieldChange("area", e.target.value)}
                                placeholder="e.g. Tahoe National Forest"
                            />
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <FieldLabel required>Facility ID</FieldLabel>
                                <Input
                                    className="mt-1 bg-cw-cream font-mono-field text-sm"
                                    value={campground.id}
                                    onChange={(e) => onFieldChange("id", e.target.value)}
                                    placeholder="Recreation.gov facility ID"
                                />
                                <Hint>Matches the recreation.gov facility ID.</Hint>
                            </div>
                            <div>
                                <FieldLabel>Type</FieldLabel>
                                <Input
                                    className="mt-1 bg-cw-cream"
                                    value={campground.type ?? ""}
                                    onChange={(e) => onFieldChange("type", e.target.value)}
                                    placeholder="campground"
                                />
                                <Hint>As listed on recreation.gov.</Hint>
                            </div>
                        </div>
                        <div>
                            <FieldLabel>Source</FieldLabel>
                            <Input
                                className="mt-1 bg-cw-cream font-mono-field text-sm"
                                value={campground.site ?? ""}
                                onChange={(e) => onFieldChange("site", e.target.value)}
                                placeholder="recreation.gov"
                            />
                        </div>
                        <div>
                            <FieldLabel>Description</FieldLabel>
                            <Textarea
                                className="mt-1 bg-cw-cream"
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
                                {/* eslint-disable-next-line @next/next/no-img-element */}
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

                <SectionDivider label="I — Season Window" />
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

                <SectionDivider label="II — Sites that matter" />
                {/* Site multi-selects */}
                <div className="flex gap-3">
                    {availableSites.length > 0 ? (
                        <>
                            <MultiSelectSites
                                label="Favorite Sites"
                                tier="fav"
                                value={campground.favoritesArray}
                                options={availableSites}
                                onChange={(next) => {
                                    onFieldChange("favoritesArray", next);
                                    onFieldChange("favoritesText", next.join(", "));
                                }}
                                helperText="The ones you'd drive back for. Type a site number to add."
                            />
                            <MultiSelectSites
                                label="Worthwhile Sites"
                                tier="worth"
                                value={campground.worthwhileArray}
                                options={availableSites}
                                onChange={(next) => {
                                    onFieldChange("worthwhileArray", next);
                                    onFieldChange("worthwhileText", next.join(", "));
                                }}
                                helperText="Good enough if a favorite won't free up."
                            />
                        </>
                    ) : (
                        <>
                            <div className="flex-1">
                                <FieldLabel>
                                    <span style={{ color: CW.clay }}>★</span> Favorite Sites
                                </FieldLabel>
                                <Input
                                    className="mt-1 bg-cw-cream font-mono-field text-sm"
                                    value={campground.favoritesText}
                                    onChange={(e) => onFieldChange("favoritesText", e.target.value)}
                                    placeholder="012, 014, 016"
                                />
                                <Hint>
                                    {campground.id
                                        ? "Loading sites… or enter comma-separated."
                                        : "Comma-separated list (e.g., 012, 014, 016)."}
                                </Hint>
                            </div>
                            <div className="flex-1">
                                <FieldLabel>
                                    <span style={{ color: CW.forest }}>◇</span> Worthwhile Sites
                                </FieldLabel>
                                <Input
                                    className="mt-1 bg-cw-cream font-mono-field text-sm"
                                    value={campground.worthwhileText}
                                    onChange={(e) => onFieldChange("worthwhileText", e.target.value)}
                                    placeholder="017, 018"
                                />
                                <Hint>Good enough if a favorite won&apos;t free up.</Hint>
                            </div>
                        </>
                    )}
                </div>

                <SectionDivider label="III — When to write you" />
                {/* Email scope */}
                <div>
                    <div className="mb-2 flex flex-wrap items-baseline gap-3">
                        <FieldLabel>Email me when</FieldLabel>
                        {(campground.notifyScope || campground.notifyAll) && (
                            <button
                                type="button"
                                onClick={() => {
                                    onFieldChange("notifyScope", undefined);
                                    onFieldChange("notifyAll", undefined);
                                }}
                                className="ml-auto cursor-pointer rounded-full font-mono-field font-semibold uppercase transition-colors"
                                style={{
                                    fontSize: 11,
                                    letterSpacing: "0.08em",
                                    padding: "6px 12px",
                                    color: CW.forest,
                                    border: `1px solid ${CW.rule}`,
                                }}
                            >
                                Use account default
                            </button>
                        )}
                    </div>
                    <SegmentedControl<NotifyScope>
                        options={[
                            { value: "favorites", label: "Favorites only" },
                            { value: "worthwhile", label: "Favorites + Worthwhile" },
                            { value: "all", label: "Any site opens" },
                        ]}
                        value={campground.notifyScope ?? (campground.notifyAll ? "all" : undefined)}
                        onChange={(value) => {
                            onFieldChange("notifyScope", value);
                            // Clear legacy notifyAll once the new field is set so the
                            // resolver doesn't have to fall through.
                            if (campground.notifyAll) onFieldChange("notifyAll", false);
                        }}
                    />
                    <Hint>Favorites means only the sites you&apos;ve starred above.</Hint>
                </div>

                {/* Adjacent-site alerts */}
                <div>
                    <div className="mb-2 flex flex-wrap items-baseline gap-3">
                        <FieldLabel>Adjacent-site alerts</FieldLabel>
                        {campground.adjacencyAnchor && (
                            <button
                                type="button"
                                onClick={() => onFieldChange("adjacencyAnchor", undefined)}
                                className="ml-auto cursor-pointer rounded-full font-mono-field font-semibold uppercase transition-colors"
                                style={{
                                    fontSize: 11,
                                    letterSpacing: "0.08em",
                                    padding: "6px 12px",
                                    color: CW.forest,
                                    border: `1px solid ${CW.rule}`,
                                }}
                            >
                                Off
                            </button>
                        )}
                    </div>
                    <SegmentedControl<NotifyScope>
                        options={[
                            { value: "favorites", label: "Favorite anchor" },
                            { value: "worthwhile", label: "Fav/Worthwhile" },
                            { value: "all", label: "Any pair" },
                        ]}
                        value={campground.adjacencyAnchor}
                        onChange={(value) => onFieldChange("adjacencyAnchor", value)}
                    />
                    <Hint>Alerts when 2+ sites right next to each other open for the same dates. Off = no adjacency alerts.</Hint>
                </div>

                {/* Check frequency tier */}
                <div>
                    <FieldLabel>Check frequency</FieldLabel>
                    <div className="mt-2">
                        <SegmentedControl<CheckPriority>
                            options={[
                                { value: "high", label: "Every minute", disabled: highTierFull },
                                { value: "normal", label: "Every 5 min" },
                                { value: "low", label: "Every 10 min" },
                            ]}
                            value={campground.checkPriority ?? "normal"}
                            onChange={(value) =>
                                onFieldChange("checkPriority", value === "normal" ? undefined : value)
                            }
                        />
                    </div>
                    <Hint>
                        {highTierFull
                            ? `High tier is full — at most ${HIGH_PRIORITY_CAP} campgrounds can be checked every minute.`
                            : "How often the notifier polls rec.gov for this campground."}
                    </Hint>
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
                        {ALL_DAYS.map((day) => {
                            const isPrime = day === "Friday" || day === "Saturday";
                            return (
                                <label key={day} className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={effectiveDays.includes(day)}
                                        onCheckedChange={
                                            hasCampgroundDays
                                                ? (checked) => handleCampgroundDayToggle(day, !!checked)
                                                : undefined
                                        }
                                        disabled={!hasCampgroundDays}
                                        style={
                                            isPrime
                                                ? { boxShadow: "0 0 0 2px rgba(201,162,39,0.5)" }
                                                : undefined
                                        }
                                    />
                                    {day.slice(0, 3)}
                                </label>
                            );
                        })}
                    </div>
                    <Hint>Gold-ringed days are weekend (Fri/Sat) nights — your prime-time getaways.</Hint>
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
                                onClick={() =>
                                    onFieldChange("stayLengths", buildStayLengths(globalStayRange))
                                }
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
