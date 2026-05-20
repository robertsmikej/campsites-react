"use client";

import { CW } from "@/components/field-notes/cw-tokens";
import { FB } from "@/components/field-notes/tokens";

// ─── Pulse dot ───────────────────────────────────────────────────────────────
function Pulse({ color, size = 7 }: { color: string; size?: number }) {
    return (
        <span style={{ position: "relative", display: "inline-block", width: size, height: size, flexShrink: 0 }}>
            <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color }} />
            <span style={{ position: "absolute", inset: -3, borderRadius: "50%", border: `1px solid ${color}`, opacity: 0.4, animation: "cw-pulse 1.8s ease-out infinite" }} />
        </span>
    );
}

interface StatusSentenceProps {
    isLoading: boolean;
    campgroundsWithOpenings: number;
    isMobile: boolean;
}

export function StatusSentence({ isLoading, campgroundsWithOpenings, isMobile }: StatusSentenceProps) {
    return (
        <p style={{ font: `400 ${isMobile ? 14 : 18}px/1.5 ${FB}`, color: CW.inkSoft, margin: "0 0 6px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Pulse color={CW.forest} size={7} />
            {isLoading
                ? "Checking your campgrounds…"
                : campgroundsWithOpenings > 0
                    ? <><strong style={{ color: CW.ink }}>{campgroundsWithOpenings} campground{campgroundsWithOpenings !== 1 ? "s" : ""}</strong>&nbsp;have bookable sites for your dates.</>
                    : "No bookable sites found in your date window — we're still watching."}
        </p>
    );
}
