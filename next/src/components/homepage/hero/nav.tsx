"use client";

import { NavLogo } from "./nav-logo";
import type { AuthState } from "@/hooks/use-auth";

interface NavProps {
    auth: AuthState;
    isMobile: boolean;
}

export function Nav({ auth, isMobile }: NavProps) {
    return (
        <div className="relative flex items-center justify-between py-[14px] px-[22px] md:py-6 md:px-14 z-[3]">
            <NavLogo />
            <nav className="flex gap-7 items-center font-mono-field text-[12px] font-semibold leading-none tracking-[0.14em] uppercase text-cw-cream">
                {!isMobile && (
                    <>
                        <a href={auth.user ? "/app" : "/discover"} className="text-inherit no-underline">
                            Dashboard
                        </a>
                        <a href="#faq" className="text-inherit no-underline opacity-75">
                            Field Notes
                        </a>
                        <span className="w-px h-[14px] bg-[rgba(251,246,234,0.3)]" />
                    </>
                )}
                {auth.isLoading ? null : auth.user ? (
                    <a href="/app/account" aria-label="Account" className="no-underline">
                        <div className="w-7 h-7 rounded-[14px] bg-cw-clay text-cw-cream flex items-center justify-center font-mono-field text-[11px] font-bold">
                            {auth.user.name?.[0]?.toUpperCase() ?? "?"}
                        </div>
                    </a>
                ) : (
                    <a
                        href="/auth/google/start?returnTo=/app"
                        className="text-inherit no-underline border border-[rgba(251,246,234,0.6)] py-[6px] px-[10px] rounded-[2px]"
                    >
                        Sign in
                    </a>
                )}
            </nav>
        </div>
    );
}
