"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface NotifierStats {
    lastPollAt: string;
    campgroundsTracked: number;
    openingsSentToday: number;
    openingsSentLast7Days: number;
    medianLatencyMs: number;
    sampleSize: number;
    todayKey: string;
}

export interface NotifierStatsValue {
    stats: NotifierStats | null;
    nowMs: number;
}

const StatsContext = createContext<NotifierStatsValue | null>(null);

function useStatsInternal(): NotifierStats | null {
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
        const id = setInterval(load, 30_000);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, []);
    return stats;
}

function useNowTickInternal(): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);
    return now;
}

export function StatsProvider({ children }: { children: ReactNode }) {
    const stats = useStatsInternal();
    const nowMs = useNowTickInternal();
    return <StatsContext.Provider value={{ stats, nowMs }}>{children}</StatsContext.Provider>;
}

export function useStats(): NotifierStatsValue {
    const ctx = useContext(StatsContext);
    if (!ctx) throw new Error("useStats must be inside <StatsProvider>");
    return ctx;
}
