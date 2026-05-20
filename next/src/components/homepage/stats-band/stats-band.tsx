"use client";

import { C, PAD_M } from "@/components/field-notes/tokens";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useStats } from "@/contexts/stats-context";
import { formatTimeAgo } from "@/components/field-notes/format-time-ago";
import { StatTile } from "./stat-tile";

function formatCount(n: number | null | undefined): string {
    if (n == null || !Number.isFinite(n)) return "—";
    return n.toLocaleString();
}

export function StatsBand() {
    const { stats, nowMs } = useStats();
    const isMobile = useIsMobile();

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
        <section style={{ background: C.forestDeep, color: C.cream, padding: isMobile ? `28px ${PAD_M}px` : "32px 56px", position: "relative" }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: isMobile ? 24 : 48 }}>
                {tiles.map((tile) => (
                    <StatTile key={tile.label} {...tile} isMobile={isMobile} />
                ))}
            </div>
        </section>
    );
}
