"use client";

import { formatTimeAgo } from "@/components/field-notes/format-time-ago";

interface PostcardFooterProps {
    lastPollAt: string | undefined;
    nowMs: number;
}

export function PostcardFooter({ lastPollAt, nowMs }: PostcardFooterProps) {
    return (
        <div className="mt-3 pt-3 border-t border-dashed border-[rgba(26,22,20,0.18)] flex justify-between items-center">
            <span className="font-italic-serif text-[15px] leading-none text-cw-clay font-medium italic">
                {lastPollAt
                    ? `Last poll · ${formatTimeAgo(nowMs - new Date(lastPollAt).getTime())} ago. All quiet.`
                    : "Polling resumes shortly."}
            </span>
            <span className="font-mono-field text-[11px] leading-none text-cw-ink-soft tracking-[0.14em] uppercase font-medium">
                signed N.L.
            </span>
        </div>
    );
}
