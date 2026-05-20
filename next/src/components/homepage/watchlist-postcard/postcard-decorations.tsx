"use client";

import { DPostmark } from "@/components/field-notes/decorations";

interface PostcardDecorationsProps {
    isMobile: boolean;
}

export function PostcardDecorations({ isMobile }: PostcardDecorationsProps) {
    return (
        <>
            {/* Postmark over the corner — desktop only */}
            {!isMobile && (
                <div className="absolute top-[-36px] right-[-28px] rotate-[14deg] opacity-[0.92]">
                    <DPostmark />
                </div>
            )}

            {/* Handwritten note */}
            {isMobile ? (
                <div className="mt-[18px] text-center font-hand text-[20px] leading-[1.2] text-cw-clay -rotate-[1deg] font-semibold italic">
                    wish you were here —{" "}
                    <span className="text-[18px] text-cw-ink-soft">your watchlist is.</span>
                </div>
            ) : (
                <div className="absolute bottom-[-58px] left-[-32px] -rotate-[4deg] font-hand text-[22px] leading-[1.2] text-cw-clay max-w-[240px] font-semibold italic">
                    wish you were here —<br />
                    <span className="text-[18px] text-cw-ink-soft">your watchlist is.</span>
                </div>
            )}
        </>
    );
}
