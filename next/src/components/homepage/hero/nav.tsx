"use client";

import React from "react";
import { C, FM, PAD_M } from "@/components/field-notes/tokens";
import { NavLogo } from "./nav-logo";
import type { AuthState } from "@/hooks/use-auth";

interface NavProps {
    auth: AuthState;
    isMobile: boolean;
}

export function Nav({ auth, isMobile }: NavProps) {
    const navLinkStyle: React.CSSProperties = {
        color: "inherit",
        textDecoration: "none",
    };

    const navAvatarStyle: React.CSSProperties = {
        width: 28,
        height: 28,
        borderRadius: 14,
        background: C.clay,
        color: C.cream,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        font: `700 11px ${FM}`,
    };

    return (
        <div
            style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: isMobile ? `14px ${PAD_M}px` : "24px 56px",
                zIndex: 3,
            }}
        >
            <NavLogo />
            <nav
                style={{
                    display: "flex",
                    gap: 28,
                    alignItems: "center",
                    font: `600 12px/1 ${FM}`,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: C.cream,
                }}
            >
                {!isMobile && (
                    <>
                        <a href={auth.user ? "/app" : "/discover"} style={navLinkStyle}>
                            Dashboard
                        </a>
                        <a href="#faq" style={{ ...navLinkStyle, opacity: 0.75 }}>
                            Field Notes
                        </a>
                        <span style={{ width: 1, height: 14, background: "rgba(251,246,234,0.3)" }} />
                    </>
                )}
                {auth.isLoading ? null : auth.user ? (
                    <a href="/app/account" aria-label="Account" style={{ textDecoration: "none" }}>
                        <div style={navAvatarStyle}>{auth.user.name?.[0]?.toUpperCase() ?? "?"}</div>
                    </a>
                ) : (
                    <a
                        href="/auth/google/start?returnTo=/app"
                        style={{
                            ...navLinkStyle,
                            border: "1px solid rgba(251,246,234,0.6)",
                            padding: "6px 10px",
                            borderRadius: 2,
                        }}
                    >
                        Sign in
                    </a>
                )}
            </nav>
        </div>
    );
}
