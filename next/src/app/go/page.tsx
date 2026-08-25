"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Pass-through page for external URLs opened from push notifications.
 *
 * In iOS standalone (PWA) mode, `clients.openWindow()` with a cross-origin URL
 * navigates the PWA window itself instead of opening Safari. This page works
 * around that: the service worker rewrites external notification URLs to
 * `/go?url=<encoded>`, this page opens the real URL via `window.open()` (which
 * opens Safari on iOS), then redirects the PWA window back to `/app`.
 */
export default function GoPage() {
    const params = useSearchParams();
    const target = params.get("url");

    useEffect(() => {
        if (!target) {
            window.location.replace("/app");
            return;
        }

        // Validate: only allow http(s) URLs to prevent open-redirect abuse.
        let parsed: URL;
        try {
            parsed = new URL(target);
        } catch {
            window.location.replace("/app");
            return;
        }
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
            window.location.replace("/app");
            return;
        }

        // Open the external URL in a real browser tab. On iOS standalone mode
        // this opens Safari; on Android/desktop it opens a new Chrome tab.
        window.open(target, "_blank", "noopener,noreferrer");

        // Navigate the PWA window back to the dashboard.
        window.location.replace("/app");
    }, [target]);

    // Brief flash while the redirect runs. Styled inline so it doesn't need
    // the full CSS bundle.
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "100vh",
                fontFamily: "system-ui, sans-serif",
                color: "#5a4a3a",
                background: "#F4EAD8",
            }}
        >
            <p>Opening recreation.gov…</p>
        </div>
    );
}
