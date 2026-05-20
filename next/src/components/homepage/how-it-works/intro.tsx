"use client";

import { C, FH, FI, FM } from "@/components/field-notes/tokens";

interface IntroProps {
    isMobile: boolean;
}

export function Intro({ isMobile }: IntroProps) {
    return (
        <div>
            <div
                style={{
                    font: `500 11px/1 ${FM}`,
                    letterSpacing: "0.18em",
                    color: C.clay,
                    marginBottom: 10,
                }}
            >
                METHOD
            </div>
            <h2 style={{ margin: 0, letterSpacing: "-0.005em" }}>
                <span
                    style={{
                        font: `900 ${isMobile ? 44 : 56}px/0.95 ${FH}`,
                        textTransform: "uppercase",
                        display: "block",
                    }}
                >
                    THREE SMALL THINGS,
                </span>
                <span
                    style={{
                        font: `500 italic ${isMobile ? 34 : 44}px/1 ${FI}`,
                        color: C.forest,
                        display: "block",
                        marginTop: 4,
                        letterSpacing: "-0.01em",
                    }}
                >
                    then a quiet inbox.
                </span>
            </h2>
            <p
                style={{
                    font: `400 italic 15px/1.5 ${FI}`,
                    color: C.inkSoft,
                    marginTop: 20,
                    maxWidth: isMobile ? undefined : 240,
                }}
            >
                Set it up once, in about a minute. Ignore us forever until summer.
            </p>
        </div>
    );
}
