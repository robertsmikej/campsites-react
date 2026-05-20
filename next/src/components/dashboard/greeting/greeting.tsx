"use client";

import { CW } from "@/components/field-notes/cw-tokens";
import { FH, FI, FM } from "@/components/field-notes/tokens";
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
    isMobile: boolean;
    isLoading: boolean;
    campgroundsWithOpenings: number;
    PAD: number;
}

export function Greeting({ auth, isMobile, isLoading, campgroundsWithOpenings, PAD }: GreetingProps) {
    const userName = auth.user?.name?.split(" ")[0] ?? "there";

    return (
        <section style={{ padding: `40px ${PAD}px 8px`, position: "relative" }}>
            <div style={{ font: `500 11px/1 ${FM}`, letterSpacing: "0.18em", color: CW.clay, marginBottom: 14, textTransform: "uppercase" }}>
                {formatDateEyebrow()}
            </div>
            <h1 style={{ margin: "0 0 14px", letterSpacing: "-0.005em" }}>
                <span style={{ font: `900 ${isMobile ? 38 : 56}px/0.95 ${FH}`, textTransform: "uppercase", display: "inline" }}>
                    GOOD {getTimeOfDay().toUpperCase()},
                </span>
                <span style={{ font: `500 italic ${isMobile ? 38 : 56}px/0.95 ${FI}`, color: CW.forest, marginLeft: 14, letterSpacing: "-0.01em" }}>
                    {userName}.
                </span>
            </h1>
            <StatusSentence isLoading={isLoading} campgroundsWithOpenings={campgroundsWithOpenings} isMobile={isMobile} />
        </section>
    );
}
