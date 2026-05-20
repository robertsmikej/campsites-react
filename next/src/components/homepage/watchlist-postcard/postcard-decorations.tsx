"use client";

import { C, FN } from "@/components/field-notes/tokens";
import { DPostmark } from "@/components/field-notes/decorations";

interface PostcardDecorationsProps {
    isMobile: boolean;
}

export function PostcardDecorations({ isMobile }: PostcardDecorationsProps) {
    return (
        <>
            {/* Postmark over the corner — desktop only */}
            {!isMobile && (
                <div
                    style={{
                        position: "absolute",
                        top: -36,
                        right: -28,
                        transform: "rotate(14deg)",
                        opacity: 0.92,
                    }}
                >
                    <DPostmark />
                </div>
            )}

            {/* Handwritten note */}
            <div
                style={isMobile ? {
                    marginTop: 18,
                    textAlign: "center",
                    font: `600 20px/1.2 ${FN}`,
                    color: C.clay,
                    transform: "rotate(-1deg)",
                } : {
                    position: "absolute",
                    bottom: -58,
                    left: -32,
                    transform: "rotate(-4deg)",
                    font: `600 22px/1.2 ${FN}`,
                    color: C.clay,
                    maxWidth: 240,
                }}
            >
                wish you were here —{isMobile ? " " : <br />}
                <span style={{ fontSize: 18, color: C.inkSoft }}>your watchlist is.</span>
            </div>
        </>
    );
}
