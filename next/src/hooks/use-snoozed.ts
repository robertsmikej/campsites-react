"use client";

import { useState, useCallback } from "react";
import { readStorage, writeStorage, snoozeUntilDate } from "@/components/dashboard/helpers";

export interface UseSnoozedReturn {
    snoozedOpenings: Record<string, string>;
    toggleSnoozeOpening: (id: string) => void;
    snoozedCgs: Set<string>;
    toggleSnoozeCg: (id: string) => void;
}

export function useSnoozed(): UseSnoozedReturn {
    const [snoozedOpenings, setSnoozedOpenings] = useState<Record<string, string>>(() =>
        readStorage<Record<string, string>>("campwatch:snoozed-openings", {}),
    );

    const toggleSnoozeOpening = useCallback((id: string) => {
        setSnoozedOpenings((prev) => {
            const next = { ...prev };
            if (id in next) { delete next[id]; } else { next[id] = snoozeUntilDate(); }
            writeStorage("campwatch:snoozed-openings", next);
            return next;
        });
    }, []);

    const [snoozedCgs, setSnoozedCgs] = useState<Set<string>>(() => {
        const raw = readStorage<Record<string, string>>("campwatch:snoozed-cgs", {});
        return new Set(Object.keys(raw));
    });

    const toggleSnoozeCg = useCallback((id: string) => {
        setSnoozedCgs((prev) => {
            const next = new Set(prev);
            if (next.has(id)) { next.delete(id); } else { next.add(id); }
            const map: Record<string, string> = {};
            next.forEach((k) => { map[k] = snoozeUntilDate(); });
            writeStorage("campwatch:snoozed-cgs", map);
            return next;
        });
    }, []);

    return { snoozedOpenings, toggleSnoozeOpening, snoozedCgs, toggleSnoozeCg };
}
