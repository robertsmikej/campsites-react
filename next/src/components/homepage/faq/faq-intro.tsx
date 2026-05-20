"use client";

import { C, FH, FI, FM } from "@/components/field-notes/tokens";

interface FaqIntroProps {
    isMobile: boolean;
}

export function FaqIntro({ isMobile }: FaqIntroProps) {
    return (
        <div>
            <div
                style={{
                    font: `500 11px/1 ${FM}`,
                    letterSpacing: "0.18em",
                    color: C.mustard,
                    marginBottom: 10,
                }}
            >
                COMMON QUESTIONS
            </div>
            <h2 style={{ margin: 0, letterSpacing: "-0.005em" }}>
                <span
                    style={{
                        font: `900 ${isMobile ? 44 : 52}px/0.95 ${FH}`,
                        textTransform: "uppercase",
                        display: "block",
                    }}
                >
                    THINGS PEOPLE
                </span>
                <span
                    style={{
                        font: `500 italic ${isMobile ? 36 : 44}px/1 ${FI}`,
                        display: "block",
                        color: "#f6c79c",
                        marginTop: 6,
                        letterSpacing: "-0.01em",
                    }}
                >
                    ask, mostly around dusk.
                </span>
            </h2>
        </div>
    );
}
