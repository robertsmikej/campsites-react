# Phase 3: Public Landing + /discover + /app/admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CampWatch becomes a "real product" — anonymous visitors get a credible public face (landing page + read-only discovery view of the curated list), signed-in users can build their list from `/discover`, and curators can manage who else is a curator from `/app/admin`. After this, the product feels finished from a structural standpoint; Phases 4 and 5 are polish + scale.

**Three deliverables (all independent):**

1. **`/` public landing page** — replaces the Phase 0a hero placeholder. Hero, sample campground cards, 3-step "how it works", footer. SSR for SEO.
2. **`/discover`** — public read-only view of the curated default. Each card has an "Add to my list" button that prompts sign-in if needed.
3. **`/app/admin`** — curator-only dashboard. Lists all users, lets a curator grant/revoke the `curator` role on others, links to "Edit the curated default list" (the same Configure Sites dialog, but in "default mode" — writes to `/api/default` instead of the user's own list).

**Architecture:**

```
                      Anonymous visitor
                            |
                            ▼
                +-----------------------------+
                |  / (SSR landing page)        |
                |  - Hero + CTA "Sign in"      |
                |  - Sample cards (static)     |
                |  - How it works              |
                |  - Footer                    |
                +-----------------------------+
                            |
              Optional: "Browse picks" link
                            ▼
                +-----------------------------+
                |  /discover (public read)     |
                |  - Reads /api/default        |
                |  - Cards with "Add to my     |
                |    list" → sign-in or POST   |
                |    /api/users/me/campgrounds |
                |    /items                    |
                +-----------------------------+

                      Signed-in curator
                            |
                            ▼
                +-----------------------------+
                |  /app/admin                  |
                |  - GET /api/admin/users      |
                |  - PUT /api/admin/users/...  |
                |    /roles                    |
                |  - "Edit default list" opens |
                |    SiteConfigDialog in mode  |
                |    'default'                 |
                +-----------------------------+
```

**Non-goals:**
- Public list-sharing (one user's list visible to others). Deferred.
- Granular per-campground notification rules. Phase 5 will revisit notifications.
- Mobile-app shell or PWA install prompts.

**Tech Stack:** No new technology. Next.js Route Handlers, shadcn primitives, Tailwind.

**Pre-conditions:** Phase 2 merged. `useAuth`, `useUserCampgrounds`, `/api/default`, `/api/users/me/campgrounds`, and the existing curator-bootstrap pieces all work.

---

## Pre-flight

### Task 0: Branch + state check

- [ ] **Step 1: Branch from main**

```bash
cd "/Users/mikeroberts/Library/Mobile Documents/com~apple~CloudDocs/Desktop/Websites/campsites-react"
git checkout main && git pull --ff-only
git checkout -b feature/phase-3-landing-discover-admin
git status -s
```

- [ ] **Step 2: Confirm `next/` is green**

```bash
cd next && pnpm install --frozen-lockfile && pnpm test 2>&1 | tail -3 && pnpm exec tsc --noEmit && pnpm run cf:build 2>&1 | tail -3
```

Expected: 166 tests pass, tsc clean, cf:build complete.

---

## Section A: Admin API

### Task A1: GET /api/admin/users

**Files:**
- Create: `next/src/app/api/admin/users/route.ts`
- Test: `next/src/app/api/admin/users/route.test.ts`

Behavior:
- 401 if no session.
- 403 if the requester isn't a curator (`getUserProfile(session.email).roles.includes("curator") === false`).
- Returns `{ users: UserProfile[] }` — every user profile in KV (prefix scan for `user:*:profile`).

Response shape uses the existing `UserProfile` type. Sort by `createdAt` ascending for stable output.

Implementation (sketch):

```ts
import { readSession } from "@/lib/sessions";
import { getKv } from "@/lib/cloudflare";
import { getUserProfile } from "@/lib/users";
import { jsonResponse, withCors } from "@/lib/responses";
import type { UserProfile } from "@/types/user";

async function listAllUsers(): Promise<UserProfile[]> {
    const kv = getKv();
    const profiles: UserProfile[] = [];
    let cursor: string | undefined;
    do {
        const list = await kv.list({ prefix: "user:", cursor });
        for (const key of list.keys) {
            if (!key.name.endsWith(":profile")) continue;
            const profile = (await kv.get(key.name, "json")) as UserProfile | null;
            if (profile?.email) profiles.push(profile);
        }
        cursor = list.list_complete ? undefined : list.cursor;
    } while (cursor);
    profiles.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
    return profiles;
}

export async function GET(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    const me = await getUserProfile(session.email);
    if (!me?.roles?.includes("curator")) {
        return withCors(jsonResponse({ error: "Forbidden" }, 403));
    }

    const users = await listAllUsers();
    return withCors(jsonResponse({ users }));
}
```

**Tests** (with the `vi.mock` pattern for `@/lib/sessions` + `@/lib/cloudflare`):

- 401 unauth.
- 403 signed-in but not curator.
- 200 with the list of profiles, sorted by createdAt. Verify non-profile keys (sessions, campground records) are filtered out.

Commit:
```
git add next/src/app/api/admin/users/
git commit -m "Add GET /api/admin/users (curator-only) listing all profiles"
```

### Task A2: PUT /api/admin/users/[email]/roles

**Files:**
- Create: `next/src/app/api/admin/users/[email]/roles/route.ts`
- Test: `next/src/app/api/admin/users/[email]/roles/route.test.ts`

Behavior:
- 401 if no session.
- 403 if requester isn't a curator.
- Path param: `email` (URL-encoded). The route handler reads it via the second arg `{ params }`.
- Body: `{ roles: UserRole[] }`. Validate that every element is a known role (currently just `"curator"`).
- 404 if the target user profile doesn't exist.
- **Guard against orphaning curators**: if the request would remove the curator role from the LAST curator, reject with 400 `{ error: "Cannot remove the last curator" }`. This prevents accidentally locking the project out of admin access.
- Update the target user's profile via `updateUserProfile(targetEmail, { roles })`. Return the updated profile (200).

Next.js App Router signature:

```ts
import type { NextRequest } from "next/server";

interface RouteContext {
    params: Promise<{ email: string }>;
}

export async function PUT(request: NextRequest, context: RouteContext): Promise<Response> {
    const { email: emailParam } = await context.params;
    const targetEmail = decodeURIComponent(emailParam).toLowerCase();
    // ... rest
}
```

Implementation (sketch):

```ts
import { readSession } from "@/lib/sessions";
import { getUserProfile, updateUserProfile, listCurators } from "@/lib/users";
import { jsonResponse, withCors } from "@/lib/responses";
import type { UserRole } from "@/types/user";

const VALID_ROLES: readonly UserRole[] = ["curator"];

function isValidRoles(value: unknown): value is UserRole[] {
    if (!Array.isArray(value)) return false;
    return value.every((r) => VALID_ROLES.includes(r as UserRole));
}

export async function PUT(
    request: Request,
    context: { params: Promise<{ email: string }> },
): Promise<Response> {
    const { email: emailParam } = await context.params;
    const targetEmail = decodeURIComponent(emailParam).toLowerCase();

    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    const me = await getUserProfile(session.email);
    if (!me?.roles?.includes("curator")) {
        return withCors(jsonResponse({ error: "Forbidden" }, 403));
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return withCors(jsonResponse({ error: "Invalid JSON" }, 400));
    }

    const roles = (body as { roles?: unknown })?.roles;
    if (!isValidRoles(roles)) {
        return withCors(jsonResponse({ error: "Body must include roles: UserRole[]" }, 400));
    }

    const target = await getUserProfile(targetEmail);
    if (!target) return withCors(jsonResponse({ error: "User not found" }, 404));

    const removingCurator = target.roles?.includes("curator") && !roles.includes("curator");
    if (removingCurator) {
        const curators = await listCurators();
        if (curators.length <= 1 && curators.includes(targetEmail)) {
            return withCors(
                jsonResponse({ error: "Cannot remove the last curator" }, 400),
            );
        }
    }

    const updated = await updateUserProfile(targetEmail, { roles });
    return withCors(jsonResponse(updated));
}
```

**Tests:**
- 401 unauth.
- 403 non-curator.
- 400 invalid body (missing roles, non-array, invalid role string).
- 404 target email doesn't exist.
- 400 last-curator removal.
- 200 happy path: grant curator on a non-curator.
- 200 happy path: revoke curator when more than one curator exists.

Commit:
```
git add next/src/app/api/admin/users/
git commit -m "Add PUT /api/admin/users/[email]/roles with last-curator guard"
```

---

## Section B: Discover (public) + add-to-list API

### Task B1: POST /api/users/me/campgrounds/items

This is the "Add this campground to my list" endpoint used by `/discover`. Takes a campground ID; copies that entry from the curated default into the user's list (idempotent — if the user already has it, no-op).

**Files:**
- Create: `next/src/app/api/users/me/campgrounds/items/route.ts`
- Test: `next/src/app/api/users/me/campgrounds/items/route.test.ts`

Behavior:
- 401 if no session.
- POST body: `{ id: string }`. 400 if missing.
- Read curated default from KV (`config:campgrounds`). If empty, 404 with `{ error: "No default config to copy from" }`.
- Find the campground with matching ID in the default's `recreation.gov` array. 404 if not found.
- Read user's existing campgrounds. If user already has this ID, return 200 with `{ message: "Already in your list" }` and the unchanged record.
- Append the campground to the user's list. Call `putUserCampgrounds(email, ...)`. Return the updated record (200).

Implementation:

```ts
import { readSession } from "@/lib/sessions";
import { getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { getUserCampgrounds, putUserCampgrounds } from "@/lib/user-campgrounds";
import { getSitewideDefaultSettings } from "@/lib/settings";
import type { Campground, SiteConfig, GlobalSettings } from "@/types/campground";

interface DefaultConfig {
    campgrounds: SiteConfig;
    globalSettings?: GlobalSettings;
}

export async function POST(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return withCors(jsonResponse({ error: "Invalid JSON" }, 400));
    }
    const id = (body as { id?: unknown })?.id;
    if (typeof id !== "string" || !id) {
        return withCors(jsonResponse({ error: "Body must include id: string" }, 400));
    }

    const def = (await getKv().get("config:campgrounds", "json")) as DefaultConfig | null;
    if (!def?.campgrounds) {
        return withCors(jsonResponse({ error: "No default config to copy from" }, 404));
    }

    const fromDefault: Campground | undefined = def.campgrounds["recreation.gov"]?.find(
        (c) => c.id === id,
    );
    if (!fromDefault) {
        return withCors(jsonResponse({ error: "Campground not in default list" }, 404));
    }

    const existing = await getUserCampgrounds(session.email);
    const userCampgrounds = existing?.campgrounds ?? { "recreation.gov": [] };
    const userGlobalSettings: GlobalSettings = existing?.globalSettings ?? {
        stayLengths: getSitewideDefaultSettings({}).dates.stayLengths,
        validStartDays: getSitewideDefaultSettings({}).dates.validStartDays,
    };

    const already = userCampgrounds["recreation.gov"].some((c) => c.id === id);
    if (already) {
        return withCors(
            jsonResponse({
                message: "Already in your list",
                campgrounds: userCampgrounds,
                globalSettings: userGlobalSettings,
                updatedAt: existing?.updatedAt ?? null,
            }),
        );
    }

    const next: SiteConfig = {
        "recreation.gov": [...userCampgrounds["recreation.gov"], fromDefault],
    };
    const stored = await putUserCampgrounds(session.email, {
        campgrounds: next,
        globalSettings: userGlobalSettings,
    });
    return withCors(jsonResponse(stored));
}
```

**Tests:**
- 401 unauth.
- 400 missing id.
- 404 KV has no default config.
- 404 id not in default list.
- 200 happy path: append + return updated record.
- 200 idempotent: id already in user's list → no-op response.

Commit:
```
git add next/src/app/api/users/me/campgrounds/items/
git commit -m "Add POST /api/users/me/campgrounds/items (add single campground)"
```

### Task B2: `/discover` page

**Files:**
- Create: `next/src/app/discover/page.tsx`
- Create: `next/src/components/discover-card.tsx`

`/discover` is a public page that fetches `/api/default` server-side (SSR — good for SEO + fast first paint) and renders one card per campground. Each card has:

- The campground image (from `image` field; fallback to a generated gradient if missing)
- Name + area + type badge (reuse `getTypeBadge` from Phase 0c)
- Description
- One-line stat: how many sites the curator's marked as favorites
- An "Add to my list" button:
  - If signed in: POSTs `/api/users/me/campgrounds/items` with the campground ID; on success toast "Added to your list"; on conflict toast "Already in your list".
  - If anonymous: redirects to `/auth/google/start?returnTo=/discover`.

Server component for the page:

```tsx
// next/src/app/discover/page.tsx
import { Suspense } from "react";
import { Metadata } from "next";
import { DiscoverList } from "@/components/discover-list";
import type { ApiConfigResponse } from "@/types/campground";

export const metadata: Metadata = {
    title: "Browse picks — CampWatch",
    description: "Browse a curated list of campgrounds you can add to your CampWatch watchlist.",
};

async function fetchDefaultConfig(): Promise<ApiConfigResponse | null> {
    // Use a same-origin fetch. At deploy time on Cloudflare Workers, this becomes
    // an internal subrequest with no extra cost.
    const url = new URL("/api/default", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
    try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) return null;
        return (await response.json()) as ApiConfigResponse;
    } catch {
        return null;
    }
}

export default async function DiscoverPage() {
    const data = await fetchDefaultConfig();
    return (
        <main className="container mx-auto max-w-5xl px-4 py-8 sm:py-12">
            <header className="mb-8 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Curated picks
                </p>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    Campgrounds the curator is watching
                </h1>
                <p className="max-w-2xl text-muted-foreground">
                    These are the campgrounds set up on CampWatch&apos;s shared list. Sign in to add
                    any of them to your own watchlist.
                </p>
            </header>
            <DiscoverList data={data} />
        </main>
    );
}
```

`next/src/components/discover-list.tsx` (client component for the "Add to list" interactivity):

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTypeBadge } from "@/components/campground/type-badge";
import type { ApiConfigResponse, Campground } from "@/types/campground";

interface DiscoverListProps {
    data: ApiConfigResponse | null;
}

export function DiscoverList({ data }: DiscoverListProps) {
    const auth = useAuth();
    const [busyId, setBusyId] = useState<string | null>(null);

    if (!data) {
        return (
            <p className="text-sm text-muted-foreground">
                The curator hasn&apos;t published a list yet. Check back soon.
            </p>
        );
    }

    const campgrounds = data.campgrounds["recreation.gov"] ?? [];

    async function handleAdd(c: Campground) {
        if (!auth.user) {
            window.location.href = "/auth/google/start?returnTo=/discover";
            return;
        }
        setBusyId(c.id);
        try {
            const response = await fetch("/api/users/me/campgrounds/items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: c.id }),
                credentials: "include",
            });
            if (!response.ok) {
                toast.error(`Couldn't add ${c.name}`);
                return;
            }
            const result = (await response.json()) as { message?: string };
            toast.success(result.message === "Already in your list"
                ? `${c.name} is already in your list`
                : `${c.name} added to your list`);
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {campgrounds.map((c) => {
                const badge = getTypeBadge(c);
                return (
                    <Card key={c.id} className="overflow-hidden">
                        <CardContent className="space-y-3 p-4">
                            <div className="flex items-center gap-2">
                                <badge.Icon className="size-5" style={{ color: badge.color }} aria-hidden />
                                <h3 className="text-base font-semibold">{c.name}</h3>
                            </div>
                            {c.area ? <Badge variant="secondary">{c.area}</Badge> : null}
                            {c.description ? (
                                <p className="text-sm text-muted-foreground">{c.description}</p>
                            ) : null}
                            <Button
                                size="sm"
                                onClick={() => handleAdd(c)}
                                disabled={busyId === c.id}
                                className="w-full"
                            >
                                {busyId === c.id ? "Adding…" : "Add to my list"}
                            </Button>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
```

Update the page to import the client component:

```tsx
import { DiscoverList } from "@/components/discover-list";
```

Commit:
```
git add next/src/app/discover/ next/src/components/discover-list.tsx
git commit -m "Add /discover public read-only view of the curator's list"
```

---

## Section C: Admin UI

### Task C1: Admin page shell + user list

**Files:**
- Create: `next/src/app/app/admin/page.tsx`
- Create: `next/src/components/admin/users-table.tsx`

Page is a client component. Uses `useAuth()` to verify curator status; if not curator, render a polite "Curator access only" page.

The user list table shows:

| Email | Name | Roles | Member since | Actions |
|---|---|---|---|---|
| user@example.com | User Name | curator / — | 2026-05-15 | [Toggle curator] |

Use shadcn `Table`. The "Toggle curator" button calls `PUT /api/admin/users/<email>/roles` with the new role array. Disable the button for the current user (don't let curators demote themselves accidentally — the server-side guard catches the last-curator case, but UX-wise it's clearer to prevent the action).

Page shell:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UsersTable } from "@/components/admin/users-table";
import type { UserProfile } from "@/types/user";

export default function AdminPage() {
    const auth = useAuth();
    const [users, setUsers] = useState<UserProfile[] | null>(null);
    const [usersError, setUsersError] = useState(false);

    useEffect(() => {
        if (!auth.user || !auth.isCurator) return;
        let cancelled = false;
        (async () => {
            try {
                const r = await fetch("/api/admin/users", { credentials: "include" });
                if (!r.ok) {
                    setUsersError(true);
                    return;
                }
                const data = (await r.json()) as { users: UserProfile[] };
                if (!cancelled) setUsers(data.users);
            } catch {
                if (!cancelled) setUsersError(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [auth.user, auth.isCurator]);

    if (auth.isLoading) {
        return (
            <main className="container mx-auto max-w-4xl p-6">
                <Skeleton className="h-8 w-48" />
            </main>
        );
    }

    if (!auth.user || !auth.isCurator) {
        return (
            <main className="container mx-auto max-w-2xl p-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Curator access only</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-muted-foreground">
                        <p>This page is for curators. If you should be a curator, ask one to grant you the role.</p>
                        <Link className="underline" href="/app">
                            Back to dashboard
                        </Link>
                    </CardContent>
                </Card>
            </main>
        );
    }

    async function toggleRole(target: UserProfile, makeCurator: boolean) {
        const nextRoles = makeCurator
            ? Array.from(new Set([...(target.roles ?? []), "curator"])) as UserProfile["roles"]
            : (target.roles ?? []).filter((r) => r !== "curator");
        const r = await fetch(`/api/admin/users/${encodeURIComponent(target.email)}/roles`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roles: nextRoles }),
            credentials: "include",
        });
        if (!r.ok) {
            const body = (await r.json().catch(() => ({}))) as { error?: string };
            toast.error(body.error ?? `Update failed (${r.status})`);
            return;
        }
        const updated = (await r.json()) as UserProfile;
        setUsers((current) =>
            current?.map((u) => (u.email === updated.email ? updated : u)) ?? null,
        );
        toast.success(`Updated ${target.email}`);
    }

    return (
        <main className="container mx-auto max-w-5xl space-y-6 p-6">
            <header className="flex items-end justify-between gap-2">
                <div>
                    <Link href="/app" className="text-sm text-muted-foreground hover:underline">
                        ← Back to dashboard
                    </Link>
                    <h1 className="mt-1 text-2xl font-semibold">Curator dashboard</h1>
                </div>
            </header>

            <Card>
                <CardHeader>
                    <CardTitle>Users</CardTitle>
                </CardHeader>
                <CardContent>
                    {usersError ? (
                        <p className="text-sm text-destructive">Couldn&apos;t load users.</p>
                    ) : users === null ? (
                        <Skeleton className="h-32 w-full" />
                    ) : (
                        <UsersTable users={users} currentEmail={auth.user.email} onToggleRole={toggleRole} />
                    )}
                </CardContent>
            </Card>

            {/* Edit default list section comes in Task C2/C3 */}
        </main>
    );
}
```

`<UsersTable />`: simple shadcn `Table` rendering one row per user, with a Switch in the Actions column to flip curator on/off. Disable the row's switch when `user.email === currentEmail`. Include a tooltip "You can't change your own role" on disabled switches.

Commit:
```
git add next/src/app/app/admin/page.tsx next/src/components/admin/users-table.tsx
git commit -m "Add /app/admin user list with curator role toggle"
```

### Task C2: Wire "Edit default list" into the admin page

**Files:**
- Modify: `next/src/components/site-config-dialog/types.ts` (add `mode` prop)
- Modify: `next/src/components/site-config-dialog/index.tsx` (route save through the right endpoint based on `mode`)
- Modify: `next/src/app/app/admin/page.tsx` (add a button that opens the dialog in `mode="default"`)

Today, the dialog calls `onSave(config, globalSettings)` and the parent decides what to do with it. We can keep that contract — the admin page passes a different `onSave` that PUTs to `/api/default` instead of `/api/users/me/campgrounds`. No `mode` prop is strictly necessary if the parent owns the save behavior.

So the change is:

1. Move the "Edit default list" button to the admin page.
2. State on the admin page: `isDefaultDialogOpen` + the dialog config that was last loaded from `/api/default`.
3. On open: GET `/api/default`, populate the dialog's `initialData`.
4. On save: PUT to `/api/default` with the new config + globalSettings (curator-only — server-side check is the load-bearing one).

Add to `/app/admin/page.tsx`:

```tsx
import { useMemo, useState } from "react";
import { SiteConfigDialog } from "@/components/site-config-dialog";
import { getCampgroundOptions } from "@/data/sites";
import type { SiteConfig, GlobalSettings } from "@/types/campground";

// ... inside the AdminPage component, after the users state:

const [defaultDialogOpen, setDefaultDialogOpen] = useState(false);
const [defaultConfig, setDefaultConfig] = useState<SiteConfig | null>(null);
const [defaultGlobalSettings, setDefaultGlobalSettings] = useState<GlobalSettings | null>(null);
const catalogOptions = useMemo(() => getCampgroundOptions(), []);

async function openDefaultDialog() {
    try {
        const r = await fetch("/api/default", { credentials: "include" });
        if (!r.ok) {
            toast.error("Couldn't load the default list");
            return;
        }
        const data = (await r.json()) as { campgrounds: SiteConfig; globalSettings?: GlobalSettings };
        setDefaultConfig(data.campgrounds);
        setDefaultGlobalSettings(
            data.globalSettings ?? { stayLengths: [2, 3, 4, 5], validStartDays: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"] },
        );
        setDefaultDialogOpen(true);
    } catch {
        toast.error("Couldn't load the default list");
    }
}

async function saveDefault(config: SiteConfig, settings: GlobalSettings) {
    const r = await fetch("/api/default", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campgrounds: config, globalSettings: settings }),
        credentials: "include",
    });
    if (!r.ok) {
        toast.error("Save failed");
        return;
    }
    toast.success("Default list saved");
    setDefaultDialogOpen(false);
}

// ... and in the JSX, add a Card with a Button below the Users table:

<Card>
    <CardHeader>
        <CardTitle>Default campground list</CardTitle>
    </CardHeader>
    <CardContent className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">
            The list new users see on /discover and can clone as their starting watchlist.
        </p>
        <Button onClick={openDefaultDialog}>Edit default list</Button>
    </CardContent>
</Card>

{defaultConfig && defaultGlobalSettings ? (
    <SiteConfigDialog
        open={defaultDialogOpen}
        onClose={() => setDefaultDialogOpen(false)}
        onSave={(config, settings) => {
            saveDefault(config, settings);
        }}
        onResetToDefaults={() => undefined}
        initialData={defaultConfig}
        catalogOptions={catalogOptions}
        globalSettings={defaultGlobalSettings}
        availableSites={{}}
        useMockData={false}
        onToggleMockData={() => undefined}
    />
) : null}
```

If `SiteConfigDialogProps` still has `useLocalConfig`/`onToggleUseLocalConfig` props somehow (it shouldn't after Phase 2 D4), drop them. Verify with `cd next && pnpm exec tsc --noEmit` before committing.

Commit:
```
git add next/src/app/app/admin/page.tsx
git commit -m "Add 'Edit default list' affordance to /app/admin"
```

### Task C3: Surface admin link in the TopBar avatar menu (curators only)

**Files:**
- Modify: `next/src/components/top-bar.tsx`

The TopBar already gets `auth: AuthState`. If `auth.isCurator`, add a `Curator dashboard` link above (or below) `Account` in the avatar menu, pointing to `/app/admin`.

Use a lucide `Shield` or `Crown` icon. Verify `tsc` is clean.

Commit:
```
git add next/src/components/top-bar.tsx
git commit -m "Surface 'Curator dashboard' link in TopBar avatar menu for curators"
```

---

## Section D: Public landing page rebuild

### Task D1: New `/` landing page

**Files:**
- Modify: `next/src/app/page.tsx`

Three-section landing:

1. **Hero** — full-bleed background (gradient for now; image can be added in a follow-up), centered headline + sub-headline + two CTAs ("Sign in with Google" → `/auth/google/start?returnTo=/app`; "Browse picks" → `/discover`).
2. **Sample cards row** — three static example cards in the new visual language. Decorative; doesn't need real data.
3. **How it works** — three-step illustration. Use lucide icons (`Tent`, `CalendarRange`, `Mail`).

Plus a small footer at the bottom: "Built by a camper, for campers" + a link to the GitHub repo (`https://github.com/robertsmikej/campsites-react`).

Implementation (replaces the Phase 0a hero placeholder):

```tsx
import Link from "next/link";
import { Tent, CalendarRange, Mail, ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function HomePage() {
    return (
        <main className="bg-background text-foreground">
            <Hero />
            <SampleCards />
            <HowItWorks />
            <Footer />
        </main>
    );
}

function Hero() {
    return (
        <section className="relative overflow-hidden">
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-emerald-50 via-emerald-50/40 to-background dark:from-emerald-950/30 dark:via-emerald-950/10" />
            <div className="container mx-auto flex max-w-4xl flex-col items-center px-6 py-24 text-center sm:py-32">
                <Tent className="mb-6 size-12 text-emerald-600" aria-hidden />
                <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
                    Never miss a campsite opening at your favorite spots.
                </h1>
                <p className="mt-4 max-w-2xl text-balance text-lg text-muted-foreground">
                    CampWatch checks recreation.gov every 15 minutes and emails you when the sites you actually want come available.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <Button size="lg" asChild>
                        <Link href="/auth/google/start?returnTo=/app">
                            Sign in with Google
                            <ArrowRight className="ml-1 size-4" />
                        </Link>
                    </Button>
                    <Button variant="outline" size="lg" asChild>
                        <Link href="/discover">Browse picks</Link>
                    </Button>
                </div>
            </div>
        </section>
    );
}

function SampleCards() {
    const examples: Array<{ name: string; area: string; status: string; tone: "success" | "warn" }> = [
        { name: "Outlet Campground", area: "Redfish Lake, ID", status: "3 sites open Aug 18-21", tone: "success" },
        { name: "Pine Flats", area: "Lowman, ID", status: "1 site open Jul 5", tone: "success" },
        { name: "Stanley Lake", area: "Stanley, ID", status: "Watching", tone: "warn" },
    ];
    return (
        <section className="container mx-auto max-w-5xl px-6 py-16 sm:py-20">
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-emerald-700">
                What your dashboard looks like
            </p>
            <h2 className="mb-8 text-center text-2xl font-semibold sm:text-3xl">Your watchlist, one glance</h2>
            <div className="grid gap-4 sm:grid-cols-3">
                {examples.map((e) => (
                    <Card key={e.name}>
                        <CardContent className="space-y-3 p-5">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h3 className="text-base font-medium">{e.name}</h3>
                                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                        <MapPin className="size-3" />
                                        {e.area}
                                    </p>
                                </div>
                                <Badge variant={e.tone === "success" ? "default" : "secondary"}>
                                    {e.tone === "success" ? "Open" : "Watching"}
                                </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{e.status}</p>
                            <div className="h-1.5 w-full rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                                <div className="h-full w-2/3 rounded-full bg-emerald-500" />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </section>
    );
}

function HowItWorks() {
    const steps: Array<{ icon: React.ReactNode; title: string; body: string }> = [
        { icon: <Tent />, title: "Pick your campgrounds", body: "Add any campground on recreation.gov to your watchlist." },
        { icon: <CalendarRange />, title: "Set your filters", body: "Choose date ranges, stay lengths, and which days of the week you'll start." },
        { icon: <Mail />, title: "Get notified", body: "We email you the moment a site that fits opens up. Cancellations included." },
    ];
    return (
        <section className="border-t bg-muted/30 py-16 sm:py-20">
            <div className="container mx-auto max-w-5xl px-6">
                <h2 className="mb-10 text-center text-2xl font-semibold sm:text-3xl">How it works</h2>
                <div className="grid gap-8 sm:grid-cols-3">
                    {steps.map((s, i) => (
                        <div key={i} className="flex flex-col items-start">
                            <div className="mb-3 inline-flex size-10 items-center justify-center rounded-full bg-emerald-600 text-white">
                                <span className="[&>svg]:size-5" aria-hidden>{s.icon}</span>
                            </div>
                            <h3 className="text-base font-medium">{s.title}</h3>
                            <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function Footer() {
    return (
        <footer className="border-t py-8">
            <div className="container mx-auto flex max-w-5xl flex-col items-center gap-2 px-6 text-center text-sm text-muted-foreground">
                <p>Built by a camper, for campers.</p>
                <a
                    href="https://github.com/robertsmikej/campsites-react"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-2 hover:underline"
                >
                    Source on GitHub
                </a>
            </div>
        </footer>
    );
}
```

The TopBar isn't shown on `/` — the landing is its own self-contained page. (If you do want the TopBar there for navigation consistency, wrap the page in a layout that includes it; not required for v1.)

Commit:
```
git add next/src/app/page.tsx
git commit -m "Rebuild / landing page with hero, sample cards, how it works"
```

---

## Section E: Deploy + smoke + PR

### Task E1: Push and watch CI

```bash
git push -u origin feature/phase-3-landing-discover-admin
gh run watch --exit-status
```

### Task E2: Live smoke

```bash
NEW="https://campwatch.mikeroberts421.workers.dev"

echo "=== / loads (200, contains new hero copy) ==="
curl -sI $NEW/ | head -1
curl -s $NEW/ | grep -oE "Never miss a campsite opening at your favorite spots" | head -1

echo "=== /discover loads (200, lists campgrounds in SSR HTML) ==="
curl -s -o /dev/null -w "%{http_code}\n" $NEW/discover
curl -s $NEW/discover | grep -oE "Curated picks|Campgrounds the curator" | head -2

echo "=== /api/admin/users unauth → 401 ==="
curl -s -o /dev/null -w "%{http_code}\n" $NEW/api/admin/users

echo "=== /api/admin/users/test@example.com/roles unauth → 401 ==="
curl -s -o /dev/null -w "%{http_code}\n" -X PUT $NEW/api/admin/users/test%40example.com/roles \
    -H "Content-Type: application/json" -d '{"roles":["curator"]}'

echo "=== /api/users/me/campgrounds/items unauth → 401 ==="
curl -s -o /dev/null -w "%{http_code}\n" -X POST $NEW/api/users/me/campgrounds/items \
    -H "Content-Type: application/json" -d '{"id":"232358"}'

echo "=== /app/admin anonymous → 307 to /auth/google/start (middleware) ==="
curl -sI $NEW/app/admin | grep -iE "^HTTP|^location" | head -2 | sed -E 's#(returnTo=)[^&]*#\1<REDACTED>#'
```

Expected: 200, presence checks pass; 401 for admin/items endpoints unauth; 307 redirect on `/app/admin` anonymous.

### Task E3: Manual browser walk-through

1. Open https://campwatch.mikeroberts421.workers.dev/ — landing page renders with hero, sample cards, how it works, footer.
2. Click "Browse picks" → `/discover` shows the curated campgrounds as cards. Click "Add to my list" while anonymous → redirected to Google sign-in → back to /discover.
3. Click "Add to my list" again while signed in → toast "Added to your list" (or "Already in your list" if it's a repeat).
4. Visit /app → confirm the new campground is in your dashboard.
5. As a curator (you have the bootstrap role), open avatar menu → "Curator dashboard" link appears → navigate to /app/admin.
6. The Users table shows every user that's signed in so far. Toggle curator on a second test user; the row updates.
7. Click "Edit default list" → SiteConfigDialog opens with the current `/api/default` data. Make a small change, Save → toast confirms, KV `config:campgrounds` is updated, `/discover` reflects the change on reload.
8. As a non-curator, navigate to /app/admin → "Curator access only" page renders. Try to PUT to `/api/admin/users/<other-email>/roles` via devtools fetch → 403.

### Task E4: Open PR

```bash
gh pr create --base main --head feature/phase-3-landing-discover-admin \
    --title "Phase 3: Landing page + /discover + /app/admin" \
    --body "..."
```

PR body covers:
- New `/` landing (hero, sample cards, how it works, footer)
- New `/discover` public read-only view with "Add to my list" buttons
- New `/app/admin` curator dashboard with user role management and "Edit default list"
- New endpoints: `GET /api/admin/users`, `PUT /api/admin/users/[email]/roles` (with last-curator guard), `POST /api/users/me/campgrounds/items`
- TopBar avatar menu surfaces "Curator dashboard" for curators
- Live smoke results

---

## Self-review checklist

- [ ] Server-side auth checks on every admin endpoint (`/api/admin/*`) — not just client-side.
- [ ] Last-curator removal blocked at API level + UX (can't toggle yourself).
- [ ] `/app/admin` is gated by middleware (cookie) AND client-side `isCurator` check (renders "Curator access only" page for signed-in non-curators).
- [ ] `/discover` is server-rendered for SEO; campground cards visible in raw HTML response.
- [ ] "Add to my list" handles anonymous → sign-in redirect cleanly. Doesn't pop a modal or do anything weird.
- [ ] The Configure Sites dialog can save to `/api/default` when opened from the admin page (parent owns the save behavior; no new `mode` prop required).
- [ ] No new dependency installations. All UI uses existing shadcn primitives.
- [ ] Phase 0d cutover already moved production to the campwatch Worker, so deployment is straightforward.

## Future phases reminder

- **Phase 4**: rec.gov-ID paste flow for adding campgrounds in the dialog. Retires `campgroundCatalog.js` as a runtime source.
- **Phase 5**: notifier rewire — reads per-user lists, deduplicates campground fetches across users, sends per-user emails.
