"use client";

import { useState } from "react";
import { Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { parseFacilityId, type FacilitySummary } from "@/lib/recgov-facility";
import type { Campground, CampgroundType } from "@/types/campground";

interface AddCampgroundProps {
    existingIds: Set<string>;
    onAdd: (campground: Campground) => void;
}

const TYPE_OPTIONS: CampgroundType[] = ["campground", "cabin", "lookout"];

function defaultDates(): { startDate: string; endDate: string } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 4, 0);
    const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { startDate: fmt(start), endDate: fmt(end) };
}

export function AddCampground({ existingIds, onAdd }: AddCampgroundProps) {
    const [input, setInput] = useState("");
    const [fetching, setFetching] = useState(false);
    const [preview, setPreview] = useState<FacilitySummary | null>(null);
    const [dates, setDates] = useState(defaultDates);

    const parsed = parseFacilityId(input);
    const canFetch = parsed !== null && !fetching;

    async function handleFetch() {
        if (!parsed) return;
        if (existingIds.has(parsed)) {
            toast.info("That campground is already in your list");
            return;
        }
        setFetching(true);
        try {
            const r = await fetch(
                `/api/recgov/facility/${encodeURIComponent(parsed)}`,
                { credentials: "include" },
            );
            if (!r.ok) {
                const body = (await r.json().catch(() => ({}))) as { error?: string };
                toast.error(body.error ?? `Lookup failed (${r.status})`);
                return;
            }
            const data = (await r.json()) as { summary: FacilitySummary };
            setPreview(data.summary);
            setDates(defaultDates());
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Lookup failed");
        } finally {
            setFetching(false);
        }
    }

    function handleAdd() {
        if (!preview) return;
        const campground: Campground = {
            id: preview.id,
            name: preview.name.trim(),
            site: "recreation.gov",
            type: preview.type,
            sites: { favorites: [], worthwhile: [] },
            showOrHide: { Favorites: true, Worthwhile: true, "All Others": true },
            enabled: true,
            dates: { startDate: dates.startDate, endDate: dates.endDate },
        };
        if (preview.area?.trim()) campground.area = preview.area.trim();
        if (preview.description?.trim()) campground.description = preview.description.trim();
        if (preview.imageUrl?.trim()) campground.image = preview.imageUrl.trim();
        onAdd(campground);
        setInput("");
        setPreview(null);
        setDates(defaultDates());
    }

    function handleClear() {
        setPreview(null);
    }

    function updatePreview<K extends keyof FacilitySummary>(key: K, value: FacilitySummary[K]) {
        setPreview((p) => (p ? { ...p, [key]: value } : p));
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1">
                    <Label htmlFor="recgov-input" className="text-xs font-medium text-muted-foreground">
                        Recreation.gov URL or facility ID
                    </Label>
                    <Input
                        id="recgov-input"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="https://www.recreation.gov/camping/campgrounds/232358"
                    />
                </div>
                <Button onClick={handleFetch} disabled={!canFetch}>
                    {fetching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                    <span className="ml-1">Fetch</span>
                </Button>
            </div>

            {preview ? (
                <Card>
                    <CardContent className="space-y-3 p-4">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Sparkles className="size-3" />
                            From recreation.gov ID {preview.id}
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs">Name</Label>
                            <Input
                                value={preview.name}
                                onChange={(e) => updatePreview("name", e.target.value)}
                            />
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs">Area</Label>
                            <Input
                                value={preview.area ?? ""}
                                onChange={(e) => updatePreview("area", e.target.value)}
                                placeholder="e.g. Stanley"
                            />
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs">Type</Label>
                            <Select
                                value={preview.type}
                                onValueChange={(value) => updatePreview("type", value as CampgroundType)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {TYPE_OPTIONS.map((t) => (
                                        <SelectItem key={t} value={t}>
                                            {t}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs">Description</Label>
                            <Textarea
                                value={preview.description ?? ""}
                                onChange={(e) => updatePreview("description", e.target.value)}
                                rows={3}
                            />
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs">Image URL (optional)</Label>
                            <Input
                                value={preview.imageUrl ?? ""}
                                onChange={(e) => updatePreview("imageUrl", e.target.value)}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <Label className="text-xs">Default start date</Label>
                                <Input
                                    type="date"
                                    value={dates.startDate}
                                    onChange={(e) => setDates((d) => ({ ...d, startDate: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Default end date</Label>
                                <Input
                                    type="date"
                                    value={dates.endDate}
                                    onChange={(e) => setDates((d) => ({ ...d, endDate: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                            <Button variant="ghost" onClick={handleClear}>
                                Cancel
                            </Button>
                            <Button onClick={handleAdd}>Add to list</Button>
                        </div>
                    </CardContent>
                </Card>
            ) : null}
        </div>
    );
}
