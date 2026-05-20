"use client";

import { CW } from "@/components/field-notes/cw-tokens";
import { FI } from "@/components/field-notes/tokens";

export function Legend() {
    return (
        <div style={{ marginLeft: "auto", display: "flex", gap: 14, alignItems: "center", font: `400 italic 13px/1 ${FI}`, color: CW.inkSoft }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 8, height: 8, background: CW.forest, borderRadius: 2 }} />open
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 8, height: 8, background: CW.inkFaint, borderRadius: 2 }} />booked
            </span>
        </div>
    );
}
