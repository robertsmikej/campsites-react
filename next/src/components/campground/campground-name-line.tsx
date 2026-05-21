import { cn } from "@/lib/utils";

interface CampgroundNameLineProps {
    name: string;
    area?: string | null;
    /** Extra classes for the name element (h3). */
    nameClassName?: string;
    /** Extra classes for the area subtitle (p). Omit to hide the subtitle entirely. */
    subtitleClassName?: string;
}

/**
 * Renders a campground name + optional area subtitle.
 * Default styling matches CampgroundRow; consumers override via className props.
 */
export function CampgroundNameLine({
    name,
    area,
    nameClassName,
    subtitleClassName,
}: CampgroundNameLineProps) {
    return (
        <div className="min-w-0">
            <h3 className={cn(
                "truncate font-display font-semibold leading-tight text-base",
                nameClassName,
            )}>
                {name}
            </h3>
            {subtitleClassName !== undefined && (
                <p className={cn("truncate text-xs text-muted-foreground", subtitleClassName)}>
                    {area ?? ""}
                </p>
            )}
        </div>
    );
}
