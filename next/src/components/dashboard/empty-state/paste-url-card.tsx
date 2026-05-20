"use client";

import { CW } from "@/components/field-notes/cw-tokens";
import { FH, FI, FM } from "@/components/field-notes/tokens";

interface PasteUrlCardProps {
    onShowLookup: () => void;
}

export function PasteUrlCard({ onShowLookup }: PasteUrlCardProps) {
    return (
        <article style={{ background: CW.cream, border: `1.5px solid ${CW.ink}`, boxShadow: `6px 6px 0 ${CW.forest}`, padding: "24px 26px" }}>
            <div style={{ font: `700 10px/1 ${FM}`, letterSpacing: "0.18em", color: CW.clay, marginBottom: 10, textTransform: "uppercase" }}>
                Option 01
            </div>
            <h2 style={{ margin: "0 0 14px" }}>
                <span style={{ font: `900 22px/1.1 ${FH}`, textTransform: "uppercase", display: "block" }}>PASTE A URL</span>
                <span style={{ font: `500 italic 22px/1.1 ${FI}`, color: CW.forest, display: "block", marginTop: 2 }}>from recreation.gov.</span>
            </h2>
            <button
                onClick={onShowLookup}
                style={{ font: `800 12px/1 ${FH}`, letterSpacing: "0.14em", textTransform: "uppercase", background: CW.forest, color: CW.cream, border: "none", padding: "13px 16px", cursor: "pointer", borderRadius: 2 }}
            >
                Look up a campground →
            </button>
        </article>
    );
}
