"use client";

import { useEffect, useState } from "react";
import type { GlobalSettings } from "@/types/campground";

const KEY = "campsites-react-global-settings";

function getDefaults(): GlobalSettings {
    return {
        stayLengths: [2, 3, 4, 5],
        validStartDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    };
}

function load(): GlobalSettings {
    if (typeof window === "undefined") return getDefaults();
    try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return getDefaults();
        return { ...getDefaults(), ...(JSON.parse(raw) as Partial<GlobalSettings>) };
    } catch {
        return getDefaults();
    }
}

export function useGlobalSettings() {
    const [globalSettings, setGlobalSettingsState] = useState<GlobalSettings>(getDefaults);

    useEffect(() => {
        setGlobalSettingsState(load());
    }, []);

    const setGlobalSettings = (next: GlobalSettings) => {
        setGlobalSettingsState(next);
        if (typeof window !== "undefined") {
            try {
                window.localStorage.setItem(KEY, JSON.stringify(next));
            } catch {
                // ignore
            }
        }
    };

    return { globalSettings, setGlobalSettings };
}
