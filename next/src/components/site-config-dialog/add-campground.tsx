"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { SiteConfigDialogProps } from "./types";
import { CUSTOM_CATALOG_OPTION } from "./types";

interface AddCampgroundProps {
    catalogOptions: SiteConfigDialogProps["catalogOptions"];
    selectedCatalogIds: Set<string>;
    onAdd: (catalogId: string) => void;
}

export function AddCampground({ catalogOptions, selectedCatalogIds, onAdd }: AddCampgroundProps) {
    const [selection, setSelection] = useState<string>("");

    const handleAdd = () => {
        if (!selection) return;
        if (selection !== CUSTOM_CATALOG_OPTION && selectedCatalogIds.has(selection)) return;
        onAdd(selection);
        setSelection("");
    };

    return (
        <div className="flex items-end gap-2">
            <div className="flex-1">
                <label className="block text-xs font-medium text-muted-foreground">
                    Add campground
                </label>
                <Select value={selection} onValueChange={setSelection}>
                    <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Choose a campground to add" />
                    </SelectTrigger>
                    <SelectContent>
                        {catalogOptions.map((option) => (
                            <SelectItem
                                key={option.id}
                                value={option.id}
                                disabled={selectedCatalogIds.has(option.id)}
                            >
                                {option.name} ({option.area ?? ""})
                            </SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_CATALOG_OPTION}>Custom / Not listed</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <Button
                onClick={handleAdd}
                disabled={
                    !selection ||
                    (selection !== CUSTOM_CATALOG_OPTION && selectedCatalogIds.has(selection))
                }
            >
                <Plus className="mr-1 size-4" />
                Add
            </Button>
        </div>
    );
}
