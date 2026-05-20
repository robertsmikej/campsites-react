"use client";

import React from "react";
import { C, FH, FI, FM, PAD_M } from "@/components/field-notes/tokens";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useStats } from "@/contexts/stats-context";

// ─── Stat formatters ──────────────────────────────────────────────────────────
function formatTimeAgo(ms: number | null | undefined): string {
    if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}

function formatCount(n: number | null | undefined): string {
    if (n == null || !Number.isFinite(n)) return "—";
    return n.toLocaleString();
}

export function StatsBand() {
    const { stats, nowMs } = useStats();
    const isMobile = useIsMobile();

    return (
        <section style={{ background: C.forestDeep, color: C.cream, padding: isMobile ? `28px ${PAD_M}px` : "32px 56px", position: "relative" }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: isMobile ? 24 : 48 }}>
                {(
                    [
                        [
                            "Last poll",
                            stats ? formatTimeAgo(nowMs - new Date(stats.lastPollAt).getTime()) : "—",
                            C.mustard,
                            "ago",
                        ],
                        [
                            "Campgrounds tracked",
                            stats ? formatCount(stats.campgroundsTracked) : "—",
                            C.cream,
                            "sites",
                        ],
                        [
                            "Openings sent today",
                            stats ? formatCount(stats.openingsSentToday) : "—",
                            C.cream,
                            "emails",
                        ],
                        [
                            "Openings this week",
                            stats ? formatCount(stats.openingsSentLast7Days) : "—",
                            C.cream,
                            "and counting",
                        ],
                    ] as const
                ).map(([k, v, color, sub]) => (
                    <div key={k}>
                        <div
                            style={{
                                font: `500 11px/1 ${FM}`,
                                letterSpacing: "0.16em",
                                color: "rgba(251,246,234,0.55)",
                                textTransform: "uppercase",
                            }}
                        >
                            {k}
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8 }}>
                            <span
                                style={{
                                    font: `900 ${isMobile ? 32 : 36}px/1 ${FH}`,
                                    color,
                                    fontVariantNumeric: "tabular-nums",
                                }}
                            >
                                {v}
                            </span>
                            <span style={{ font: `500 italic 14px/1 ${FI}`, color: "rgba(251,246,234,0.55)" }}>
                                {sub}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
