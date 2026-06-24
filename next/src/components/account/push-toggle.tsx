"use client";

import { usePushSubscription } from "@/hooks/use-push-subscription";
import { Button } from "@/components/ui/button";

export function PushToggle() {
    const { isSupported, isInstalledPWA, status, subscribe, unsubscribe } = usePushSubscription();

    if (!isSupported) {
        return (
            <p className="text-sm text-muted-foreground">
                Push isn&apos;t supported in this browser. You&apos;ll still get email alerts.
            </p>
        );
    }

    // iOS: push only works once the PWA is added to the home screen.
    if (
        !isInstalledPWA &&
        typeof navigator !== "undefined" &&
        /iphone|ipad|ipod/i.test(navigator.userAgent)
    ) {
        return (
            <p className="text-sm text-muted-foreground">
                To get push on iPhone: tap Share → <strong>Add to Home Screen</strong>, open CampWatch from
                the new icon, then come back here to turn on push.
            </p>
        );
    }

    return (
        <div className="flex items-center justify-between gap-4">
            <div className="text-sm">
                <div className="font-medium">Push notifications</div>
                <div className="text-muted-foreground">
                    {status === "subscribed"
                        ? "On for this device — we'll push the moment a site opens."
                        : status === "denied"
                          ? "Blocked in your browser settings. Re-enable notifications for campwatch.dev."
                          : "Get an instant push on this device (in addition to email)."}
                </div>
            </div>
            {status === "subscribed" ? (
                <Button variant="outline" onClick={() => void unsubscribe()}>
                    Turn off
                </Button>
            ) : (
                <Button onClick={() => void subscribe()} disabled={status === "subscribing"}>
                    {status === "subscribing" ? "Enabling…" : "Enable push"}
                </Button>
            )}
        </div>
    );
}
