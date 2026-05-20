"use client";

import { C, FH, FI, FB, FM, FN } from "@/components/field-notes/tokens";
import { DBadge } from "@/components/field-notes/decorations";

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
                DISPATCH
            </div>
            <h2 style={{ margin: "0 0 24px", letterSpacing: "-0.005em" }}>
                <span
                    style={{
                        font: `900 ${isMobile ? 44 : 56}px/0.95 ${FH}`,
                        textTransform: "uppercase",
                        display: "block",
                    }}
                >
                    THE WHOLE PRODUCT
                </span>
                <span
                    style={{
                        font: `500 italic ${isMobile ? 38 : 56}px/1 ${FI}`,
                        color: C.forest,
                        display: "block",
                        marginTop: 4,
                        letterSpacing: "-0.01em",
                    }}
                >
                    fits in an email.
                </span>
            </h2>
            <p
                style={{
                    font: `400 17px/1.6 ${FB}`,
                    color: C.inkSoft,
                    maxWidth: 460,
                    margin: "0 0 24px",
                }}
            >
                No app to open. No notifications to manage. One short, well-written note when a site
                you&apos;d actually take opens up — direct link, two-sentence body, one-click unsubscribe.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <DBadge color={C.forest}>Direct Booking Link</DBadge>
                <DBadge color={C.forest}>One-click Unsubscribe</DBadge>
                <DBadge color={C.forest}>Plain Text · No Tracking</DBadge>
            </div>
            <div
                style={{
                    font: `600 italic 22px/1.3 ${FN}`,
                    color: C.clay,
                    marginTop: 28,
                }}
            >
                &ldquo;faster than your refresh tab.&rdquo;
            </div>
        </div>
    );
}
