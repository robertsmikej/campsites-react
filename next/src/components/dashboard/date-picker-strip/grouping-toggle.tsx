"use client";

import { CW } from "@/components/field-notes/cw-tokens";
import { FM } from "@/components/field-notes/tokens";

type GroupBy = "region" | "status" | "all";

interface GroupingToggleProps {
    groupBy: GroupBy;
    onGroupBy: (v: GroupBy) => void;
    isMobile: boolean;
}

export function GroupingToggle({ groupBy, onGroupBy, isMobile }: GroupingToggleProps) {
    return (
        <div style={{ display: "inline-flex", border: `1px solid ${CW.ink}`, borderRadius: 2, overflow: "hidden" }}>
            {(["region", "status", "all"] as const).map((v, i) => (
                <button
                    key={v}
                    onClick={() => onGroupBy(v)}
                    style={{
                        font: `700 ${isMobile ? 10 : 11}px/1 ${FM}`, letterSpacing: "0.12em", textTransform: "uppercase",
                        background: groupBy === v ? CW.ink : "transparent",
                        color: groupBy === v ? CW.cream : CW.ink,
                        border: "none",
                        borderLeft: i === 0 ? "none" : `1px solid ${CW.rule}`,
                        padding: isMobile ? "8px 10px" : "9px 12px", cursor: "pointer",
                    }}
                >
                    {v === "region" ? "By Region" : v === "status" ? "By Status" : "All"}
                </button>
            ))}
        </div>
    );
}
