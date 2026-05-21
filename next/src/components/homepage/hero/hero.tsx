"use client";

import { DScene } from "@/components/field-notes/decorations";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useStats } from "@/contexts/stats-context";
import { Nav } from "./nav";
import { Headline } from "./headline";
import { Paragraph } from "./paragraph";
import { CtaButtons } from "./cta-buttons";
import { BulletinCard } from "./bulletin-card";
import type { AuthState } from "@/hooks/use-auth";

interface HeroProps {
    auth: AuthState;
}

export function Hero({ auth }: HeroProps) {
    const isMobile = useIsMobile();
    const { stats, nowMs } = useStats();

    return (
        <section className="relative overflow-hidden min-h-[760px] md:min-h-[980px]">
            <DScene />
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background:
                        "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0) 30%, rgba(20,15,12,0.35) 95%)",
                }}
            />

            <Nav auth={auth} isMobile={isMobile} />

            {/* Hero content */}
            <div className="relative md:absolute md:inset-0 z-[2] pt-10 pb-9 px-[22px] md:p-0 md:px-14 block md:grid md:grid-cols-[1fr_360px] md:gap-14 md:items-center">
                <div>
                    <Headline />
                    <Paragraph />
                    <CtaButtons auth={auth} />
                </div>

                {/* Pinned bulletin card — desktop only */}
                {!isMobile && <BulletinCard lastPollAt={stats?.lastPollAt} nowMs={nowMs} />}
            </div>
        </section>
    );
}
