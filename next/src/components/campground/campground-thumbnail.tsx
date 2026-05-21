import { cn } from "@/lib/utils";

interface CampgroundThumbnailProps {
    /** Resolved image URL.  Handles missing/empty gracefully (shows muted bg). */
    imageUrl: string;
    /** Tailwind size class shorthand. Defaults to "md". */
    size?: "sm" | "md" | "lg";
    className?: string;
}

const SIZE_CLASSES = {
    sm: "size-9",
    md: "size-12",
    lg: "size-16",
} as const;

export function CampgroundThumbnail({ imageUrl, size = "md", className }: CampgroundThumbnailProps) {
    return (
        <div
            className={cn(
                "shrink-0 overflow-hidden rounded-md bg-muted bg-cover bg-center",
                SIZE_CLASSES[size],
                className,
            )}
            style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
            aria-hidden
        />
    );
}
