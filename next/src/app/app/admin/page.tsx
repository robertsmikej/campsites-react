"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UsersTable } from "@/components/admin/users-table";
import { SiteConfigDialog } from "@/components/site-config-dialog";
import { getCampgroundOptions } from "@/data/sites";
import type { UserProfile } from "@/types/user";
import type { SiteConfig, GlobalSettings } from "@/types/campground";

export default function AdminPage() {
    const auth = useAuth();
    const [users, setUsers] = useState<UserProfile[] | null>(null);
    const [usersError, setUsersError] = useState<string | null>(null);

    const [defaultDialogOpen, setDefaultDialogOpen] = useState(false);
    const [defaultConfig, setDefaultConfig] = useState<SiteConfig | null>(null);
    const [defaultGlobalSettings, setDefaultGlobalSettings] = useState<GlobalSettings | null>(null);
    const catalogOptions = useMemo(() => getCampgroundOptions(), []);

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

    if (auth.isLoading) {
        return (
            <main className="container mx-auto max-w-4xl p-6">
                <Skeleton className="h-8 w-48" />
            </main>
        );
    }

    if (!auth.user || !auth.isCurator) {
        return (
            <main className="container mx-auto max-w-2xl p-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Curator access only</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-muted-foreground">
                        <p>This page is for curators. If you should be a curator, ask one to grant you the role.</p>
                        <Link className="underline" href="/app">
                            Back to dashboard
                        </Link>
                    </CardContent>
                </Card>
            </main>
        );
    }

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
                    validStartDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
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
        setUsers((current) =>
            current?.map((u) => (u.email === updated.email ? updated : u)) ?? null,
        );
        toast.success(`Updated ${target.email}`);
    }

    return (
        <main className="container mx-auto max-w-5xl space-y-6 p-6">
            <header className="flex items-end justify-between gap-2">
                <div>
                    <Link href="/app" className="text-sm text-muted-foreground hover:underline">
                        ← Back to dashboard
                    </Link>
                    <h1 className="mt-1 text-2xl font-semibold">Curator dashboard</h1>
                </div>
            </header>

            <Card>
                <CardHeader>
                    <CardTitle>Users</CardTitle>
                </CardHeader>
                <CardContent>
                    {usersError ? (
                        <p className="text-sm text-destructive">{usersError}</p>
                    ) : users === null ? (
                        <Skeleton className="h-32 w-full" />
                    ) : (
                        <UsersTable
                            users={users}
                            currentEmail={auth.user.email}
                            onToggleRole={toggleRole}
                        />
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Default campground list</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-start gap-2">
                    <p className="text-sm text-muted-foreground">
                        The list new users see on /discover and can clone as their starting watchlist.
                    </p>
                    <Button onClick={openDefaultDialog}>Edit default list</Button>
                </CardContent>
            </Card>

            {defaultConfig && defaultGlobalSettings ? (
                <SiteConfigDialog
                    open={defaultDialogOpen}
                    onClose={() => setDefaultDialogOpen(false)}
                    onSave={(config, settings) => {
                        void saveDefault(config, settings);
                    }}
                    onResetToDefaults={() => undefined}
                    initialData={defaultConfig}
                    catalogOptions={catalogOptions}
                    globalSettings={defaultGlobalSettings}
                    availableSites={{}}
                    useMockData={false}
                    onToggleMockData={() => undefined}
                />
            ) : null}
        </main>
    );
}
