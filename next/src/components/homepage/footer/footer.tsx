"use client";

import { C, PAD_M } from "@/components/field-notes/tokens";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { HorizonSvg } from "./horizon-svg";
import { Wordmark } from "./wordmark";
import { ContactBlock } from "./contact-block";

export function Footer() {
    const isMobile = useIsMobile();

    return (
        <footer
            style={{
                background: C.waterDeep,
                color: C.cream,
                padding: isMobile ? `48px ${PAD_M}px 32px` : "64px 56px 40px",
                position: "relative",
                overflow: "hidden",
            }}
        >
            <HorizonSvg />
            <div
                style={{
                    position: "relative",
                    marginTop: 60,
                    display: isMobile ? "block" : "flex",
                    justifyContent: isMobile ? undefined : "space-between",
                    alignItems: isMobile ? undefined : "flex-end",
                }}
            >
                <Wordmark isMobile={isMobile} />
                <ContactBlock isMobile={isMobile} />
            </div>
        </footer>
    );
}
