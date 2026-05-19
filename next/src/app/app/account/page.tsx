"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
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

type Frequency = 5 | 15 | 60 | 240;

const DEFAULT_NOTIFICATIONS = { enabled: true, frequencyMinutes: 15 satisfies Frequency };

export default function AccountPage() {
    const auth = useAuth();
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);
    const [notifEnabled, setNotifEnabled] = useState<boolean>(true);
    const [notifFrequency, setNotifFrequency] = useState<Frequency>(15);
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
    }, [auth.user?.notifications?.enabled, auth.user?.notifications?.frequencyMinutes]);

    if (auth.isLoading || !auth.user) {
        return (
            <main className="container mx-auto p-6">
                <p className="text-sm text-muted-foreground">Loading…</p>
            </main>
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
                const body = await response.json().catch(() => ({})) as { error?: string };
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
    const currentNotifFrequency = auth.user.notifications?.frequencyMinutes ?? DEFAULT_NOTIFICATIONS.frequencyMinutes;
    const notifDirty = notifEnabled !== currentNotifEnabled || notifFrequency !== currentNotifFrequency;

    async function saveNotifications() {
        if (!notifDirty) return;
        setSavingNotif(true);
        try {
            const response = await fetch("/api/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    notifications: { enabled: notifEnabled, frequencyMinutes: notifFrequency },
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

    return (
        <main className="container mx-auto max-w-2xl space-y-6 p-6">
            <div>
                <Link href="/app" className="text-sm text-muted-foreground hover:underline">
                    ← Back to dashboard
                </Link>
                <h1 className="mt-2 text-2xl font-semibold">Account settings</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Profile</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="flex items-center gap-4">
                        <Avatar className="size-14">
                            <AvatarImage src={auth.user.picture} alt={auth.user.name} />
                            <AvatarFallback>{auth.user.name?.[0]?.toUpperCase() ?? "?"}</AvatarFallback>
                        </Avatar>
                        <div className="text-sm">
                            <p className="font-medium">{auth.user.email}</p>
                            <p className="text-muted-foreground">Member since {memberSince}</p>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="account-name">Display name</Label>
                        <Input
                            id="account-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Your name"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={saveName} disabled={!dirty || saving}>
                            {saving ? "Saving…" : "Save changes"}
                        </Button>
                        <Button variant="outline" onClick={signOut}>
                            Sign out
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Notifications</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="flex items-start gap-3">
                        <Switch
                            id="notif-enabled"
                            checked={notifEnabled}
                            onCheckedChange={setNotifEnabled}
                        />
                        <div className="flex flex-col">
                            <Label htmlFor="notif-enabled" className="text-sm font-medium">
                                Email me when new sites open up
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                We&apos;ll send one email per cycle with any new matches for your watchlist.
                            </p>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="notif-frequency">Check frequency</Label>
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
                        <p className="text-xs text-muted-foreground">
                            The notifier runs every 5 minutes. Faster cadence = faster alerts.
                        </p>
                    </div>
                    <div>
                        <Button onClick={saveNotifications} disabled={!notifDirty || savingNotif}>
                            {savingNotif ? "Saving…" : "Save notifications"}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Separator />

            <Card className="border-destructive/40">
                <CardHeader>
                    <CardTitle className="text-destructive">Danger zone</CardTitle>
                </CardHeader>
                <CardContent>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive">Delete account</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This removes your profile and any watchlist data. This cannot be undone.
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
                </CardContent>
            </Card>
        </main>
    );
}
