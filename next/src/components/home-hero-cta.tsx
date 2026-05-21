"use client";

import Link from "next/link";
import { ArrowRight, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export function HomeHeroCta() {
    const auth = useAuth();

    if (auth.isLoading) {
        return (
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <div className="h-11 w-44 animate-pulse rounded-md bg-muted/40" />
                <div className="h-11 w-32 animate-pulse rounded-md bg-muted/40" />
            </div>
        );
    }

    if (auth.user) {
        return (
            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <Button size="lg" asChild>
                    <Link href="/app">
                        <LayoutDashboard className="mr-1 size-4" />
                        Go to dashboard
                        <ArrowRight className="ml-1 size-4" />
                    </Link>
                </Button>
                <Button variant="outline" size="lg" asChild>
                    <Link href="/discover">Browse picks</Link>
                </Button>
                <p className="text-sm text-muted-foreground sm:ml-2">
                    Signed in as <span className="font-medium text-foreground">{auth.user.email}</span>
                </p>
            </div>
        );
    }

    return (
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild>
                <Link href="/auth/google/start?returnTo=/app">
                    Sign in with Google
                    <ArrowRight className="ml-1 size-4" />
                </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
                <Link href="/discover">Browse picks</Link>
            </Button>
        </div>
    );
}
