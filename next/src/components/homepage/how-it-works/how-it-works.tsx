"use client";

import { C, PAD_M } from "@/components/field-notes/tokens";
import { DTopo } from "@/components/field-notes/decorations";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { Intro } from "./intro";
import { StepColumn } from "./step-column";

const STEPS = [
    {
        rn: "i.",
        num: "01",
        t: "Choose the places",
        d: "Paste any recreation.gov campground ID — or pick from our hand-curated site list. No limit; watch as many as you like.",
        ic: "pin" as const,
    },
    {
        rn: "ii.",
        num: "02",
        t: "Tell us your window",
        d: "Date ranges, minimum nights, weekday vs weekend. We only bother you about openings that actually fit.",
        ic: "cal" as const,
    },
    {
        rn: "iii.",
        num: "03",
        t: "Wait for mail",
        d: "A short, plain email — site, dates, link to book. Only when your sites come open. One-click unsubscribe whenever you've had enough.",
        ic: "mail" as const,
    },
] as const;

export function HowItWorks() {
    const isMobile = useIsMobile();

    return (
        <section
            style={{
                padding: isMobile ? `60px ${PAD_M}px` : "88px 56px",
                background: C.cream,
                borderTop: `1.5px solid ${C.ink}`,
                borderBottom: `1.5px solid ${C.ink}`,
                position: "relative",
            }}
        >
            <DTopo opacity={0.06} />
            <div
                style={{
                    position: "relative",
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "260px 1fr",
                    gap: isMobile ? 28 : 64,
                    alignItems: "flex-start",
                }}
            >
                <Intro isMobile={isMobile} />
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 28 }}>
                    {STEPS.map((step) => (
                        <StepColumn key={step.num} {...step} />
                    ))}
                </div>
            </div>
        </section>
    );
}
