"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "campwatch:push-nudge-dismissed";

function readDismissed(): boolean {
    try {
        return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
        return false;
    }
}

function isIosBrowser(): boolean {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

// One-time dashboard banner prompting push, since the toggle is otherwise buried
// in Account. Only shows when enabling push is actually possible here (so it
// never dead-ends), and self-hides once enabled, denied, or dismissed.
//
// Nothing renders until after mount: the decision depends on localStorage, the
// user agent, and the live push subscription, none of which the server can see.
// Rendering the banner on the client's first pass was a hydration mismatch, and
// showing it before the subscription check finished flashed it at every
// already-subscribed user.
export function PushNudge() {
    const { isSupported, isInstalledPWA, status, subscribe } = usePushSubscription();
    const [environment, setEnvironment] = useState<{ dismissed: boolean; isIOS: boolean } | null>(null);

    useEffect(() => {
        setEnvironment({ dismissed: readDismissed(), isIOS: isIosBrowser() });
    }, []);

    if (!environment || environment.dismissed) return null;
    if (status === "checking" || status === "subscribed" || status === "denied") return null;
    const canEnableHere = isSupported && (!environment.isIOS || isInstalledPWA);
    if (!canEnableHere) return null;

    const dismiss = () => {
        setEnvironment({ ...environment, dismissed: true });
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
