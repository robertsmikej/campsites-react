import type { JSX } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AdjacentGroup } from "@/types/campground";

interface AdjacentBadgeProps {
    groups?: AdjacentGroup[];
    className?: string;
}

export function AdjacentBadge({ groups, className }: AdjacentBadgeProps): JSX.Element | null {
    if (!groups || groups.length === 0) return null;
    const largest = Math.max(...groups.map((g) => g.siteIds.length));
    return (
        <Badge
            variant="outline"
            className={cn("border-primary text-primary", className)}
            title="Adjacent sites open for the same dates"
        >
            <span aria-hidden>⛓</span>
            {largest} adjacent
        </Badge>
    );
}
