import { Star, StarOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FavoriteStarProps {
    isFavorite: boolean;
    /** When omitted, the button is rendered but does nothing (read-only display). */
    onToggle?: () => void;
    /** Hides the button entirely when true. */
    hidden?: boolean;
    size?: "sm" | "md";
    className?: string;
}

const ICON_SIZE = {
    sm: "size-3.5",
    md: "size-4",
} as const;

/**
 * Star toggle button.  Filled star = favorite; outlined star = not favorite.
 * Pass `hidden` to suppress rendering in read-only contexts.
 */
export function FavoriteStar({
    isFavorite,
    onToggle,
    hidden = false,
    size = "md",
    className,
}: FavoriteStarProps) {
    if (hidden) return null;

    return (
        <Button
            size="icon"
            variant="ghost"
            onClick={(e) => {
                e.stopPropagation();
                onToggle?.();
            }}
            aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
            className={cn(className)}
        >
            {isFavorite ? (
                <Star className={cn(ICON_SIZE[size], "fill-primary text-primary")} />
            ) : (
                <StarOff className={cn(ICON_SIZE[size], "text-muted-foreground")} />
            )}
        </Button>
    );
}
