"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { DashboardTopBar } from "@/components/dashboard/dashboard-top-bar";
import { UsersTable } from "@/components/admin/users-table";
import { SiteConfigDialog } from "@/components/site-config-dialog";
import { LoadingGhostRow } from "@/components/field-notes/loading";
import type { UserProfile } from "@/types/user";
import type { SiteConfig, GlobalSettings } from "@/types/campground";

interface MigrateResult {
    defaultUpdated: boolean;
    addedCampgrounds: { id: string; name: string }[];
    mapImagesBackfilled: number;
}

export default function AdminPage() {
    const auth = useAuth();
    const [users, setUsers] = useState<UserProfile[] | null>(null);
    const [usersError, setUsersError] = useState<string | null>(null);

    const [defaultDialogOpen, setDefaultDialogOpen] = useState(false);
    const [defaultConfig, setDefaultConfig] = useState<SiteConfig | null>(null);
    const [defaultGlobalSettings, setDefaultGlobalSettings] = useState<GlobalSettings | null>(null);

    const [migrateRunning, setMigrateRunning] = useState(false);
    const [migrateResult, setMigrateResult] = useState<MigrateResult | null>(null);
    const [migrateError, setMigrateError] = useState<string | null>(null);

    useEffect(() => {
        if (!auth.user || !auth.isCurator) return;
        let cancelled = false;
        (async () => {
            try {
                const r = await fetch("/api/admin/users", { credentials: "include" });
                if (!r.ok) {
                    if (!cancelled) setUsersError(`Server returned ${r.status}`);
                    return;
                }
                const data = (await r.json()) as { users: UserProfile[] };
                if (!cancelled) setUsers(data.users);
            } catch (e) {
                if (!cancelled) setUsersError(e instanceof Error ? e.message : "Unknown error");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [auth.user, auth.isCurator]);

    // ── Loading / auth gate ──────────────────────────────────────────────────

    if (auth.isLoading) {
        return (
            <>
                <DashboardTopBar auth={auth} />
                <main className="bg-cw-paper text-cw-ink font-body-serif min-h-screen">
                    <div className="mx-auto w-full max-w-screen-2xl px-[22px] md:px-9 py-8 sm:py-12">
                        <LoadingGhostRow height={40} className="max-w-xs" />
                    </div>
                </main>
            </>
        );
    }

    if (!auth.user || !auth.isCurator) {
        return (
            <>
                <DashboardTopBar auth={auth} />
                <main className="bg-cw-paper text-cw-ink font-body-serif min-h-screen">
                    <div className="mx-auto w-full max-w-screen-2xl px-[22px] md:px-9 py-8 sm:py-12">
                        <div className="max-w-2xl">
                            <section className="rounded-md border border-cw-ink bg-cw-cream p-6 sm:p-8">
                                <div className="font-mono-field text-[11px] font-bold uppercase tracking-[0.18em] text-cw-clay mb-2">
                                    Access denied
                                </div>
                                <h1 className="font-poster text-[28px] font-black uppercase tracking-[0.005em] mb-1">
                                    Curators only
                                </h1>
                                <p className="font-italic-serif text-[18px] italic leading-[1.3] text-cw-ink-soft mb-6">
                                    This page is for curators. If you should be one, ask a curator to grant
                                    you the role.
                                </p>
                                <Link
                                    href="/app"
                                    className="font-mono-field text-[11px] font-bold uppercase tracking-[0.14em] text-cw-ink underline underline-offset-2"
                                >
                                    Back to dashboard
                                </Link>
                            </section>
                        </div>
                    </div>
                </main>
            </>
        );
    }

    // ── Handlers ─────────────────────────────────────────────────────────────

    async function openDefaultDialog() {
        try {
            const r = await fetch("/api/default", { credentials: "include" });
            if (!r.ok) {
                toast.error("Couldn't load the default list");
                return;
            }
            const data = (await r.json()) as { campgrounds: SiteConfig; globalSettings?: GlobalSettings };
            setDefaultConfig(data.campgrounds);
            setDefaultGlobalSettings(
                data.globalSettings ?? {
                    stayLengths: [2, 3, 4, 5],
                    validStartDays: [
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                        "Sunday",
                    ],
                },
            );
            setDefaultDialogOpen(true);
        } catch {
            toast.error("Couldn't load the default list");
        }
    }

    async function saveDefault(config: SiteConfig, settings: GlobalSettings) {
        const r = await fetch("/api/default", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ campgrounds: config, globalSettings: settings }),
            credentials: "include",
        });
        if (!r.ok) {
            toast.error("Save failed");
            return;
        }
        toast.success("Default list saved");
        setDefaultDialogOpen(false);
    }

    async function toggleRole(target: UserProfile, makeCurator: boolean) {
        const currentRoles = target.roles ?? [];
        const nextRoles = makeCurator
            ? (Array.from(new Set([...currentRoles, "curator"])) as UserProfile["roles"])
            : currentRoles.filter((r) => r !== "curator");

        const r = await fetch(`/api/admin/users/${encodeURIComponent(target.email)}/roles`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roles: nextRoles }),
            credentials: "include",
        });
        if (!r.ok) {
            const body = (await r.json().catch(() => ({}))) as { error?: string };
            toast.error(body.error ?? `Update failed (${r.status})`);
            return;
        }
        const updated = (await r.json()) as UserProfile;
        setUsers((current) => current?.map((u) => (u.email === updated.email ? updated : u)) ?? null);
        toast.success(`Updated ${target.email}`);
    }

    async function runMigrate() {
        setMigrateRunning(true);
        setMigrateResult(null);
        setMigrateError(null);
        try {
            const r = await fetch("/api/admin/migrate", {
                method: "POST",
                credentials: "include",
            });
            if (!r.ok) {
                const body = (await r.json().catch(() => ({}))) as { error?: string };
                setMigrateError(body.error ?? `Server returned ${r.status}`);
                toast.error("Migrate failed");
                return;
            }
            const data = (await r.json()) as MigrateResult;
            setMigrateResult(data);
            toast.success("Migrate complete");
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            setMigrateError(msg);
            toast.error("Migrate failed");
        } finally {
            setMigrateRunning(false);
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <>
            <DashboardTopBar auth={auth} />

            <main className="bg-cw-paper text-cw-ink font-body-serif min-h-screen">
                <div className="mx-auto w-full max-w-screen-2xl px-[22px] md:px-9 py-8 sm:py-12">
                    {/* Page header */}
                    <div className="mb-8">
                        <div className="font-mono-field text-[11px] font-bold uppercase tracking-[0.18em] text-cw-clay mb-2">
                            Curator · Admin
                        </div>
                        <h1 className="font-poster text-[36px] sm:text-[44px] font-black uppercase leading-[0.95] tracking-[-0.005em]">
                            Curator dashboard
                        </h1>
                        <p className="font-italic-serif text-[18px] italic leading-[1.3] text-cw-ink-soft mt-2">
                            Read-only stats and write paths for the people who keep this thing watching.
                        </p>
                    </div>

                    <div className="max-w-4xl space-y-6">
                        {/* Users section */}
                        <section className="rounded-md border border-cw-ink bg-cw-cream p-6 sm:p-8">
                            <div className="font-mono-field text-[11px] font-bold uppercase tracking-[0.18em] text-cw-clay mb-2">
                                Users
                            </div>
                            <h2 className="font-poster text-[24px] sm:text-[28px] font-black uppercase tracking-[0.005em] mb-1">
                                Who&apos;s here
                            </h2>
                            <p className="font-italic-serif text-[16px] sm:text-[18px] italic leading-[1.3] text-cw-ink-soft mb-6">
                                Everyone with a CampWatch profile.{" "}
                                {users !== null && (
                                    <span className="not-italic font-mono-field text-[12px] font-bold text-cw-clay">
                                        {users.length} total
                                    </span>
                                )}
                            </p>
                            {usersError ? (
                                <p className="font-mono-field text-[11px] text-red-700">{usersError}</p>
                            ) : users === null ? (
                                <div className="space-y-2">
                                    <LoadingGhostRow height={36} />
                                    <LoadingGhostRow height={36} />
                                    <LoadingGhostRow height={36} />
                                </div>
                            ) : (
                                <UsersTable
                                    users={users}
                                    currentEmail={auth.user.email}
                                    onToggleRole={toggleRole}
                                />
                            )}
                        </section>

                        {/* Default config section */}
                        <section className="rounded-md border border-cw-ink bg-cw-cream p-6 sm:p-8">
                            <div className="font-mono-field text-[11px] font-bold uppercase tracking-[0.18em] text-cw-forest mb-2">
                                Default config
                            </div>
                            <h2 className="font-poster text-[24px] sm:text-[28px] font-black uppercase tracking-[0.005em] mb-1">
                                The starter list
                            </h2>
                            <p className="font-italic-serif text-[16px] sm:text-[18px] italic leading-[1.3] text-cw-ink-soft mb-6">
                                The list new users see on /discover and can clone as their starting watchlist.
                            </p>
                            <button
                                type="button"
                                onClick={openDefaultDialog}
                                className="font-mono-field text-[11px] font-bold uppercase tracking-[0.14em] cursor-pointer rounded-[2px] px-[13px] py-[9px] border-[1.5px] bg-cw-ink text-cw-cream border-cw-ink"
                            >
                                Edit default list
                            </button>
                        </section>

                        {/* Migrate section */}
                        <section className="rounded-md border border-cw-ink bg-cw-cream p-6 sm:p-8">
                            <div className="font-mono-field text-[11px] font-bold uppercase tracking-[0.18em] text-cw-mustard mb-2">
                                Maintenance
                            </div>
                            <h2 className="font-poster text-[24px] sm:text-[28px] font-black uppercase tracking-[0.005em] mb-1">
                                Migrate catalog
                            </h2>
                            <p className="font-italic-serif text-[16px] sm:text-[18px] italic leading-[1.3] text-cw-ink-soft mb-6">
                                Idempotent seed: merges any new catalog entries into the default KV config
                                without touching existing ones.
                            </p>
                            <button
                                type="button"
                                onClick={runMigrate}
                                disabled={migrateRunning}
                                className="font-mono-field text-[11px] font-bold uppercase tracking-[0.14em] cursor-pointer rounded-[2px] px-[13px] py-[9px] border-[1.5px] bg-cw-ink text-cw-cream border-cw-ink disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {migrateRunning ? "Running…" : "Run migrate"}
                            </button>

                            {migrateError && (
                                <div className="mt-4 bg-cw-paper/50 border border-cw-rule-soft p-3 rounded-[4px]">
                                    <p className="font-mono-field text-[11px] text-red-700">{migrateError}</p>
                                </div>
                            )}

                            {migrateResult && (
                                <div className="mt-4 bg-cw-paper/50 border border-cw-rule-soft p-3 rounded-[4px]">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span
                                            className="font-mono-field text-[11px] font-bold uppercase tracking-[0.14em]"
                                            style={{ color: "var(--cw-forest)" }}
                                        >
                                            ✓ Done
                                        </span>
                                    </div>
                                    <pre className="font-mono-field text-[11px] text-cw-ink-soft whitespace-pre-wrap break-all">
                                        {JSON.stringify(migrateResult, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            </main>

            {defaultConfig && defaultGlobalSettings ? (
                <SiteConfigDialog
                    open={defaultDialogOpen}
                    onClose={() => setDefaultDialogOpen(false)}
                    onSave={(config, settings) => {
                        void saveDefault(config, settings);
                    }}
                    onResetToDefaults={() => undefined}
                    initialData={defaultConfig}
                    globalSettings={defaultGlobalSettings}
                    availableSites={{}}
                    useMockData={false}
                    onToggleMockData={() => undefined}
                />
            ) : null}
        </>
    );
}
