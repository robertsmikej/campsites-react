"use client";

import { useCallback, useEffect, useState } from "react";

type Status = "idle" | "subscribing" | "subscribed" | "denied" | "error";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(b64);
    const buf = new ArrayBuffer(raw.length);
    const out = new Uint8Array(buf);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

export function usePushSubscription() {
    const [status, setStatus] = useState<Status>("idle");
    const [isInstalledPWA, setIsInstalledPWA] = useState(false);

    const isSupported =
        typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

    useEffect(() => {
        // iOS only allows push from an installed (standalone) PWA.
        const standalone =
            window.matchMedia?.("(display-mode: standalone)").matches ||
            (navigator as unknown as { standalone?: boolean }).standalone === true;
        setIsInstalledPWA(Boolean(standalone));
        if (!isSupported) return;
        void navigator.serviceWorker.ready.then(async (reg) => {
            const sub = await reg.pushManager.getSubscription();
            if (sub) setStatus("subscribed");
        });
    }, [isSupported]);

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
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
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
