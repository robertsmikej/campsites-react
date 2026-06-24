"use client";

import { useEffect } from "react";
import { toast } from "sonner";

// The OAuth callback (app/auth/google/callback/route.ts) redirects failures to
// `/?authError=<reason>`. Without this, the user lands on a normal-looking
// homepage with no feedback and assumes their click didn't register — so they
// click "Sign in" again into the same failure. Surface it as a toast instead.
const MESSAGES: Record<string, string> = {
    oauth_not_configured: "Sign-in is temporarily unavailable. Please try again in a bit.",
};
const DEFAULT_MESSAGE = "Sign-in didn't complete. Please try again.";

export function AuthErrorToast() {
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const reason = params.get("authError");
        if (!reason) return;
        toast.error(MESSAGES[reason] ?? DEFAULT_MESSAGE, { id: "auth-error" });
        // Strip the param so a refresh doesn't re-toast.
        params.delete("authError");
        const qs = params.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    }, []);
    return null;
}
