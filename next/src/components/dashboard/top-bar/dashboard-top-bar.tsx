"use client";

import { TopBar } from "@/components/top-bar";
import { ProgressBarEl } from "@/components/progress-bar-el";
import { siteData } from "@/data/site-data";
import { AddCampgroundButton } from "./add-campground-button";
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
                actionItems={<AddCampgroundButton onClick={onAddCampground} />}
            />
            <ProgressBarEl />
        </>
    );
}
