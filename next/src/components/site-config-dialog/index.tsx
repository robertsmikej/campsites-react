"use client";

import { useEffect, useRef, useState } from "react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { CW } from "@/components/field-notes/cw-tokens";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import type { Campground, SiteConfig } from "@/types/campground";
import { useCampgroundSites } from "@/hooks/use-campground-sites";

import { toEditableCampground, sanitizeCampground, createEmptyCampground } from "./serialize";
import { DEFAULT_STAY_RANGE, type EditableCampground, type SiteConfigDialogProps } from "./types";
import { createDragEndHandler } from "./drag-drop";
import { GeneralSettings } from "./general-settings";
import { AddCampground } from "./add-campground";
import { CampgroundEditor } from "./campground-editor";
import { CampgroundsTable } from "./campgrounds-table";

// Wrapper to apply dnd-kit sortable to each CampgroundEditor
function SortableCampgroundEditor(props: {
    campground: EditableCampground;
    index: number;
    isOnlyCampground: boolean;
    expanded: boolean;
    availableSites: string[];
    globalStayRange: [number, number];
    globalValidStartDays: string[];
    onToggleEnabled: (checked: boolean) => void;
    onFieldChange: <K extends keyof EditableCampground>(field: K, value: EditableCampground[K]) => void;
    onDateChange: (key: "startDate" | "endDate", value: string) => void;
    onRemove: () => void;
    onExpandedChange: (expanded: boolean) => void;
}) {
    const sortableId = props.campground.id || `idx-${props.index}`;
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: sortableId,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.8 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} id={`campground-panel-${sortableId}`}>
            <CampgroundEditor {...props} dragHandleProps={{ ...attributes, ...listeners }} />
        </div>
    );
}

