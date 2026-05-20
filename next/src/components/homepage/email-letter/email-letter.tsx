"use client";

import { PAD_M } from "@/components/field-notes/tokens";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { Intro } from "./intro";
import { LetterCard } from "./letter-card";
import type { AuthState } from "@/hooks/use-auth";

interface EmailLetterProps {
    auth: AuthState;
}

export function EmailLetter({ auth }: EmailLetterProps) {
    const isMobile = useIsMobile();

    return (
        <section style={{ padding: isMobile ? `60px ${PAD_M}px` : "96px 56px 80px", position: "relative" }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 28 : 72, alignItems: "center" }}>
                <Intro isMobile={isMobile} />
                <LetterCard auth={auth} isMobile={isMobile} />
            </div>
        </section>
    );
}
