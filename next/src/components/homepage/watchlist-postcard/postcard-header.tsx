"use client";

import { C, FI, FM } from "@/components/field-notes/tokens";
import { DStamp } from "@/components/field-notes/decorations";

export function PostcardHeader() {
    return (
        <div
            style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                borderBottom: "1px dashed rgba(26,22,20,0.18)",
                paddingBottom: 14,
                marginBottom: 16,
                gap: 16,
            }}
        >
            <div>
                <div
                    style={{
                        font: `700 10px/1 ${FM}`,
                        letterSpacing: "0.24em",
                        textTransform: "uppercase",
                        color: C.clay,
                    }}
                >
                    Your Watchlist · Spring &apos;26
                </div>
                <div
                    style={{
                        font: `500 italic 24px/1 ${FI}`,
                        color: C.ink,
                        marginTop: 8,
                    }}
                >
                    4 campgrounds · 18 weeks ahead
                </div>
            </div>
            <DStamp />
        </div>
    );
}
