"use client";

import { GripVertical, Trash2, Pencil } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import type { EditableCampground } from "./types";

interface CampgroundsTableProps {
    campgrounds: EditableCampground[];
    isOnlyCampground: boolean;
    onToggleEnabled: (index: number, checked: boolean) => void;
    onRemove: (index: number) => void;
    onEditClick: (index: number) => void;
    dragHandlePropsMap?: Record<number, Record<string, unknown>>;
}

export function CampgroundsTable({
    campgrounds,
    isOnlyCampground,
    onToggleEnabled,
    onRemove,
    onEditClick,
    dragHandlePropsMap,
}: CampgroundsTableProps) {
    return (
        <div className="max-h-80 overflow-auto rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Campground</TableHead>
                        <TableHead>Area</TableHead>
                        <TableHead>Facility ID</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="w-36">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {campgrounds.map((campground, index) => {
                        const nameLabel = campground.name || `Campground ${index + 1}`;
                        const isEnabled = campground.enabled !== false;
                        const handleProps = dragHandlePropsMap?.[index] ?? {};

                        return (
                            <TableRow key={`${campground.id}-${index}`}>
                                <TableCell>
                                    <span
                                        className="cursor-grab text-muted-foreground"
                                        {...(handleProps as React.HTMLAttributes<HTMLSpanElement>)}
                                    >
                                        <GripVertical className="size-4" />
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <span className={!isEnabled ? "opacity-50" : ""}>{nameLabel}</span>
                                    {!isEnabled && (
                                        <span className="ml-2 text-xs italic text-muted-foreground">
                                            disabled
                                        </span>
                                    )}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                    {campground.area || "—"}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                    {campground.id || "—"}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                    {campground.site || "—"}
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-1">
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Switch
                                                        checked={isEnabled}
                                                        onCheckedChange={(checked) =>
                                                            onToggleEnabled(index, checked)
                                                        }
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
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-7"
                                            onClick={() => onEditClick(index)}
                                            aria-label="Edit campground"
                                        >
                                            <Pencil className="size-3.5" />
                                        </Button>
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="size-7"
                                                        onClick={() => onRemove(index)}
                                                        disabled={isOnlyCampground}
                                                        aria-label="Remove campground"
                                                    >
                                                        <Trash2 className="size-3.5" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>Remove campground</TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
