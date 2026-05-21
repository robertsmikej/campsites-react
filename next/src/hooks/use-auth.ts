"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserProfile } from "@/types/user";

export interface AuthState {
    user: UserProfile | null;
    isLoading: boolean;
    isCurator: boolean;
    refresh: () => Promise<void>;
}

export function useAuth(): AuthState {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchMe = useCallback(async () => {
        try {
            const response = await fetch("/api/me", { credentials: "include" });
            if (!response.ok) {
                console.warn(`[useAuth] /api/me returned ${response.status}`);
                setUser(null);
            } else {
                const body = (await response.json()) as { user: UserProfile | null };
                setUser(body.user);
            }
        } catch (e) {
            console.warn("[useAuth] fetch failed:", e);
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchMe();
    }, [fetchMe]);

    return {
        user,
        isLoading,
        isCurator: user?.roles?.includes("curator") ?? false,
        refresh: fetchMe,
    };
}
