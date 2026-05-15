"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UsersTable } from "@/components/admin/users-table";
import type { UserProfile } from "@/types/user";

export default function AdminPage() {
    const auth = useAuth();
    const [users, setUsers] = useState<UserProfile[] | null>(null);
    const [usersError, setUsersError] = useState<string | null>(null);

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

            {/* Edit default list card lands in Task C2 */}
        </main>
    );
}
