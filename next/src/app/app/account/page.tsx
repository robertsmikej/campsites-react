"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { DashboardTopBar } from "@/components/dashboard/dashboard-top-bar";

import type { NotifyScope } from "@/types/campground";

type Frequency = 5 | 15 | 60 | 240;

const DEFAULT_NOTIFICATIONS = { enabled: true, frequencyMinutes: 15 satisfies Frequency };
const DEFAULT_NOTIFY_SCOPE: NotifyScope = "worthwhile";

const SCOPE_LABELS: Record<NotifyScope, { label: string; hint: string }> = {
    favorites: { label: "Favorites only", hint: "Only sites you've starred at each campground." },
    worthwhile: { label: "Favorites + worthwhile", hint: "Starred sites and any you've marked worthwhile." },
    all: { label: "All sites", hint: "Every site at the campground — most noise, no surprises." },
};

export default function AccountPage() {
    const auth = useAuth();
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);
    const [notifEnabled, setNotifEnabled] = useState<boolean>(true);
    const [notifFrequency, setNotifFrequency] = useState<Frequency>(15);
    const [notifScope, setNotifScope] = useState<NotifyScope>(DEFAULT_NOTIFY_SCOPE);
    const [savingNotif, setSavingNotif] = useState(false);

    useEffect(() => {
        if (!auth.isLoading && !auth.user) {
            window.location.replace("/auth/google/start?returnTo=/app/account");
        }
    }, [auth.isLoading, auth.user]);

    useEffect(() => {
        if (auth.user?.name) setName(auth.user.name);
    }, [auth.user?.name]);

    useEffect(() => {
        const n = auth.user?.notifications ?? DEFAULT_NOTIFICATIONS;
        setNotifEnabled(n.enabled);
        setNotifFrequency(n.frequencyMinutes as Frequency);
        setNotifScope(auth.user?.defaultNotifyScope ?? DEFAULT_NOTIFY_SCOPE);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        auth.user?.notifications?.enabled,
        auth.user?.notifications?.frequencyMinutes,
        auth.user?.defaultNotifyScope,
    ]);

    if (auth.isLoading || !auth.user) {
        return (
            <>
                <DashboardTopBar auth={auth} />
                <main className="bg-cw-paper text-cw-ink font-body-serif min-h-screen">
                    <div className="mx-auto w-full max-w-screen-2xl px-[22px] md:px-9 py-8 sm:py-12">
                        <p className="font-mono-field text-[13px] uppercase tracking-[0.14em] text-cw-ink-subtle">
                            Loading…
                        </p>
                    </div>
                </main>
            </>
        );
    }

    const dirty = name.trim() !== auth.user.name;

    async function saveName() {
        if (!dirty) return;
        setSaving(true);
        try {
            const response = await fetch("/api/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim() }),
                credentials: "include",
            });
            if (!response.ok) {
                const body = (await response.json().catch(() => ({}))) as { error?: string };
                toast.error(body.error ?? `Save failed (${response.status})`);
                return;
            }
            toast.success("Profile saved");
            await auth.refresh();
        } finally {
            setSaving(false);
        }
    }

    const currentNotifEnabled = auth.user.notifications?.enabled ?? DEFAULT_NOTIFICATIONS.enabled;
    const currentNotifFrequency =
        auth.user.notifications?.frequencyMinutes ?? DEFAULT_NOTIFICATIONS.frequencyMinutes;
    const currentNotifScope = auth.user.defaultNotifyScope ?? DEFAULT_NOTIFY_SCOPE;
    const notifDirty =
        notifEnabled !== currentNotifEnabled ||
        notifFrequency !== currentNotifFrequency ||
        notifScope !== currentNotifScope;

    async function saveNotifications() {
        if (!notifDirty) return;
        setSavingNotif(true);
        try {
            const response = await fetch("/api/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    notifications: { enabled: notifEnabled, frequencyMinutes: notifFrequency },
                    defaultNotifyScope: notifScope,
                }),
                credentials: "include",
            });
            if (!response.ok) {
                const body = (await response.json().catch(() => ({}))) as { error?: string };
                toast.error(body.error ?? `Save failed (${response.status})`);
                return;
            }
            toast.success("Notifications saved");
            await auth.refresh();
        } finally {
            setSavingNotif(false);
        }
    }

    async function signOut() {
        try {
            await fetch("/auth/logout", { method: "POST", credentials: "include" });
        } catch {
            // ignore
        }
        window.location.href = "/";
    }

    async function deleteAccount() {
        const response = await fetch("/api/me", {
            method: "DELETE",
            credentials: "include",
        });
        if (response.ok || response.status === 204) {
            window.location.href = "/";
        } else {
            toast.error("Delete failed");
        }
    }

    const memberSince = new Date(auth.user.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    const initial = auth.user.name?.[0]?.toUpperCase() ?? "?";

    return (
        <>
            <DashboardTopBar auth={auth} />

            <main className="bg-cw-paper text-cw-ink font-body-serif min-h-screen">
                <div className="mx-auto w-full max-w-screen-2xl px-[22px] md:px-9 py-8 sm:py-12">
                    <div className="max-w-2xl space-y-6">
                        {/* Page header */}
                        <div className="mb-8">
                            <div className="font-mono-field text-[13px] font-bold uppercase tracking-[0.18em] text-cw-clay mb-2">
                                Settings · You
                            </div>
                            <h1 className="font-poster text-[36px] sm:text-[44px] font-black uppercase leading-[0.95] tracking-[-0.005em]">
                                Your account
                            </h1>
                        </div>

                        {/* Profile section */}
                        <section className="rounded-md border border-cw-ink bg-cw-cream p-6 sm:p-8">
                            <div className="font-mono-field text-[13px] font-bold uppercase tracking-[0.18em] text-cw-clay mb-2">
                                Profile
                            </div>
                            <h2 className="font-poster text-[28px] font-black uppercase tracking-[0.005em] mb-1">
                                Who you are
                            </h2>
                            <p className="font-italic-serif text-[18px] italic leading-[1.3] text-cw-ink-soft mb-6">
                                What other campers see when you save changes.
                            </p>

                            {/* Avatar + identity */}
                            <div className="flex items-center gap-4 mb-6">
                                {auth.user.picture ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={auth.user.picture}
                                        alt={auth.user.name ?? "Profile photo"}
                                        className="size-14 sm:size-16 rounded-full object-cover shrink-0"
                                    />
                                ) : (
                                    <div
                                        className="size-14 sm:size-16 rounded-full flex items-center justify-center font-mono-field text-[20px] font-bold shrink-0"
                                        style={{ background: "var(--cw-clay)", color: "var(--cw-cream)" }}
                                    >
                                        {initial}
                                    </div>
                                )}
                                <div className="min-w-0">
                                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                                        <div className="flex items-baseline gap-2">
                                            <span className="font-mono-field text-[12px] font-bold uppercase tracking-[0.16em] text-cw-clay shrink-0">
                                                Email
                                            </span>
                                            <span className="font-body-serif text-[14px] text-cw-ink truncate">
                                                {auth.user.email}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-baseline gap-2 mt-1">
                                        <span className="font-mono-field text-[12px] font-bold uppercase tracking-[0.16em] text-cw-clay shrink-0">
                                            Member since
                                        </span>
                                        <span className="font-body-serif text-[14px] text-cw-ink-soft">
                                            {memberSince}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Display name input */}
                            <div className="space-y-2 mb-6">
                                <Label
                                    htmlFor="account-name"
                                    className="font-mono-field text-[12px] font-bold uppercase tracking-[0.16em] text-cw-clay"
                                >
                                    Display name
                                </Label>
                                <Input
                                    id="account-name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Your name"
                                    className="max-w-sm"
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={saveName}
                                    disabled={!dirty || saving}
                                    className="inline-flex items-center font-mono-field text-[13px] font-bold leading-none uppercase tracking-[0.14em] cursor-pointer rounded-[2px] px-[13px] py-[9px] border-[1.5px] disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={{
                                        background: "var(--cw-ink)",
                                        color: "var(--cw-cream)",
                                        borderColor: "var(--cw-ink)",
                                    }}
                                >
                                    {saving ? "Saving…" : "Save changes"}
                                </button>
                                <button
                                    type="button"
                                    onClick={signOut}
                                    className="inline-flex items-center font-mono-field text-[13px] font-bold leading-none uppercase tracking-[0.14em] cursor-pointer rounded-[2px] px-[13px] py-[9px] border-[1.5px] bg-transparent"
                                    style={{
                                        borderColor: "var(--cw-ink)",
                                        color: "var(--cw-ink)",
                                    }}
                                >
                                    Sign out
                                </button>
                            </div>
                        </section>

                        {/* Notifications section */}
                        <section className="rounded-md border border-cw-ink bg-cw-cream p-6 sm:p-8">
                            <div className="font-mono-field text-[13px] font-bold uppercase tracking-[0.18em] text-cw-forest mb-2">
                                Notifications
                            </div>
                            <h2 className="font-poster text-[28px] font-black uppercase tracking-[0.005em] mb-1">
                                Watchlist alerts
                            </h2>
                            <p className="font-italic-serif text-[18px] italic leading-[1.3] text-cw-ink-soft mb-6">
                                Email me when new sites come open.
                            </p>

                            {/* Toggle row */}
                            <div className="flex items-start gap-3 mb-5">
                                <Switch
                                    id="notif-enabled"
                                    checked={notifEnabled}
                                    onCheckedChange={setNotifEnabled}
                                />
                                <div className="flex flex-col gap-0.5">
                                    <Label
                                        htmlFor="notif-enabled"
                                        className="font-mono-field text-[12px] font-bold uppercase tracking-[0.16em] text-cw-ink cursor-pointer"
                                    >
                                        Email me when new sites open up
                                    </Label>
                                    <p className="font-italic-serif text-[14px] italic text-cw-ink-soft">
                                        One email per cycle with any new matches for your watchlist.
                                    </p>
                                </div>
                            </div>

                            {/* Frequency select */}
                            <div className="space-y-2 mb-6">
                                <Label
                                    htmlFor="notif-frequency"
                                    className="font-mono-field text-[12px] font-bold uppercase tracking-[0.16em] text-cw-clay"
                                >
                                    Check frequency
                                </Label>
                                <Select
                                    value={String(notifFrequency)}
                                    onValueChange={(v) => setNotifFrequency(Number(v) as Frequency)}
                                    disabled={!notifEnabled}
                                >
                                    <SelectTrigger id="notif-frequency" className="max-w-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="5">Every 5 minutes</SelectItem>
                                        <SelectItem value="15">Every 15 minutes</SelectItem>
                                        <SelectItem value="60">Every hour</SelectItem>
                                        <SelectItem value="240">Every 4 hours</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="font-italic-serif text-[14px] italic text-cw-ink-soft">
                                    The notifier runs every 5 minutes. Faster cadence = faster alerts.
                                </p>
                            </div>

                            {/* Default scope select */}
                            <div className="space-y-2 mb-6">
                                <Label
                                    htmlFor="notif-scope"
                                    className="font-mono-field text-[12px] font-bold uppercase tracking-[0.16em] text-cw-clay"
                                >
                                    Default scope for new campgrounds
                                </Label>
                                <Select
                                    value={notifScope}
                                    onValueChange={(v) => setNotifScope(v as NotifyScope)}
                                    disabled={!notifEnabled}
                                >
                                    <SelectTrigger id="notif-scope" className="max-w-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(["favorites", "worthwhile", "all"] as const).map((s) => (
                                            <SelectItem key={s} value={s}>
                                                {SCOPE_LABELS[s].label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="font-italic-serif text-[14px] italic text-cw-ink-soft">
                                    {SCOPE_LABELS[notifScope].hint} Each campground can override
                                    this in its settings.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={saveNotifications}
                                disabled={!notifDirty || savingNotif}
                                className="inline-flex items-center font-mono-field text-[13px] font-bold leading-none uppercase tracking-[0.14em] cursor-pointer rounded-[2px] px-[13px] py-[9px] border-[1.5px] disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{
                                    background: "var(--cw-ink)",
                                    color: "var(--cw-cream)",
                                    borderColor: "var(--cw-ink)",
                                }}
                            >
                                {savingNotif ? "Saving…" : "Save notifications"}
                            </button>
                        </section>

                        {/* Danger zone section */}
                        <section className="rounded-md border border-red-700/40 bg-cw-cream p-6 sm:p-8">
                            <div className="font-mono-field text-[13px] font-bold uppercase tracking-[0.18em] text-red-700 mb-2">
                                Danger zone
                            </div>
                            <h2 className="font-poster text-[28px] font-black uppercase tracking-[0.005em] mb-1">
                                Delete account
                            </h2>
                            <p className="font-italic-serif text-[18px] italic leading-[1.3] text-cw-ink-soft mb-6">
                                This removes your profile and watchlist permanently.
                            </p>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <button
                                        type="button"
                                        className="inline-flex items-center font-mono-field text-[13px] font-bold leading-none uppercase tracking-[0.14em] cursor-pointer rounded-[2px] px-[13px] py-[9px] border-[1.5px] bg-cw-cream text-red-700 border-red-700"
                                    >
                                        Delete account
                                    </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This removes your profile and any watchlist data. This cannot be
                                            undone.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={deleteAccount}
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                            Delete forever
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </section>
                    </div>
                </div>
            </main>
        </>
    );
}
