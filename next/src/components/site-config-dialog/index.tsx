"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import type { Campground, SiteConfig } from "@/types/campground";

import { toEditableCampground, sanitizeCampground, createEmptyCampground } from "./serialize";
import {
    CUSTOM_CATALOG_OPTION,
    DEFAULT_STAY_RANGE,
    type EditableCampground,
    type SiteConfigDialogProps,
} from "./types";
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
    onShowOrHideChange: (key: "Favorites" | "Worthwhile" | "All Others", checked: boolean) => void;
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
        <div ref={setNodeRef} style={style}>
            <CampgroundEditor
                {...props}
                dragHandleProps={{ ...attributes, ...listeners }}
            />
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
        catalogOptions,
        globalSettings,
        availableSites,
        useMockData,
        onToggleMockData,
    } = props;

    const catalogLookup = useMemo(() => {
        return catalogOptions.reduce<Record<string, (typeof catalogOptions)[0]>>((acc, opt) => {
            if (opt?.id) acc[opt.id] = opt;
            return acc;
        }, {});
    }, [catalogOptions]);

    const catalogIds = useMemo(() => new Set(Object.keys(catalogLookup)), [catalogLookup]);

    const [campgrounds, setCampgrounds] = useState<EditableCampground[]>([
        createEmptyCampground(),
    ]);
    const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
    const [stayRange, setStayRange] = useState<[number, number]>(() =>
        globalSettings.stayLengths && globalSettings.stayLengths.length > 0
            ? [
                  Math.min(...globalSettings.stayLengths),
                  Math.max(...globalSettings.stayLengths),
              ]
            : DEFAULT_STAY_RANGE,
    );
    const [validStartDays, setValidStartDays] = useState<string[]>(
        () => globalSettings.validStartDays ?? [],
    );
    const [expandedPanels, setExpandedPanels] = useState<Set<number>>(new Set([0]));

    const previousViewMode = useRef(viewMode);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    // Reset state when dialog opens
    useEffect(() => {
        if (!open) return;
        const initial = (initialData["recreation.gov"] ?? []).map((c) =>
            toEditableCampground(c as unknown as Record<string, unknown>, catalogIds),
        );
        setCampgrounds(initial.length > 0 ? initial : [createEmptyCampground()]);
        setStayRange(
            globalSettings.stayLengths && globalSettings.stayLengths.length > 0
                ? [
                      Math.min(...globalSettings.stayLengths),
                      Math.max(...globalSettings.stayLengths),
                  ]
                : DEFAULT_STAY_RANGE,
        );
        setValidStartDays(globalSettings.validStartDays ?? []);
        setExpandedPanels(new Set([0]));
        setViewMode("cards");
    }, [open, initialData, catalogIds, globalSettings]);

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

    const selectedCatalogIds = useMemo(() => {
        return new Set(
            campgrounds
                .map((c) =>
                    c.catalogId && c.catalogId !== CUSTOM_CATALOG_OPTION ? c.catalogId : null,
                )
                .filter(Boolean) as string[],
        );
    }, [campgrounds]);

    const updateCampground = (index: number, updater: (c: EditableCampground) => EditableCampground) => {
        setCampgrounds((prev) =>
            prev.map((c, idx) => (idx === index ? updater(c) : c)),
        );
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

    const handleShowOrHideChange = (
        index: number,
        key: "Favorites" | "Worthwhile" | "All Others",
        checked: boolean,
    ) => {
        updateCampground(index, (c) => ({
            ...c,
            showOrHide: { ...c.showOrHide, [key]: checked },
        }));
    };

    const handleRemoveCampground = (index: number) => {
        setCampgrounds((prev) => {
            if (prev.length === 1) return [createEmptyCampground()];
            return prev.filter((_, idx) => idx !== index);
        });
    };

    const buildCampgroundFromCatalog = (catalogId: string): EditableCampground => {
        const entry = catalogLookup[catalogId];
        if (!entry) return createEmptyCampground();
        return {
            ...createEmptyCampground(),
            catalogId,
            name: entry.name ?? "",
            area: entry.area ?? "",
            site: entry.site ?? entry.system ?? "recreation.gov",
            type: entry.type ?? "campground",
            description: entry.description ?? "",
            image: entry.image ?? "",
            id: entry.id ?? "",
        };
    };

    const handleAdd = (catalogId: string) => {
        if (catalogId === CUSTOM_CATALOG_OPTION) {
            setCampgrounds((prev) => [...prev, createEmptyCampground()]);
        } else if (!selectedCatalogIds.has(catalogId)) {
            setCampgrounds((prev) => [...prev, buildCampgroundFromCatalog(catalogId)]);
        }
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
                return match ? parseInt(match[1], 10) : -1;
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

    const isSaveDisabled = campgrounds.some(
        (c) => !c.name.trim() || !c.id.trim(),
    );

    const sortableIds = campgrounds.map((c, idx) => c.id || `idx-${idx}`);

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden">
                <DialogHeader>
                    <DialogTitle>Configure Campgrounds</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
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
                                catalogOptions={catalogOptions}
                                selectedCatalogIds={selectedCatalogIds}
                                onAdd={handleAdd}
                            />
                        </div>
                        <Tabs
                            value={viewMode}
                            onValueChange={(v) => setViewMode(v as "cards" | "list")}
                        >
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
                                onClick={() =>
                                    setExpandedPanels(new Set(campgrounds.map((_, i) => i)))
                                }
                            >
                                Expand all
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setExpandedPanels(new Set())}
                            >
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
                            <SortableContext
                                items={sortableIds}
                                strategy={verticalListSortingStrategy}
                            >
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
                                            availableSites={availableSites[campground.id] ?? []}
                                            globalStayRange={stayRange}
                                            globalValidStartDays={validStartDays}
                                            onToggleEnabled={(checked) =>
                                                handleFieldChange(index, "enabled", checked)
                                            }
                                            onFieldChange={(field, value) =>
                                                handleFieldChange(index, field, value)
                                            }
                                            onDateChange={(key, value) =>
                                                handleDateChange(index, key, value)
                                            }
                                            onShowOrHideChange={(key, checked) =>
                                                handleShowOrHideChange(index, key, checked)
                                            }
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
                            <SortableContext
                                items={sortableIds}
                                strategy={verticalListSortingStrategy}
                            >
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

                <DialogFooter className="gap-2 pt-4">
                    <Button variant="destructive" onClick={onResetToDefaults}>
                        Reset to defaults
                    </Button>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isSaveDisabled}>
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
