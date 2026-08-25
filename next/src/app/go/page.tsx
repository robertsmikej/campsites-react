"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Pass-through interstitial for external URLs opened from push notifications.
 *
 * In iOS standalone (PWA) mode, `clients.openWindow()` with a cross-origin URL
 * navigates the PWA window itself instead of opening Safari. The service worker
 * rewrites external notification URLs to `/go?url=<encoded>`, and this page
 * shows a tappable link that opens the real URL via `<a target="_blank">` (a
 * user gesture, so iOS allows it). The PWA window stays on CampWatch.
 *
 * We can't auto-open via `window.open()` because iOS blocks it as a popup
 * (no user gesture in a useEffect).
 */

const PAGE_STYLE: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    minHeight: "100vh",
    fontFamily: "system-ui, sans-serif",
    color: "#5a4a3a",
    background: "#F4EAD8",
    padding: 24,
    textAlign: "center",
};

const LINK_STYLE: React.CSSProperties = {
    display: "inline-block",
    padding: "14px 28px",
    background: "#1F3D2A",
    color: "#F4EAD8",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 16,
    textDecoration: "none",
};

const BACK_STYLE: React.CSSProperties = {
    color: "#8a7a6a",
    fontSize: 14,
    textDecoration: "none",
};

function isValidHttpUrl(raw: string): boolean {
    try {
        const parsed = new URL(raw);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
        return false;
    }
}

function GoInterstitial() {
    const params = useSearchParams();
    const target = params.get("url");

    if (!target || !isValidHttpUrl(target)) {
        return (
            <div style={PAGE_STYLE}>
                <p>No link to open.</p>
                <a href="/app" style={BACK_STYLE}>
                    Back to CampWatch
                </a>
            </div>
        );
    }

    return (
        <div style={PAGE_STYLE}>
            <p style={{ margin: 0, fontSize: 15, color: "#8a7a6a" }}>Tap to open in your browser</p>
            <a href={target} target="_blank" rel="noopener noreferrer" style={LINK_STYLE}>
                Open recreation.gov
            </a>
            <a href="/app" style={BACK_STYLE}>
                Back to CampWatch
            </a>
        </div>
    );
}

export default function GoPage() {
    return (
        <Suspense
            fallback={
                <div style={PAGE_STYLE}>
                    <p>Loading…</p>
                </div>
            }
        >
            <GoInterstitial />
        </Suspense>
    );
}
