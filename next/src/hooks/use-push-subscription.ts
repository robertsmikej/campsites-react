"use client";

import { useCallback, useEffect, useState } from "react";

// "checking" is the initial state until the existing registration has been
// inspected, so UI can avoid flashing "Enable push" at a subscribed user.
type Status = "checking" | "idle" | "subscribing" | "subscribed" | "denied" | "error";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(b64);
    const buf = new ArrayBuffer(raw.length);
    const out = new Uint8Array(buf);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

function pushIsSupported(): boolean {
    return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

function isStandaloneDisplay(): boolean {
    const mediaStandalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
    const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
    return mediaStandalone || iosStandalone;
}

// Uses getRegistration(), not serviceWorker.ready: `ready` never resolves when
// no worker is registered yet, which is exactly the fresh-browser case.
async function detectExistingStatus(): Promise<Status> {
    if (typeof Notification !== "undefined" && Notification.permission === "denied") {
        return "denied";
    }
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
        return "idle";
    }
    const subscription = await registration.pushManager.getSubscription();
    return subscription ? "subscribed" : "idle";
}

export function usePushSubscription() {
    const [status, setStatus] = useState<Status>("checking");
    const [isInstalledPWA, setIsInstalledPWA] = useState(false);
    const [isSupported, setIsSupported] = useState(false);

    useEffect(() => {
        const supported = pushIsSupported();
        setIsSupported(supported);
        // iOS only allows push from an installed (standalone) PWA.
        setIsInstalledPWA(isStandaloneDisplay());
        if (!supported) {
            setStatus("idle");
            return;
        }
        let cancelled = false;
        detectExistingStatus()
            .then((detected) => {
                if (!cancelled) setStatus(detected);
            })
            .catch(() => {
                if (!cancelled) setStatus("idle");
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const subscribe = useCallback(async () => {
        if (!isSupported) return;
        setStatus("subscribing");
        try {
            const reg = await navigator.serviceWorker.register("/sw.js");
            const permission = await Notification.requestPermission();
            if (permission !== "granted") {
                setStatus("denied");
                return;
            }
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""),
            });
            const res = await fetch("/api/users/me/push", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(sub.toJSON()),
            });
            setStatus(res.ok ? "subscribed" : "error");
        } catch {
            setStatus("error");
        }
    }, [isSupported]);

    const unsubscribe = useCallback(async () => {
        if (!isSupported) return;
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
            await fetch("/api/users/me/push", {
                method: "DELETE",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ endpoint: sub.endpoint }),
            });
            await sub.unsubscribe();
        }
        setStatus("idle");
    }, [isSupported]);

    return { isSupported, isInstalledPWA, status, subscribe, unsubscribe };
}
