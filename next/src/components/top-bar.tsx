"use client";

import Link from "next/link";
import { Menu, Loader2, User, LogOut, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import type { AuthState } from "@/hooks/use-auth";

export interface TopBarMenuItem {
    type?: "toggle";
    label: string;
    checked?: boolean;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    action?: () => void;
    href?: string;
    newTab?: boolean;
    disabled?: boolean;
}

export interface TopBarProps {
    title: string;
    subtitle?: string;
    logo?: string | { src: string; alt?: string; height?: number; width?: number };
    menuItems?: TopBarMenuItem[];
    isRefreshing?: boolean;
    actionItems?: React.ReactNode;
    auth?: AuthState;
    onMenuClick?: () => void;
    onMenuItemSelect?: (item: TopBarMenuItem) => void;
    menuButtonLabel?: string;
}

async function handleSignOut() {
    try {
        await fetch("/auth/logout", { method: "POST", credentials: "include" });
    } catch {
        // ignore — we'll reload anyway
    }
    window.location.href = "/";
}

export function TopBar({
    title = "Campground Availability",
    subtitle,
    logo,
    menuItems = [],
    isRefreshing = false,
    actionItems,
    auth,
    onMenuClick: _onMenuClick,
    onMenuItemSelect,
    menuButtonLabel: _menuButtonLabel = "Menu",
}: TopBarProps) {
    const hasMenu = Array.isArray(menuItems) && menuItems.length > 0;

    const handleItemSelect = (item: TopBarMenuItem) => {
        if (item.action) {
            item.action();
        }
        if (item.href && typeof window !== "undefined") {
            const target = item.newTab === false ? "_self" : "_blank";
            window.open(item.href, target, "noopener,noreferrer");
        }
        if (onMenuItemSelect) {
            onMenuItemSelect(item);
        }
    };

    const renderLogo = () => {
        if (!logo) return null;
        if (typeof logo === "string") {
            return (
                <img
                    src={logo}
                    alt="Site logo"
                    className="h-9 w-auto"
                />
            );
        }
        if (logo.src) {
            return (
                <img
                    src={logo.src}
                    alt={logo.alt ?? "Site logo"}
                    style={logo.height ? { height: logo.height, width: logo.width ?? "auto" } : undefined}
                    className="h-9 w-auto object-contain"
                />
            );
        }
        return null;
    };

    return (
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto flex h-16 items-center gap-3 px-4">
                {renderLogo()}
                <div className="flex flex-col">
                    <h1 className="font-display text-lg font-semibold leading-none tracking-tight">{title}</h1>
                    {subtitle ? (
                        <p className="text-xs text-muted-foreground">{subtitle}</p>
                    ) : null}
                </div>

                <div className="ml-auto flex items-center gap-2">
                    {isRefreshing ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                    ) : null}
                    {actionItems}
                    <ThemeToggle />
                    {auth !== undefined ? (
                        auth.isLoading ? (
                            <Skeleton className="size-8 rounded-full" />
                        ) : auth.user ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                        <Avatar className="size-8">
                                            <AvatarImage src={auth.user.picture} alt={auth.user.name} />
                                            <AvatarFallback>{auth.user.name?.[0]?.toUpperCase() ?? "?"}</AvatarFallback>
                                        </Avatar>
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    {auth.isCurator ? (
                                        <DropdownMenuItem asChild>
                                            <Link href="/app/admin" className="flex items-center gap-2">
                                                <Shield className="size-4" />
                                                Curator dashboard
                                            </Link>
                                        </DropdownMenuItem>
                                    ) : null}
                                    <DropdownMenuItem asChild>
                                        <Link href="/app/account" className="flex items-center gap-2">
                                            <User className="size-4" />
                                            Account
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        className="flex items-center gap-2 text-destructive focus:text-destructive"
                                        onSelect={() => void handleSignOut()}
                                    >
                                        <LogOut className="size-4" />
                                        Sign out
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <Button variant="outline" size="sm" asChild>
                                <a href="/auth/google/start?returnTo=/app">Sign in</a>
                            </Button>
                        )
                    ) : null}
                    {hasMenu ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label="Menu">
                                    <Menu className="size-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {menuItems.map((item, idx) =>
                                    item.type === "toggle" ? (
                                        <DropdownMenuCheckboxItem
                                            key={`${item.label}-${idx}`}
                                            checked={!!item.checked}
                                            onCheckedChange={(checked) =>
                                                item.onChange?.({
                                                    target: { checked },
                                                    currentTarget: { checked },
                                                } as unknown as React.ChangeEvent<HTMLInputElement>)
                                            }
                                            onSelect={(e) => e.preventDefault()}
                                        >
                                            {item.label}
                                        </DropdownMenuCheckboxItem>
                                    ) : (
                                        <DropdownMenuItem
                                            key={`${item.label}-${idx}`}
                                            disabled={!!item.disabled}
                                            onSelect={() => handleItemSelect(item)}
                                        >
                                            {item.label}
                                        </DropdownMenuItem>
                                    ),
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : null}
                </div>
            </div>
        </header>
    );
}
