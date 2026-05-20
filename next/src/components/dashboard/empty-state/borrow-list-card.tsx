"use client";

import { CW } from "@/components/field-notes/cw-tokens";
import { FH, FI, FB, FM } from "@/components/field-notes/tokens";

interface BorrowListCardProps {
    onClone: () => Promise<void>;
    busy: boolean;
}

export function BorrowListCard({ onClone, busy }: BorrowListCardProps) {
    return (
        <article style={{ background: CW.cream, border: `1px solid ${CW.rule}`, padding: "24px 26px" }}>
            <div style={{ font: `700 10px/1 ${FM}`, letterSpacing: "0.18em", color: CW.clay, marginBottom: 10, textTransform: "uppercase" }}>
                Option 02
            </div>
            <h2 style={{ margin: "0 0 14px" }}>
                <span style={{ font: `900 22px/1.1 ${FH}`, textTransform: "uppercase", display: "block" }}>BORROW A LIST</span>
                <span style={{ font: `500 italic 22px/1.1 ${FI}`, color: CW.forest, display: "block", marginTop: 2 }}>from the curator.</span>
            </h2>
            <p style={{ font: `400 14px/1.5 ${FB}`, color: CW.inkSoft, margin: "0 0 14px" }}>
                Start with <strong style={{ color: CW.ink }}>hand-picked campgrounds</strong> across Sawtooth, Glacier, Yosemite, and Olympic. Edit or remove any of them later.
            </p>
            <button
                onClick={() => void onClone()}
                disabled={busy}
                style={{ font: `800 12px/1 ${FH}`, letterSpacing: "0.14em", textTransform: "uppercase", background: "transparent", color: CW.ink, border: `1.5px solid ${CW.ink}`, padding: "12px 16px", cursor: busy ? "not-allowed" : "pointer", borderRadius: 2, opacity: busy ? 0.6 : 1 }}
            >
                {busy ? "Loading…" : "Use the curator's picks"}
            </button>
        </article>
    );
}
