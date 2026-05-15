"use client";

import { Menu, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
    onMenuClick?: () => void;
    onMenuItemSelect?: (item: TopBarMenuItem) => void;
    menuButtonLabel?: string;
}

export function TopBar({
    title = "Campground Availability",
    subtitle,
    logo,
    menuItems = [],
    isRefreshing = false,
    actionItems,
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
                    <h1 className="text-base font-semibold leading-none">{title}</h1>
                    {subtitle ? (
                        <p className="text-xs text-muted-foreground">{subtitle}</p>
                    ) : null}
                </div>

                <div className="ml-auto flex items-center gap-2">
                    {isRefreshing ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                    ) : null}
                    {actionItems}
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
