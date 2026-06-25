"use client";

import { useState } from "react";
import { Bell, X } from "lucide-react";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "campwatch:push-nudge-dismissed";

// One-time dashboard banner prompting push, since the toggle is otherwise buried
// in Account. Only shows when enabling push is actually possible here (so it
// never dead-ends), and self-hides once enabled, denied, or dismissed.
export function PushNudge() {
    const { isSupported, isInstalledPWA, status, subscribe } = usePushSubscription();
    const [dismissed, setDismissed] = useState(() => {
        if (typeof window === "undefined") return true;
        try {
            return localStorage.getItem(DISMISS_KEY) === "1";
        } catch {
            return false;
        }
    });

    const isIOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
    const canEnableHere = isSupported && (!isIOS || isInstalledPWA);
    if (dismissed || !canEnableHere || status === "subscribed" || status === "denied") return null;

    const dismiss = () => {
        setDismissed(true);
        try {
            localStorage.setItem(DISMISS_KEY, "1");
        } catch {
            // best-effort; the banner just reappears next load
        }
    };

    return (
        <div className="px-[22px] py-3 md:px-9">
            <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
                <Bell className="size-4 shrink-0 text-primary" aria-hidden />
                <p className="min-w-0 flex-1 font-medium">
                    Get an instant push the moment a site opens — no inbox-watching.
                </p>
                <Button size="sm" onClick={() => void subscribe()} disabled={status === "subscribing"}>
                    {status === "subscribing" ? "Enabling…" : "Enable push"}
                </Button>
                <Button size="icon" variant="ghost" onClick={dismiss} aria-label="Dismiss">
                    <X className="size-4" />
                </Button>
            </div>
        </div>
    );
}
