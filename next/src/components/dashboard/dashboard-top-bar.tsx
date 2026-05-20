"use client";

import { TopBar } from "@/components/top-bar";
import { ProgressBarEl } from "@/components/progress-bar-el";
import { siteData } from "@/data/site-data";
import { CW } from "@/components/field-notes/cw-tokens";
import { FM } from "@/components/field-notes/tokens";
import type { AuthState } from "@/hooks/use-auth";

interface DashboardTopBarProps {
    auth: AuthState;
    isLoading: boolean;
    menuItems: { label: string; action: () => void; disabled?: boolean }[];
    onAddCampground: () => void;
}

export function DashboardTopBar({ auth, isLoading, menuItems, onAddCampground }: DashboardTopBarProps) {
    return (
        <>
            <TopBar
                title={siteData.name ?? ""}
                subtitle={siteData.tagline ?? ""}
                logo={{ src: "/images/logos/CampWatch_Logo_trimmed.png", alt: "Camp Watch logo", height: 36 }}
                menuItems={menuItems}
                isRefreshing={isLoading}
                auth={auth}
                actionItems={
                    <button
                        className="cw-tb-add"
                        onClick={onAddCampground}
                        style={{
                            font: `700 11px/1 ${FM}`, letterSpacing: "0.14em", textTransform: "uppercase",
                            background: CW.ink, color: CW.cream, border: `1.5px solid ${CW.ink}`,
                            padding: "8px 12px", cursor: "pointer", borderRadius: 2,
                            display: "inline-flex", alignItems: "center", gap: 6,
                            transition: "opacity .14s",
                        }}
                    >
                        + Add campground
                    </button>
                }
            />
            <ProgressBarEl />
        </>
    );
}
