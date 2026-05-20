"use client";

import { FB } from "@/components/field-notes/tokens";

interface ParagraphProps {
    isMobile: boolean;
}

export function Paragraph({ isMobile }: ParagraphProps) {
    return (
        <p
            style={{
                font: `400 ${isMobile ? 15.5 : 18}px/1.55 ${FB}`,
                color: "rgba(251,246,234,0.92)",
                maxWidth: isMobile ? undefined : 540,
                margin: isMobile ? "0 0 22px" : "0 0 32px",
            }}
        >
            Recreation.gov sells out in minutes. CampWatch watches the sites you actually want, every five
            minutes, and emails you the second one opens. No app, no notifications to babysit.
        </p>
    );
}
