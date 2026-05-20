"use client";

import { PAD_M } from "@/components/field-notes/tokens";
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
        <section style={{ position: "relative", minHeight: isMobile ? 760 : 980, overflow: "hidden" }}>
            <DScene />
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    background:
                        "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0) 30%, rgba(20,15,12,0.35) 95%)",
                    pointerEvents: "none",
                }}
            />

            <Nav auth={auth} isMobile={isMobile} />

            {/* Hero content */}
            <div
                style={{
                    position: isMobile ? "relative" : "absolute",
                    inset: isMobile ? undefined : 0,
                    padding: isMobile ? `40px ${PAD_M}px 36px` : "0 56px",
                    zIndex: 2,
                    display: isMobile ? "block" : "grid",
                    gridTemplateColumns: isMobile ? undefined : "1fr 360px",
                    gap: isMobile ? undefined : 56,
                    alignItems: isMobile ? undefined : "center",
                }}
            >
                <div>
                    <Headline isMobile={isMobile} />
                    <Paragraph isMobile={isMobile} />
                    <CtaButtons auth={auth} isMobile={isMobile} />
                </div>

                {/* Pinned bulletin card — desktop only */}
                {!isMobile && (
                    <BulletinCard lastPollAt={stats?.lastPollAt} nowMs={nowMs} />
                )}
            </div>
        </section>
    );
}
