import { Home, Flame, Mountain } from "lucide-react";
import type { Campground } from "@/types/campground";

// Cabin is not in lucide-react@1.x; fall back to Home.
const TYPE_BADGES = {
    cabin: { Icon: Home, label: "Cabin", color: "#8d6e63" },
    lookout: { Icon: Mountain, label: "Lookout", color: "#5d4037" },
    campground: { Icon: Flame, label: "Campground", color: "#ef6c00" },
} as const;

export type TypeBadge = (typeof TYPE_BADGES)[keyof typeof TYPE_BADGES];

export function getTypeBadge(campground: Pick<Campground, "type">): TypeBadge {
    const key = (campground?.type ?? "campground") as keyof typeof TYPE_BADGES;
    return TYPE_BADGES[key] ?? TYPE_BADGES.campground;
}
