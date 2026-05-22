"use client";

import { CW } from "@/components/field-notes/cw-tokens";

type GroupBy = "region" | "status" | "all";

interface GroupingToggleProps {
    groupBy: GroupBy;
    onGroupBy: (v: GroupBy) => void;
}

export function GroupingToggle({ groupBy, onGroupBy }: GroupingToggleProps) {
    return (
        <div className="inline-flex border border-cw-ink rounded-[2px] overflow-hidden">
            {(["region", "status", "all"] as const).map((v, i) => (
                <button
                    key={v}
                    onClick={() => onGroupBy(v)}
                    className="font-mono-field text-[12px] md:text-[13px] font-bold leading-none tracking-[0.12em] uppercase px-[10px] py-2 md:px-3 md:py-[9px] cursor-pointer"
                    style={{
                        background: groupBy === v ? CW.ink : "transparent",
                        color: groupBy === v ? CW.cream : CW.ink,
                        border: "none",
                        borderLeft: i === 0 ? "none" : `1px solid ${CW.rule}`,
                    }}
                >
                    {v === "region" ? "By Region" : v === "status" ? "By Status" : "All"}
                </button>
            ))}
        </div>
    );
}
