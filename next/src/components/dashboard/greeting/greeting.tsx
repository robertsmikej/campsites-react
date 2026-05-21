"use client";

import { StatusSentence } from "./status-sentence";
import type { AuthState } from "@/hooks/use-auth";

function getTimeOfDay(): "morning" | "afternoon" | "evening" {
    const h = new Date().getHours();
    if (h < 12) return "morning";
    if (h < 18) return "afternoon";
    return "evening";
}

function romanYear(y: number): string {
    const map: [number, string][] = [
        [1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],
        [50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"],
    ];
    let r = "";
    let n = y;
    for (const [v, s] of map) { while (n >= v) { r += s; n -= v; } }
    return r;
}

function formatDateEyebrow(): string {
    const now = new Date();
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${days[now.getDay()]} · ${months[now.getMonth()]} ${now.getDate()} · ${romanYear(now.getFullYear())}`;
}

interface GreetingProps {
    auth: AuthState;
    isLoading: boolean;
    campgroundsWithOpenings: number;
}

export function Greeting({ auth, isLoading, campgroundsWithOpenings }: GreetingProps) {
    const userName = auth.user?.name?.split(" ")[0] ?? "there";

    return (
        <section className="px-[22px] md:px-9 pt-10 pb-2 relative">
            <div className="font-mono-field text-[11px] font-medium leading-none tracking-[0.18em] text-cw-clay mb-[14px] uppercase">
                {formatDateEyebrow()}
            </div>
            <h1 className="m-0 mb-[14px] tracking-[-0.005em]">
                <span className="font-poster text-[38px] md:text-[56px] font-black leading-[0.95] uppercase inline">
                    GOOD {getTimeOfDay().toUpperCase()},
                </span>
                <span className="font-italic-serif text-[38px] md:text-[56px] font-medium italic leading-[0.95] text-cw-forest ml-[14px] tracking-[-0.01em]">
                    {userName}.
                </span>
            </h1>
            <StatusSentence isLoading={isLoading} campgroundsWithOpenings={campgroundsWithOpenings} />
        </section>
    );
}
