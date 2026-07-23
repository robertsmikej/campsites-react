"use client";

import { createContext, useContext } from "react";
import type { BlackoutRange, TripWindow } from "@/types/campground";

export interface SiteSettingsValue {
    dates: {
        startDate?: string;
        endDate?: string;
        stayLengths: number[];
        validStartDays: string[];
        blackoutDates?: BlackoutRange[];
        tripWindows?: TripWindow[];
    };
    views?: { type: string };
    appearance?: { mode: string };
    dev?: { useMockData: boolean };
    ignoreTypes?: string[];
}

const SiteSettingsContext = createContext<SiteSettingsValue | null>(null);

export function useSiteSettings(): SiteSettingsValue | null {
    return useContext(SiteSettingsContext);
}

export default SiteSettingsContext;
