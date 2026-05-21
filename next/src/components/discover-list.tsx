"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingGhostRow } from "@/components/field-notes/loading";
import { getTypeBadge } from "@/components/campground/type-badge";
import type { ApiConfigResponse, Campground } from "@/types/campground";

export function DiscoverList() {
    const auth = useAuth();
    const [data, setData] = useState<ApiConfigResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const r = await fetch("/api/default", { credentials: "include" });
                if (!r.ok) {
                    if (!cancelled) setData(null);
                    return;
                }
                if (!cancelled) setData((await r.json()) as ApiConfigResponse);
            } catch {
                if (!cancelled) setData(null);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    async function handleAdd(c: Campground) {
        if (auth.isLoading) return;
        if (!auth.user) {
            window.location.href = "/auth/google/start?returnTo=/discover";
            return;
        }
        setBusyId(c.id);
        try {
            const r = await fetch("/api/users/me/campgrounds/items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: c.id }),
                credentials: "include",
            });
            if (!r.ok) {
                toast.error(`Couldn't add ${c.name}`);
                return;
            }
            const result = (await r.json()) as { message?: string };
            toast.success(result.message === "Already in your list"
                ? `${c.name} is already in your list`
                : `${c.name} added to your list`);
        } finally {
            setBusyId(null);
        }
    }

    if (isLoading) {
        return (
            <div className="space-y-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                    <LoadingGhostRow key={i} height={54} />
                ))}
            </div>
        );
    }

    if (!data) {
        return (
            <p className="text-sm text-muted-foreground">
                The curator hasn&apos;t published a list yet. Check back soon.
            </p>
        );
    }

    const campgrounds = data.campgrounds["recreation.gov"] ?? [];
    if (campgrounds.length === 0) {
        return <p className="text-sm text-muted-foreground">No campgrounds yet.</p>;
    }

    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {campgrounds.map((c) => {
                const badge = getTypeBadge(c);
                return (
                    <Card key={c.id} className="overflow-hidden">
                        <CardContent className="space-y-3 p-4">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <badge.Icon className="size-5 shrink-0" style={{ color: badge.color }} aria-hidden />
                                    <h3 className="truncate text-base font-semibold">{c.name}</h3>
                                </div>
                                {c.area ? <Badge variant="secondary">{c.area}</Badge> : null}
                            </div>
                            {c.description ? (
                                <p className="text-sm text-muted-foreground line-clamp-3">{c.description}</p>
                            ) : null}
                            <Button
                                size="sm"
                                onClick={() => handleAdd(c)}
                                disabled={busyId === c.id || auth.isLoading}
                                className="w-full"
                            >
                                {busyId === c.id ? "Adding…" : "Add to my list"}
                            </Button>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
