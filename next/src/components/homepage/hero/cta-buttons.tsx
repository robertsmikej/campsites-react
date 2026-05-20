"use client";

import { C } from "@/components/field-notes/tokens";
import type { AuthState } from "@/hooks/use-auth";

interface CtaButtonsProps {
    auth: AuthState;
}

export function CtaButtons({ auth }: CtaButtonsProps) {
    return (
        <div className="grid md:flex gap-[10px] md:gap-[14px] md:items-center">
            {auth.isLoading ? (
                <>
                    <div className="md:w-[200px] h-12 bg-[rgba(251,246,234,0.15)] rounded-[2px]" />
                    <div className="md:w-[160px] h-12 bg-[rgba(251,246,234,0.08)] rounded-[2px] border-[1.5px] border-[rgba(251,246,234,0.3)]" />
                </>
            ) : (
                <>
                    <a
                        href={auth.user ? "/app" : "/auth/google/start?returnTo=/app"}
                        className="font-poster text-[13px] leading-none tracking-[0.14em] uppercase bg-cw-cream text-cw-ink py-4 px-[22px] no-underline flex md:inline-flex items-center justify-center md:justify-start w-full md:w-auto gap-[10px] rounded-[2px] box-border font-extrabold"
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
                    <a
                        href="/discover"
                        className="md:hidden font-poster text-[13px] leading-none tracking-[0.14em] uppercase text-cw-cream py-4 px-5 no-underline border-[1.5px] border-[rgba(251,246,234,0.6)] rounded-[2px] flex items-center justify-center font-extrabold"
                    >
                        Browse the Picks
                    </a>
                </>
            )}
        </div>
    );
}
