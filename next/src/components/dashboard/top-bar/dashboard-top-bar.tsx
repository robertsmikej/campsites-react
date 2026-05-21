"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProgressBarEl } from "@/components/progress-bar-el";
import { CW } from "@/components/field-notes/cw-tokens";
import type { AuthState } from "@/hooks/use-auth";

interface DashboardTopBarProps {
    auth: AuthState;
    onAddCampground: () => void;
}

interface NavLink {
    href: string;
    label: string;
    active: (pathname: string) => boolean;
}

const NAV_LINKS: NavLink[] = [
    { href: "/app", label: "Dashboard", active: (p) => p === "/app" || p === "/app/" },
    { href: "/discover", label: "Picks", active: (p) => p.startsWith("/discover") },
    { href: "/app/account", label: "Account", active: (p) => p.startsWith("/app/account") },
];

async function handleSignOut() {
    try {
        await fetch("/auth/logout", { method: "POST", credentials: "include" });
    } catch {
        // ignore
    }
    window.location.href = "/";
}

export function DashboardTopBar({ auth, onAddCampground }: DashboardTopBarProps) {
    const pathname = usePathname() ?? "/app";

    return (
        <>
            <header className="sticky top-0 z-30 backdrop-blur-md border-b border-cw-rule bg-[rgba(244,234,216,0.95)]">
                <div className="mx-auto w-full max-w-7xl flex items-center gap-[18px] px-9 py-4">
                    {/* Logo + wordmark */}
                    <Link
                        href={auth.user ? "/app" : "/"}
                        aria-label="CampWatch home"
                        className="flex items-center gap-3 no-underline shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                    >
                        <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
                            <path d="M16 4 L4 28 L28 28 Z" fill="none" stroke={CW.ink} strokeWidth="2" />
                            <path d="M16 12 L10 28 L22 28 Z" fill={CW.ink} />
                        </svg>
                        <span className="font-poster font-black text-[18px] leading-none uppercase tracking-[0.04em] text-cw-ink">
                            CampWatch
                        </span>
                    </Link>

                    {/* Inline nav */}
                    <nav className="hidden md:flex ml-6 gap-[22px] items-center font-mono-field text-[12px] font-semibold leading-none uppercase tracking-[0.14em]">
                        {NAV_LINKS.map((link) => {
                            const isActive = link.active(pathname);
                            return (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className="no-underline relative pb-[6px] outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                                    style={{ color: isActive ? CW.ink : CW.inkSubtle }}
                                >
                                    {link.label}
                                    {isActive && (
                                        <span
                                            aria-hidden
                                            className="absolute left-0 right-0 bottom-0 h-[2px]"
                                            style={{ background: CW.forest }}
                                        />
                                    )}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Right cluster */}
                    <div className="ml-auto flex gap-[14px] items-center">
                        {auth.user && (
                            <button
                                type="button"
                                onClick={onAddCampground}
                                className="inline-flex items-center gap-[6px] font-mono-field text-[11px] font-bold leading-none uppercase tracking-[0.14em] cursor-pointer rounded-[2px] px-[13px] py-[9px] border-[1.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                style={{
                                    background: CW.ink,
                                    color: CW.cream,
                                    borderColor: CW.ink,
                                }}
                            >
                                + Add Campground
                            </button>
                        )}

                        {auth.isLoading ? null : auth.user ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button
                                        type="button"
                                        aria-label="Account menu"
                                        className="size-[30px] rounded-full flex items-center justify-center shrink-0 font-mono-field text-[11px] font-bold leading-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        style={{ background: CW.clay, color: CW.cream }}
                                    >
                                        {auth.user.name?.[0]?.toUpperCase() ?? "?"}
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    {auth.isCurator && (
                                        <DropdownMenuItem asChild>
                                            <Link href="/app/admin">Curator dashboard</Link>
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem asChild>
                                        <Link href="/app/account">Account</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onSelect={() => void handleSignOut()}
                                    >
                                        Sign out
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <Link
                                href="/auth/google/start?returnTo=/app"
                                className="font-mono-field text-[11px] font-bold leading-none uppercase tracking-[0.14em] no-underline px-[13px] py-[9px] border border-cw-ink rounded-[2px] text-cw-ink"
                            >
                                Sign in
                            </Link>
                        )}
                    </div>
                </div>
            </header>
            <ProgressBarEl />
        </>
    );
}
