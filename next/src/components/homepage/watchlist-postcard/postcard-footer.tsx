"use client";

import { C, FI, FM } from "@/components/field-notes/tokens";
import { formatTimeAgo } from "@/components/field-notes/format-time-ago";

interface PostcardFooterProps {
    lastPollAt: string | undefined;
    nowMs: number;
}

export function PostcardFooter({ lastPollAt, nowMs }: PostcardFooterProps) {
    return (
        <div
            style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: "1px dashed rgba(26,22,20,0.18)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
            }}
        >
            <span style={{ font: `500 italic 15px/1 ${FI}`, color: C.clay }}>
                {lastPollAt
                    ? `Last poll · ${formatTimeAgo(nowMs - new Date(lastPollAt).getTime())} ago. All quiet.`
                    : "Polling resumes shortly."}
            </span>
            <span
                style={{
                    font: `500 11px/1 ${FM}`,
                    color: C.inkSoft,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                }}
            >
                signed N.L.
            </span>
        </div>
    );
}
