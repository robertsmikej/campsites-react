"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CW } from "@/components/field-notes/cw-tokens";
import { useAuth } from "@/hooks/use-auth";
import { useUserCampgrounds } from "@/hooks/use-user-campgrounds";
import { useCampgroundsData } from "@/hooks/use-campgrounds-data";
import { pickSummerYear } from "@/lib/summer-planner";
import { DashboardTopBar } from "@/components/dashboard/dashboard-top-bar";
import { SummerPlan } from "@/components/dashboard/summer-plan/summer-plan";

export default function PlanPage() {
    const auth = useAuth();
    const { siteConfig, globalSettings, isHydrating } = useUserCampgrounds();
    const { campgroundsByAreas, isFetching } = useCampgroundsData({ enabled: !isHydrating, siteConfig });

    const seasonYear = useMemo(() => pickSummerYear(campgroundsByAreas, new Date()), [campgroundsByAreas]);

    const loading = isHydrating || (isFetching && campgroundsByAreas.length === 0);

    return (
        <>
            <DashboardTopBar auth={auth} />
            <main className="min-h-screen bg-cw-paper text-cw-ink font-body-serif">
                <div className="mx-auto w-full max-w-screen-2xl" style={{ padding: "24px 24px 60px" }}>
                    <Link
                        href="/app"
                        className="font-mono-field uppercase no-underline"
                        style={{ fontSize: 11, letterSpacing: "0.12em", color: CW.clay }}
                    >
                        ← Dashboard
                    </Link>
                    <div className="mb-6 pt-5">
                        <div
                            className="font-mono-field font-medium uppercase"
                            style={{ fontSize: 11, letterSpacing: "0.22em", color: CW.clay }}
                        >
                            § Field Station · An ideal summer
                        </div>
                        <h1
                            className="m-0 mt-2 font-poster font-black uppercase leading-none"
                            style={{ fontSize: 40 }}
                        >
                            Plan your{" "}
                            <span
                                className="font-italic-serif italic normal-case text-cw-forest"
                                style={{ fontSize: 32 }}
                            >
                                summer
                            </span>
                        </h1>
                        <p
                            className="mt-2 font-italic-serif italic"
                            style={{ fontSize: 16, color: CW.inkSoft }}
                        >
                            Five trips, different places, spread across the season — built from what&apos;s
                            open now.
                        </p>
                    </div>

                    {loading ? (
                        <div className="font-italic-serif italic" style={{ fontSize: 16, color: CW.inkSoft }}>
                            Reading your watchlist availability…
                        </div>
                    ) : (
                        <SummerPlan
                            rows={campgroundsByAreas}
                            seasonYear={seasonYear}
                            blackoutDates={globalSettings.blackoutDates}
                        />
                    )}
                </div>
            </main>
        </>
    );
}
