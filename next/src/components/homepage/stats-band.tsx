"use client";

import React, { useState, useEffect } from "react";
import { C, FH, FI, FM, PAD_M } from "@/components/field-notes/tokens";
import { useIsMobile } from "@/hooks/use-is-mobile";

// ─── Stats types ──────────────────────────────────────────────────────────────
interface NotifierStats {
    lastPollAt: string;
    campgroundsTracked: number;
    openingsSentToday: number;
    openingsSentLast7Days: number;
    medianLatencyMs: number;
    sampleSize: number;
    todayKey: string;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useStats(): NotifierStats | null {
    const [stats, setStats] = useState<NotifierStats | null>(null);
    useEffect(() => {
        let cancelled = false;
        const load = () => {
            fetch("/api/stats")
                .then((r) => (r.ok ? r.json() : null))
                .then((data: unknown) => {
                    if (cancelled) return;
                    setStats(data as NotifierStats | null);
                })
                .catch(() => {});
        };
        load();
        // Re-poll every 30s so when the cron writes a new lastPollAt the UI catches up
        // within a minute (the /api/stats response is also edge-cached for 30s).
        const id = setInterval(load, 30_000);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, []);
    return stats;
}

function useNowTick(): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);
    return now;
}

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
    const stats = useStats();
    const nowMs = useNowTick();
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
