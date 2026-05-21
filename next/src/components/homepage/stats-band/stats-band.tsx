"use client";

import { C } from "@/components/field-notes/tokens";
import { useStats } from "@/contexts/stats-context";
import { formatTimeAgo } from "@/components/field-notes/format-time-ago";
import { StatTile } from "./stat-tile";

function formatCount(n: number | null | undefined): string {
    if (n == null || !Number.isFinite(n)) return "—";
    return n.toLocaleString();
}

export function StatsBand() {
    const { stats, nowMs } = useStats();

    const tiles = [
        {
            label: "Last poll",
            value: stats ? formatTimeAgo(nowMs - new Date(stats.lastPollAt).getTime()) : "—",
            color: C.mustard,
            sub: "ago",
        },
        {
            label: "Campgrounds tracked",
            value: stats ? formatCount(stats.campgroundsTracked) : "—",
            color: C.cream,
            sub: "sites",
        },
        {
            label: "Openings sent today",
            value: stats ? formatCount(stats.openingsSentToday) : "—",
            color: C.cream,
            sub: "emails",
        },
        {
            label: "Openings this week",
            value: stats ? formatCount(stats.openingsSentLast7Days) : "—",
            color: C.cream,
            sub: "and counting",
        },
    ] as const;

    return (
        <section
            className="relative py-7 px-[22px] md:py-8 md:px-14"
            style={{ background: C.waterDeep, color: C.cream }}
        >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-12">
                {tiles.map((tile) => (
                    <StatTile key={tile.label} {...tile} />
                ))}
            </div>
        </section>
    );
}
