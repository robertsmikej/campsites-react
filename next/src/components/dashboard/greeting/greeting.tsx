"use client";

import { useEffect, useState } from "react";
import { StatusSentence } from "./status-sentence";
import type { AuthState } from "@/hooks/use-auth";

type TimeOfDay = "morning" | "afternoon" | "evening";

interface LocalClock {
    timeOfDay: TimeOfDay;
    dateEyebrow: string;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NOON_HOUR = 12;
const EVENING_HOUR = 18;

function timeOfDayFor(date: Date): TimeOfDay {
    const hour = date.getHours();
    if (hour < NOON_HOUR) return "morning";
    if (hour < EVENING_HOUR) return "afternoon";
    return "evening";
}

function romanYear(y: number): string {
    const map: [number, string][] = [
        [1000, "M"],
        [900, "CM"],
        [500, "D"],
        [400, "CD"],
        [100, "C"],
        [90, "XC"],
        [50, "L"],
        [40, "XL"],
        [10, "X"],
        [9, "IX"],
        [5, "V"],
        [4, "IV"],
        [1, "I"],
    ];
    let r = "";
    let n = y;
    for (const [v, s] of map) {
        while (n >= v) {
            r += s;
            n -= v;
        }
    }
    return r;
}

function formatDateEyebrow(date: Date): string {
    return `${DAYS[date.getDay()]} · ${MONTHS[date.getMonth()]} ${date.getDate()} · ${romanYear(date.getFullYear())}`;
}

// The clock is read after mount. Reading it during render made the server (UTC)
// and a Mountain-time browser disagree for half of every day, which React 19
// reports as a hydration error and re-renders with a visible text flip.
function useLocalClock(): LocalClock | null {
    const [clock, setClock] = useState<LocalClock | null>(null);
    useEffect(() => {
        const now = new Date();
        setClock({ timeOfDay: timeOfDayFor(now), dateEyebrow: formatDateEyebrow(now) });
    }, []);
    return clock;
}

interface GreetingProps {
    auth: AuthState;
    isLoading: boolean;
    campgroundsWithOpenings: number;
}

export function Greeting({ auth, isLoading, campgroundsWithOpenings }: GreetingProps) {
    const userName = auth.user?.name?.split(" ")[0] ?? "there";
    const clock = useLocalClock();
    const salutation = clock ? `GOOD ${clock.timeOfDay.toUpperCase()},` : "HELLO,";

    return (
        <section className="px-[22px] md:px-9 pt-10 pb-2 relative">
            <div
                className="font-mono-field text-[13px] font-medium leading-none tracking-[0.18em] text-cw-clay mb-[14px] uppercase min-h-[13px]"
                suppressHydrationWarning
            >
                {clock?.dateEyebrow ?? " "}
            </div>
            <h1 className="m-0 mb-[14px] tracking-[-0.005em]">
                <span className="font-poster text-[38px] md:text-[56px] font-black leading-[0.95] uppercase inline">
                    {salutation}
                </span>
                <span className="font-italic-serif text-[38px] md:text-[56px] font-medium italic leading-[0.95] text-cw-forest ml-[14px] tracking-[-0.01em]">
                    {userName}.
                </span>
            </h1>
            <StatusSentence isLoading={isLoading} campgroundsWithOpenings={campgroundsWithOpenings} />
        </section>
    );
}
