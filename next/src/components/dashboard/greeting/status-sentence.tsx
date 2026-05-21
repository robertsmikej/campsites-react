"use client";

import { CW } from "@/components/field-notes/cw-tokens";

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
}

export function StatusSentence({ isLoading, campgroundsWithOpenings }: StatusSentenceProps) {
    return (
        <p className="font-body-serif text-[14px] md:text-[18px] leading-[1.5] text-cw-ink-soft m-0 mb-[6px] flex items-center gap-3 flex-wrap">
            <Pulse color={CW.forest} size={7} />
            {isLoading
                ? "Checking your campgrounds…"
                : campgroundsWithOpenings > 0
                    ? <><strong className="text-cw-ink">{campgroundsWithOpenings} campground{campgroundsWithOpenings !== 1 ? "s" : ""}</strong>&nbsp;have bookable sites for your dates.</>
                    : "No bookable sites found in your date window — we're still watching."}
        </p>
    );
}
