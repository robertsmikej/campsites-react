"use client";

import { DTopo } from "@/components/field-notes/decorations";
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
    return (
        <section className="relative py-[60px] px-[22px] md:py-[88px] md:px-14 bg-cw-cream border-t-[1.5px] border-b-[1.5px] border-cw-ink">
            <DTopo opacity={0.06} />
            <div className="relative grid grid-cols-1 md:grid-cols-[260px_1fr] gap-7 md:gap-16 items-start">
                <Intro />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
                    {STEPS.map((step) => (
                        <StepColumn key={step.num} {...step} />
                    ))}
                </div>
            </div>
        </section>
    );
}
