"use client";

import { CW } from "@/components/field-notes/cw-tokens";
import { FI, FM } from "@/components/field-notes/tokens";

interface GroupHeaderProps {
    index: number;
    label: string;
    count: number;
    openInGroup: number;
}

export function GroupHeader({ index, label, count, openInGroup }: GroupHeaderProps) {
    return (
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
            <span style={{ font: `700 11px/1 ${FM}`, letterSpacing: "0.18em", color: CW.clay, textTransform: "uppercase" }}>
                {String(index + 1).padStart(2, "0")}
            </span>
            <span style={{ font: `500 italic 22px/1 ${FI}`, color: CW.ink, letterSpacing: "-0.005em" }}>
                {label}
            </span>
            <span style={{ font: `500 11px/1 ${FM}`, color: CW.inkSubtle, letterSpacing: "0.08em" }}>
                · {count} campground{count !== 1 ? "s" : ""}
            </span>
            {openInGroup > 0 && (
                <span style={{ font: `700 11px/1 ${FM}`, color: CW.forest, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    · {openInGroup} open
                </span>
            )}
            <div style={{ flex: 1, height: 1, background: CW.rule }} />
        </div>
    );
}
