"use client";

import { C, FI, FB, FM } from "@/components/field-notes/tokens";
import { DBars } from "@/components/field-notes/decorations";

interface PostcardRowProps {
    name: string;
    loc: string;
    pattern: string;
    tag: string;
    tagColor: string;
    isLast: boolean;
    isMobile: boolean;
}

export function PostcardRow({ name, loc, pattern, tag, tagColor, isLast, isMobile }: PostcardRowProps) {
    const isWatching = tagColor === "rgba(26,22,20,0.5)";

    const tagStyle = {
        font: `600 ${isMobile ? "10px" : "11px"}/1 ${FM}`,
        letterSpacing: isMobile ? "0.06em" : "0.08em",
        textTransform: "uppercase" as const,
        color: isWatching ? tagColor : "#fff",
        background: isWatching ? "transparent" : tagColor,
        padding: isMobile ? "5px 8px" : "6px 10px",
        borderRadius: 999,
        border: isWatching ? `1px solid ${tagColor}` : "none",
        flexShrink: 0 as const,
        justifySelf: isMobile ? undefined : ("end" as const),
    };

    return (
        <div
            style={{
                padding: "12px 0",
                borderBottom: isLast ? "none" : "1px dotted rgba(26,22,20,0.16)",
            }}
        >
            {isMobile ? (
                <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ font: `500 italic 20px/1.1 ${FI}`, color: C.ink }}>{name}</div>
                            <div style={{ font: `400 12px/1.2 ${FB}`, color: C.inkSoft, marginTop: 3 }}>{loc}</div>
                        </div>
                        <span style={tagStyle}>{tag}</span>
                    </div>
                    <div style={{ marginTop: 10 }}><DBars pattern={pattern} /></div>
                </>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px", gap: 12, alignItems: "center" }}>
                    <div>
                        <div style={{ font: `500 italic 22px/1.1 ${FI}`, color: C.ink }}>{name}</div>
                        <div style={{ font: `400 12px/1.2 ${FB}`, color: C.inkSoft, marginTop: 3 }}>{loc}</div>
                    </div>
                    <DBars pattern={pattern} />
                    <span style={tagStyle}>{tag}</span>
                </div>
            )}
        </div>
    );
}
