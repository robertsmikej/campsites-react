import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface OpenCountBadgeProps {
    count: number;
    /** "default" = normal text size; "compact" = smaller text. */
    variant?: "default" | "compact";
    className?: string;
}

/**
 * Pill badge showing "X open" or "Nothing open".
 * Used inline next to the campground name in list rows.
 */
export function OpenCountBadge({ count, variant = "default", className }: OpenCountBadgeProps) {
    const textSize = variant === "compact" ? "text-[9px]" : "text-[12px]";

    if (count === 0) {
        return (
            <Badge variant="secondary" className={cn("shrink-0", textSize, className)}>
                Nothing open
            </Badge>
        );
    }

    return (
        <Badge className={cn("shrink-0 bg-primary text-primary-foreground", textSize, className)}>
            {count} open
        </Badge>
    );
}
