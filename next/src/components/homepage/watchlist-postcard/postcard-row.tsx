"use client";

import { C } from "@/components/field-notes/tokens";
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

    const tagStyle: React.CSSProperties = {
        fontSize: isMobile ? "10px" : "11px",
        letterSpacing: isMobile ? "0.06em" : "0.08em",
        color: isWatching ? tagColor : "#fff",
        background: isWatching ? "transparent" : tagColor,
        padding: isMobile ? "5px 8px" : "6px 10px",
        border: isWatching ? `1px solid ${tagColor}` : "none",
    };

    return (
        <div
            className={`py-3 ${isLast ? "" : "border-b border-dotted border-[rgba(26,22,20,0.16)]"}`}
        >
            {isMobile ? (
                <>
                    <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                            <div className="font-italic-serif text-[20px] leading-[1.1] text-cw-ink font-medium italic">{name}</div>
                            <div className="font-body-serif text-[12px] leading-[1.2] text-cw-ink-soft mt-[3px]">{loc}</div>
                        </div>
                        <span
                            className="font-mono-field leading-none uppercase rounded-full flex-shrink-0 font-semibold"
                            style={tagStyle}
                        >
                            {tag}
                        </span>
                    </div>
                    <div className="mt-[10px]"><DBars pattern={pattern} /></div>
                </>
            ) : (
                <div className="grid grid-cols-[1fr_1fr_90px] gap-3 items-center">
                    <div>
                        <div className="font-italic-serif text-[22px] leading-[1.1] text-cw-ink font-medium italic">{name}</div>
                        <div className="font-body-serif text-[12px] leading-[1.2] text-cw-ink-soft mt-[3px]">{loc}</div>
                    </div>
                    <DBars pattern={pattern} />
                    <span
                        className="font-mono-field leading-none uppercase rounded-full justify-self-end font-semibold"
                        style={tagStyle}
                    >
                        {tag}
                    </span>
                </div>
            )}
        </div>
    );
}