export function SiteConfigDialog(props: SiteConfigDialogProps) {
    const {
        open,
        onClose,
        onSave,
        onResetToDefaults,
        initialData,
        globalSettings,
        availableSites,
        useMockData,
        onToggleMockData,
        focusedCampgroundId,
    } = props;

    const [campgrounds, setCampgrounds] = useState<EditableCampground[]>([createEmptyCampground()]);
    const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
    const [stayRange, setStayRange] = useState<[number, number]>(() =>
        globalSettings.stayLengths && globalSettings.stayLengths.length > 0
            ? [Math.min(...globalSettings.stayLengths), Math.max(...globalSettings.stayLengths)]
            : DEFAULT_STAY_RANGE,
    );
    const [validStartDays, setValidStartDays] = useState<string[]>(() => globalSettings.validStartDays ?? []);
    const [expandedPanels, setExpandedPanels] = useState<Set<number>>(new Set([0]));

    const { sitesById, ensureLoaded } = useCampgroundSites();
    // Fetch a campground's site roster the first time its panel is open, so the
    // multi-select shows real site numbers (lazy = gentle on rec.gov).
    useEffect(() => {
        if (!open) return;
        for (const i of expandedPanels) {
            const id = campgrounds[i]?.id;
            if (id) ensureLoaded(id);
        }
    }, [open, expandedPanels, campgrounds, ensureLoaded]);

    const previousViewMode = useRef(viewMode);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    // Reset state when dialog opens
    useEffect(() => {
        if (!open) return;
        const initial = (initialData["recreation.gov"] ?? []).map((c) =>
            toEditableCampground(c as unknown as Record<string, unknown>),
        );
        setCampgrounds(initial.length > 0 ? initial : [createEmptyCampground()]);
        setStayRange(
            globalSettings.stayLengths && globalSettings.stayLengths.length > 0
                ? [Math.min(...globalSettings.stayLengths), Math.max(...globalSettings.stayLengths)]
                : DEFAULT_STAY_RANGE,
        );
        setValidStartDays(globalSettings.validStartDays ?? []);
        setExpandedPanels(new Set([0]));
        setViewMode("cards");
    }, [open, initialData, globalSettings]);

    // Focus a specific campground when the dialog opens with focusedCampgroundId set
    useEffect(() => {
        if (!open || !focusedCampgroundId) return;
        const idx = campgrounds.findIndex((c) => c.id === focusedCampgroundId);
        if (idx < 0) return;
        setViewMode("cards");
        setExpandedPanels(new Set([idx]));
        // Scroll to the panel after a brief paint delay
        const id = `campground-panel-${campgrounds[idx]?.id || `idx-${idx}`}`;
        requestAnimationFrame(() => {
            document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
    }, [open, focusedCampgroundId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync expanded panels when view mode changes
    useEffect(() => {
        if (previousViewMode.current === viewMode) return;
        if (viewMode === "list") {
            setExpandedPanels(new Set());
        } else if (viewMode === "cards") {
            setExpandedPanels((prev) => {
                if (prev.size === 0 && campgrounds.length > 0) return new Set([0]);
                return prev;
            });
        }
        previousViewMode.current = viewMode;
    }, [viewMode, campgrounds.length]);

    const updateCampground = (index: number, updater: (c: EditableCampground) => EditableCampground) => {
        setCampgrounds((prev) => prev.map((c, idx) => (idx === index ? updater(c) : c)));
    };

    const handleFieldChange = <K extends keyof EditableCampground>(
        index: number,
        field: K,
        value: EditableCampground[K],
    ) => {
        updateCampground(index, (c) => ({ ...c, [field]: value }));
    };

    const handleDateChange = (index: number, key: "startDate" | "endDate", value: string) => {
        updateCampground(index, (c) => ({
            ...c,
            dates: { ...c.dates, [key]: value },
        }));
    };

    const handleRemoveCampground = (index: number) => {
        setCampgrounds((prev) => {
            if (prev.length === 1) return [createEmptyCampground()];
            return prev.filter((_, idx) => idx !== index);
        });
    };

    const handleAddCampground = (campground: Campground) => {
        setCampgrounds((prev) => [...prev, toEditableCampground(campground)]);
    };

    const handleDragEnd = createDragEndHandler(campgrounds, (next) => {
        // Remap expanded panels after reorder
        const ids = campgrounds.map((c, idx) => c.id || `idx-${idx}`);
        const nextIds = next.map((c, idx) => c.id || `idx-${idx}`);
        setExpandedPanels((prev) => {
            const mapped = new Set<number>();
            prev.forEach((expandedIdx) => {
                const id = ids[expandedIdx];
                if (id !== undefined) {
                    const newIdx = nextIds.indexOf(id);
                    if (newIdx >= 0) mapped.add(newIdx);
                }
            });
            return mapped;
        });
        setCampgrounds(next);
    });

    const handleDragEndWrapper = (event: DragEndEvent) => {
        handleDragEnd(event);
    };

    const openCampgroundInCards = (index: number) => {
        setViewMode("cards");
        setExpandedPanels(new Set([index]));
    };

    const handleAccordionValueChange = (values: string[]) => {
        const indices = values
            .map((v) => {
                const match = v.match(/^campground-(\d+)$/);
                return match ? parseInt(match[1] ?? "", 10) : -1;
            })
            .filter((i) => i >= 0);
        setExpandedPanels(new Set(indices));
    };

    const accordionValue = Array.from(expandedPanels).map((i) => `campground-${i}`);

    const buildStayLengths = (range: [number, number]) => {
        const lengths: number[] = [];
        for (let i = range[0]; i <= range[1]; i++) lengths.push(i);
        return lengths;
    };

    const handleSave = () => {
        const sanitized = campgrounds
            .map(sanitizeCampground)
            .filter((c): c is Campground => !!c.id && !!c.name);
        const newConfig: SiteConfig = { "recreation.gov": sanitized };
        onSave(newConfig, {
            stayLengths: buildStayLengths(stayRange),
            validStartDays,
        });
    };

    const isSaveDisabled = campgrounds.some((c) => !c.name.trim() || !c.id.trim());

    const sortableIds = campgrounds.map((c, idx) => c.id || `idx-${idx}`);

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent
                showCloseButton={false}
                className="flex max-h-[90vh] w-[95vw] max-w-[95vw] flex-col overflow-hidden rounded-none p-0 sm:max-w-6xl"
                style={{
                    background: CW.paper,
                    border: `1.5px solid ${CW.ink}`,
                    boxShadow: `10px 12px 0 ${CW.forest}, 0 40px 90px -30px rgba(20,15,12,0.8)`,
                }}
            >
                {/* Masthead */}
                <div
                    className="flex items-start justify-between"
                    style={{
                        background: CW.cream,
                        borderBottom: `2px solid ${CW.ink}`,
                        padding: "24px 30px 20px",
                    }}
                >
                    <div>
                        <div
                            className="font-mono-field font-medium uppercase"
                            style={{ fontSize: 10, letterSpacing: "0.22em", color: CW.clay }}
                        >
                            § Watchlist · Field Station Setup
                        </div>
                        <DialogTitle
                            className="font-poster font-black uppercase"
                            style={{ fontSize: 38, lineHeight: 0.92, letterSpacing: "-0.01em", marginTop: 9 }}
                        >
                            Configure{" "}
                            <span
                                className="block font-italic-serif italic normal-case"
                                style={{ fontSize: 30, lineHeight: 1, color: CW.forest, marginTop: 2 }}
                            >
                                campgrounds
                            </span>
                        </DialogTitle>
                        <div
                            className="font-italic-serif italic"
                            style={{ fontSize: 16, lineHeight: 1.3, color: CW.inkSoft, marginTop: 7 }}
                        >
                            {campgrounds.length} place{campgrounds.length === 1 ? "" : "s"} on watch · drag to
                            reorder, tag the sites that matter.
                        </div>
                    </div>
                    <button
                        type="button"
                        aria-label="Close"
                        onClick={onClose}
                        className="flex shrink-0 items-center justify-center rounded-[2px] transition-colors hover:bg-cw-ink [&:hover_svg]:stroke-cw-cream"
                        style={{
                            width: 38,
                            height: 38,
                            border: `1.5px solid ${CW.ink}`,
                            background: CW.paper,
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16">
                            <path d="M3 3 L13 13 M13 3 L3 13" stroke={CW.ink} strokeWidth="1.8" fill="none" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto" style={{ padding: "24px 30px 30px" }}>
                    {/* General settings */}
                    <GeneralSettings
                        stayRange={stayRange}
                        onStayRangeChange={setStayRange}
                        validStartDays={validStartDays}
                        onValidStartDaysChange={setValidStartDays}
                        useMockData={useMockData}
                        onToggleMockData={onToggleMockData}
                    />

                    <Separator />

                    {/* Add campground row + view toggle */}
                    <div className="flex items-end gap-4">
                        <div className="flex-1">
                            <AddCampground
                                existingIds={new Set(campgrounds.map((c) => c.id).filter(Boolean))}
                                onAdd={handleAddCampground}
                            />
                        </div>
                        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "cards" | "list")}>
                            <TabsList>
                                <TabsTrigger value="cards">Cards</TabsTrigger>
                                <TabsTrigger value="list">List</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>

                    {/* Expand/collapse controls (cards only) */}
                    {viewMode === "cards" && (
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setExpandedPanels(new Set(campgrounds.map((_, i) => i)))}
                            >
                                Expand all
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setExpandedPanels(new Set())}>
                                Collapse all
                            </Button>
                        </div>
                    )}

                    {/* Cards view */}
                    {viewMode === "cards" && (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            modifiers={[restrictToVerticalAxis]}
                            onDragEnd={handleDragEndWrapper}
                        >
                            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                                <Accordion
                                    type="multiple"
                                    value={accordionValue}
                                    onValueChange={handleAccordionValueChange}
                                    className="space-y-1.5"
                                >
                                    {campgrounds.map((campground, index) => (
                                        <SortableCampgroundEditor
                                            key={campground.id || `idx-${index}`}
                                            campground={campground}
                                            index={index}
                                            isOnlyCampground={campgrounds.length === 1}
                                            expanded={expandedPanels.has(index)}
                                            availableSites={
                                                sitesById[campground.id] ??
                                                availableSites[campground.id] ??
                                                []
                                            }
                                            globalStayRange={stayRange}
                                            globalValidStartDays={validStartDays}
                                            onToggleEnabled={(checked) =>
                                                handleFieldChange(index, "enabled", checked)
                                            }
                                            onFieldChange={(field, value) =>
                                                handleFieldChange(index, field, value)
                                            }
                                            onDateChange={(key, value) => handleDateChange(index, key, value)}
                                            onRemove={() => handleRemoveCampground(index)}
                                            onExpandedChange={(expanded) => {
                                                setExpandedPanels((prev) => {
                                                    const next = new Set(prev);
                                                    if (expanded) next.add(index);
                                                    else next.delete(index);
                                                    return next;
                                                });
                                            }}
                                        />
                                    ))}
                                </Accordion>
                            </SortableContext>
                        </DndContext>
                    )}

                    {/* List view */}
                    {viewMode === "list" && (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            modifiers={[restrictToVerticalAxis]}
                            onDragEnd={handleDragEndWrapper}
                        >
                            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                                <CampgroundsTable
                                    campgrounds={campgrounds}
                                    isOnlyCampground={campgrounds.length === 1}
                                    onToggleEnabled={(index, checked) =>
                                        handleFieldChange(index, "enabled", checked)
                                    }
                                    onRemove={handleRemoveCampground}
                                    onEditClick={openCampgroundInCards}
                                />
                            </SortableContext>
                        </DndContext>
                    )}
                </div>

                <DialogFooter
                    className="flex-row items-center justify-between gap-3 sm:justify-between"
                    style={{
                        background: CW.cream,
                        borderTop: `2px solid ${CW.ink}`,
                        padding: "18px 30px",
                        margin: 0,
                    }}
                >
                    <button
                        type="button"
                        onClick={onResetToDefaults}
                        className="cursor-pointer whitespace-nowrap rounded-[2px] font-poster font-extrabold uppercase transition-colors hover:bg-[color-mix(in_srgb,var(--cw-clay)_8%,transparent)]"
                        style={{
                            fontSize: 12,
                            letterSpacing: "0.12em",
                            padding: "14px 22px",
                            color: CW.clay,
                            border: "1.5px solid transparent",
                        }}
                    >
                        Reset to defaults
                    </button>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="cursor-pointer whitespace-nowrap rounded-[2px] font-poster font-extrabold uppercase transition-colors hover:bg-cw-ink hover:text-cw-cream"
                            style={{
                                fontSize: 12,
                                letterSpacing: "0.12em",
                                padding: "14px 22px",
                                background: CW.paper,
                                color: CW.ink,
                                border: `1.5px solid ${CW.ink}`,
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={isSaveDisabled}
                            className="cursor-pointer whitespace-nowrap rounded-[2px] font-poster font-extrabold uppercase transition-transform hover:-translate-x-px hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                            style={{
                                fontSize: 12,
                                letterSpacing: "0.12em",
                                padding: "14px 22px",
                                background: CW.forest,
                                color: CW.cream,
                                border: `1.5px solid ${CW.forest}`,
                                boxShadow: `3px 3px 0 ${CW.forestDeep}`,
                            }}
                        >
                            Save
                        </button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
