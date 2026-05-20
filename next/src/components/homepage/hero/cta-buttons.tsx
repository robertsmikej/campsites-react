"use client";

import { C, FH } from "@/components/field-notes/tokens";
import type { AuthState } from "@/hooks/use-auth";

interface CtaButtonsProps {
    auth: AuthState;
    isMobile: boolean;
}

export function CtaButtons({ auth, isMobile }: CtaButtonsProps) {
    return (
        <div style={isMobile ? { display: "grid", gap: 10 } : { display: "flex", gap: 14, alignItems: "center" }}>
            {auth.isLoading ? (
                <>
                    <div
                        style={{
                            width: isMobile ? undefined : 200,
                            height: 48,
                            background: "rgba(251,246,234,0.15)",
                            borderRadius: 2,
                        }}
                    />
                    <div
                        style={{
                            width: isMobile ? undefined : 160,
                            height: 48,
                            background: "rgba(251,246,234,0.08)",
                            borderRadius: 2,
                            border: "1.5px solid rgba(251,246,234,0.3)",
                        }}
                    />
                </>
            ) : (
                <>
                    <a
                        href={auth.user ? "/app" : "/auth/google/start?returnTo=/app"}
                        style={{
                            font: `800 13px/1 ${FH}`,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            background: C.cream,
                            color: C.ink,
                            padding: "16px 22px",
                            textDecoration: "none",
                            display: isMobile ? "flex" : "inline-flex",
                            alignItems: "center",
                            justifyContent: isMobile ? "center" : undefined,
                            width: isMobile ? "100%" : undefined,
                            gap: 10,
                            borderRadius: 2,
                            boxSizing: isMobile ? "border-box" : undefined,
                        }}
                    >
                        {auth.user ? "Open the Dashboard" : "Sign in with Google"}
                        <svg width="14" height="14" viewBox="0 0 14 14">
                            <path
                                d="M1 7 L13 7 M8 2 L13 7 L8 12"
                                stroke={C.ink}
                                strokeWidth="1.8"
                                fill="none"
                            />
                        </svg>
                    </a>
                    {isMobile && (
                        <a
                            href="/discover"
                            style={{
                                font: `800 13px/1 ${FH}`,
                                letterSpacing: "0.14em",
                                textTransform: "uppercase",
                                color: C.cream,
                                padding: "16px 20px",
                                textDecoration: "none",
                                border: "1.5px solid rgba(251,246,234,0.6)",
                                borderRadius: 2,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            Browse the Picks
                        </a>
                    )}
                </>
            )}
        </div>
    );
}
