"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Campground, SiteConfig } from "@/types/campground";
import { toEditableCampground, sanitizeCampground, createEmptyCampground } from "./serialize";
import {
    DEFAULT_STAY_RANGE,
    type EditableCampground,
    type SiteConfigDialogProps,
} from "./types";

export function SiteConfigDialog(props: SiteConfigDialogProps) {
    const {
        open,
        onClose,
        onSave,
        onResetToDefaults,
        initialData,
        catalogOptions,
        globalSettings,
    } = props;

    const catalogIds = useMemo(
        () => new Set(catalogOptions.map((o) => o.id)),
        [catalogOptions],
    );

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

    useEffect(() => {
        if (!open) return;
        const initial = (initialData["recreation.gov"] ?? []).map((c) =>
            toEditableCampground(c, catalogIds),
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
    }, [open, initialData, catalogIds, globalSettings]);

    const handleSave = () => {
        const sanitized = campgrounds
            .map(sanitizeCampground)
            .filter((c): c is Campground => !!c.id && !!c.name);
        const newConfig: SiteConfig = { "recreation.gov": sanitized };
        const stayLengths = Array.from(
            { length: stayRange[1] - stayRange[0] + 1 },
            (_, i) => stayRange[0] + i,
        );
        onSave(newConfig, { stayLengths, validStartDays });
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Configure Campgrounds</DialogTitle>
                </DialogHeader>
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "cards" | "list")}>
                    <TabsList>
                        <TabsTrigger value="cards">Cards</TabsTrigger>
                        <TabsTrigger value="list">List</TabsTrigger>
                    </TabsList>
                </Tabs>
                <div className="text-sm text-muted-foreground">
                    {campgrounds.length} campgrounds. Editor coming in the next task.
                </div>
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onResetToDefaults}>
                        Reset to defaults
                    </Button>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave}>Save</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
