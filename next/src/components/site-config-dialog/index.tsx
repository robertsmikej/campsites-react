"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CW } from "@/components/field-notes/cw-tokens";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import type { BlackoutRange, Campground, SiteConfig } from "@/types/campground";
import { useCampgroundSites } from "@/hooks/use-campground-sites";

import {
    toEditableCampground,
    sanitizeCampground,
    createEmptyCampground,
    enableWithHighCapCheck,
} from "./serialize";
import { DEFAULT_STAY_RANGE, type EditableCampground, type SiteConfigDialogProps } from "./types";
import { createDragEndHandler } from "./drag-drop";
import { GeneralSettings } from "./general-settings";
import { AddCampground } from "./add-campground";
import { CampgroundEditor } from "./campground-editor";
import { CampgroundsTable } from "./campgrounds-table";

// Confirm wrapper for "Start fresh", rendered from the desktop footer and the
// mobile in-body actions block.
function StartFreshConfirm({
    onStartFresh,
    trigger,
}: {
    onStartFresh: () => void;
    trigger: React.ReactNode;
}) {
    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Erase your whole watchlist?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This removes every campground from your list. Your notification settings stay, and you
                        can add any campground back afterward.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Keep them</AlertDialogCancel>
                    <AlertDialogAction onClick={onStartFresh}>Erase all</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

// Wrapper to apply dnd-kit sortable to each CampgroundEditor
function SortableCampgroundEditor(props: {
    campground: EditableCampground;
    index: number;
    isOnlyCampground: boolean;
    expanded: boolean;
    availableSites: string[];
    globalStayRange: [number, number];
    globalValidStartDays: string[];
    highTierCount: number;
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
        onAddDefaults,
        onStartFresh,
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
    const [blackoutDates, setBlackoutDates] = useState<BlackoutRange[]>(
        () => globalSettings.blackoutDates ?? [],
    );
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
        setBlackoutDates(globalSettings.blackoutDates ?? []);
        setExpandedPanels(new Set([0]));
        setViewMode("cards");
    }, [open, initialData, globalSettings]);

    // Mobile back-swipe: the full-screen dialog owns a history entry so the
    // phone's back gesture (or back button) closes it instead of leaving the
    // page. Mirrors mobile-timeline's detail-screen pattern, though the ref
    // indirection below is new here: onClose is an external, non-memoized
    // prop, while mobile-timeline's equivalent used stable setState functions
    // that never needed one. onClose is read through a ref so a new inline
    // callback identity can't re-run the effect and push duplicate entries.
    const onCloseRef = useRef(onClose);
    // Layout effects run synchronously after commit (before the browser
    // paints or any event, including popstate, can fire), so a popstate
    // handler can never observe a stale onClose the way it could with a
    // passive effect that hasn't flushed yet.
    useLayoutEffect(() => {
        onCloseRef.current = onClose;
    });
    const ownsHistoryEntry = useRef(false);
    useEffect(() => {
        if (!open) return;
        if (typeof window === "undefined") return;
        if (!window.matchMedia("(max-width: 639px)").matches) return;
        // Carry the detail screen's flag onto our own entry: if this dialog
        // was opened from mobile-timeline's detail screen (whose entry has
        // cwCampgroundDetail: true), a later forward-swipe lands on our entry
        // instead of the detail screen's. Dropping the flag here would make
        // mobile-timeline's popstate handler think the detail screen closed,
        // collapsing it underneath us. Mirrors mobile-timeline's own map
        // modal, which carries cwCampgroundDetail forward the same way.
        const under = window.history.state as { cwCampgroundDetail?: boolean } | null;
        window.history.pushState(
            { ...(under?.cwCampgroundDetail ? { cwCampgroundDetail: true } : {}), cwConfigDialog: true },
            "",
        );
        ownsHistoryEntry.current = true;
        const onPop = () => {
            ownsHistoryEntry.current = false;
            onCloseRef.current();
        };
        window.addEventListener("popstate", onPop);
        return () => {
            window.removeEventListener("popstate", onPop);
            if (
                ownsHistoryEntry.current &&
                (window.history.state as { cwConfigDialog?: boolean } | null)?.cwConfigDialog
            ) {
                // Closed by a button while our entry is still on top: unwind it
                // so the stack stays consistent.
                ownsHistoryEntry.current = false;
                window.history.back();
            }
        };
    }, [open]);

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

    const handleToggleEnabled = (index: number, checked: boolean) => {
        if (checked) {
            // Use the cap-aware helper: if this campground is "high" and other
            // enabled campgrounds already fill the HIGH_PRIORITY_CAP, it gets
            // demoted to normal rather than overflowing past the cap.
            setCampgrounds((prev) =>
                prev.map((c, idx) => (idx === index ? enableWithHighCapCheck(prev, index) : c)),
            );
        } else {
            handleFieldChange(index, "enabled", false);
        }
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
        const validBlackouts = blackoutDates.filter((b) => b.from && b.to && b.from <= b.to);
        onSave(newConfig, {
            stayLengths: buildStayLengths(stayRange),
            validStartDays,
            ...(validBlackouts.length > 0 ? { blackoutDates: validBlackouts } : {}),
        });
    };

    const isSaveDisabled = campgrounds.some((c) => !c.name.trim() || !c.id.trim());

    const highTierCount = campgrounds.filter((c) => c.checkPriority === "high" && c.enabled !== false).length;

    const sortableIds = campgrounds.map((c, idx) => c.id || `idx-${idx}`);

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            {/* The shadcn DialogContent primitive centers itself with
                `fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2`,
                which assumes translating by half of a stable viewport
                height lands it back at the true center. On mobile, showing
                or hiding the browser's URL bar changes 100dvh after the
                dialog has already painted, so that 50% + translate(-50%)
                math no longer cancels out to edge-to-edge: the panel visibly
                shifts instead of filling the screen. inset-0 with no
                translate sidesteps the math entirely. sm:inset-auto plus
                sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
                restore the primitive's original centering once the dialog
                is no longer full screen at the sm breakpoint. */}
            <DialogContent
                showCloseButton={false}
                className="flex h-dvh w-screen max-w-none flex-col overflow-hidden rounded-none border-0 p-0 shadow-none sm:h-auto sm:max-h-[90vh] sm:w-[95vw] sm:max-w-6xl sm:border-[1.5px] sm:border-[var(--cw-ink)] sm:shadow-[10px_12px_0_var(--cw-forest),0_40px_90px_-30px_rgba(20,15,12,0.8)] inset-0 translate-x-0 translate-y-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2"
                style={{ background: CW.paper }}
            >
                {/* Masthead */}
                <div
                    className="flex items-start justify-between p-4 sm:px-[30px] sm:pb-5 sm:pt-6"
                    style={{ background: CW.cream, borderBottom: `2px solid ${CW.ink}` }}
                >
                    <div className="min-w-0">
                        <div
                            className="hidden font-mono-field font-medium uppercase sm:block"
                            style={{ fontSize: 10, letterSpacing: "0.22em", color: CW.clay }}
                        >
                            § Watchlist · Field Station Setup
                        </div>
                        <DialogTitle
                            className="font-poster text-[22px] font-black uppercase leading-none sm:mt-[9px] sm:text-[38px] sm:leading-[0.92]"
                            style={{ letterSpacing: "-0.01em" }}
                        >
                            Configure{" "}
                            <span
                                className="font-italic-serif text-[20px] italic normal-case sm:mt-[2px] sm:block sm:text-[30px] sm:leading-none"
                                style={{ color: CW.forest }}
                            >
                                campgrounds
                            </span>
                        </DialogTitle>
                        <div
                            className="hidden font-italic-serif italic sm:block"
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

                <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:px-[30px] sm:pb-[30px] sm:pt-6">
                    {/* General settings */}
                    <GeneralSettings
                        stayRange={stayRange}
                        onStayRangeChange={setStayRange}
                        validStartDays={validStartDays}
                        onValidStartDaysChange={setValidStartDays}
                        useMockData={useMockData}
                        onToggleMockData={onToggleMockData}
                        blackoutDates={blackoutDates}
                        onBlackoutDatesChange={setBlackoutDates}
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
                        <div className="hidden sm:block">
                            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "cards" | "list")}>
                                <TabsList>
                                    <TabsTrigger value="cards">Cards</TabsTrigger>
                                    <TabsTrigger value="list">List</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
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
                                            highTierCount={highTierCount}
                                            onToggleEnabled={(checked) => handleToggleEnabled(index, checked)}
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
                                    onToggleEnabled={(index, checked) => handleToggleEnabled(index, checked)}
                                    onRemove={handleRemoveCampground}
                                    onEditClick={openCampgroundInCards}
                                />
                            </SortableContext>
                        </DndContext>
                    )}

                    {/* Rare bulk actions live in the scroll body on mobile; the
                        sticky footer keeps only Cancel/Save. Desktop shows these
                        in the footer instead. */}
                    <div className="flex flex-col items-start gap-1 border-t border-[var(--cw-rule)] pt-3 sm:hidden">
                        <button
                            type="button"
                            onClick={onAddDefaults}
                            className="cursor-pointer rounded-[2px] px-2 py-2 font-poster text-[12px] font-extrabold uppercase tracking-[0.12em]"
                            style={{ color: CW.clay }}
                        >
                            Add the curator&apos;s picks
                        </button>
                        <StartFreshConfirm
                            onStartFresh={onStartFresh}
                            trigger={
                                <button
                                    type="button"
                                    className="cursor-pointer rounded-[2px] px-2 py-2 font-poster text-[12px] font-extrabold uppercase tracking-[0.12em]"
                                    style={{ color: CW.inkSoft }}
                                >
                                    Start fresh
                                </button>
                            }
                        />
                    </div>
                </div>

                <DialogFooter
                    className="flex-row items-center justify-between gap-3 px-4 py-3 sm:justify-between sm:px-[30px] sm:py-[18px]"
                    style={{ background: CW.cream, borderTop: `2px solid ${CW.ink}`, margin: 0 }}
                >
                    <div className="hidden items-center gap-1 sm:flex sm:gap-3">
                        <button
                            type="button"
                            onClick={onAddDefaults}
                            className="cursor-pointer whitespace-nowrap rounded-[2px] font-poster font-extrabold uppercase transition-colors hover:bg-[color-mix(in_srgb,var(--cw-clay)_8%,transparent)]"
                            style={{
                                fontSize: 12,
                                letterSpacing: "0.12em",
                                padding: "14px 22px",
                                color: CW.clay,
                                border: "1.5px solid transparent",
                            }}
                        >
                            Add the curator&apos;s picks
                        </button>
                        <StartFreshConfirm
                            onStartFresh={onStartFresh}
                            trigger={
                                <button
                                    type="button"
                                    className="cursor-pointer whitespace-nowrap rounded-[2px] font-poster font-extrabold uppercase transition-colors hover:bg-[color-mix(in_srgb,var(--cw-ink-soft)_8%,transparent)]"
                                    style={{
                                        fontSize: 12,
                                        letterSpacing: "0.12em",
                                        padding: "14px 22px",
                                        color: CW.inkSoft,
                                        border: "1.5px solid transparent",
                                    }}
                                >
                                    Start fresh
                                </button>
                            }
                        />
                    </div>
                    <div className="flex w-full items-center gap-3 sm:w-auto">
                        <button
                            type="button"
                            onClick={onClose}
                            className="cursor-pointer whitespace-nowrap rounded-[2px] font-poster font-extrabold uppercase transition-colors hover:bg-cw-ink hover:text-cw-cream flex-1 sm:flex-initial"
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
                            className="cursor-pointer whitespace-nowrap rounded-[2px] font-poster font-extrabold uppercase transition-transform hover:-translate-x-px hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 flex-1 sm:flex-initial"
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
