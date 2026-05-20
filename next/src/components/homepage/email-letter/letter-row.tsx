"use client";

import { C, FI, FB, FM } from "@/components/field-notes/tokens";

interface LetterRowProps {
    name: string;
    date: string;
    tag: string;
}

export function LetterRow({ name, date, tag }: LetterRowProps) {
    return (
        <div style={{ padding: "12px 0", borderTop: `1px dashed ${C.rule}` }}>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                }}
            >
                <div style={{ font: `600 16px/1.2 ${FB}` }}>{name}</div>
                <span
                    style={{
                        font: `700 9px/1 ${FM}`,
                        letterSpacing: "0.16em",
                        color: C.clay,
                        border: `1px solid ${C.clay}`,
                        padding: "3px 6px",
                    }}
                >
                    {tag}
                </span>
            </div>
            <div
                style={{
                    font: `500 italic 14px/1.4 ${FI}`,
                    color: C.inkSoft,
                    marginTop: 4,
                }}
            >
                {date}
            </div>
            <a
                style={{
                    font: `600 13px/1 ${FB}`,
                    color: C.forest,
                    textDecoration: "underline",
                    marginTop: 6,
                    display: "inline-block",
                }}
            >
                Book on recreation.gov →
            </a>
        </div>
    );
}
