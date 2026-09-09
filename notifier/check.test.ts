import { describe, it, expect, vi, beforeEach } from "vitest";
import { run, runTick } from "./check";
import type { KvAdapter } from "../next/src/lib/recgov/cache";

// Mock the Web Push sender so these tests don't run real crypto; we only assert
// that run() fans out to it for a user with subscriptions + vapid configured.
const { sendWebPushMock } = vi.hoisted(() => ({ sendWebPushMock: vi.fn() }));
vi.mock("./lib/push", () => ({ sendWebPush: sendWebPushMock }));

function stubKv(): KvAdapter {
    return {
        getRaw: vi.fn(async () => null),
        putRaw: vi.fn(async () => {}),
        getSnapshot: vi.fn(async () => null),
        putSnapshot: vi.fn(async () => {}),
        deleteSnapshot: vi.fn(async () => {}),
    };
}

// A curator watching one campground, with notifyScope "all" so any opening
// passes the scope filter. The rec.gov fixture below produces a real match
// (Saturday 2026-07-04, a 2-night stay), so the per-user email branch IS reached
// — letting us prove the dry-run guard short-circuits the send.
const target = {
    email: "boss@example.com",
    roles: ["curator"],
    notifications: { enabled: true, frequencyMinutes: 0 },
    defaultNotifyScope: "all",
    campgrounds: {
        "recreation.gov": [
            {
                id: "232358",
                name: "Outlet",
                enabled: true,
                notifyScope: "all",
                dates: { startDate: "2026-07-01", endDate: "2026-07-10" },
                sites: { favorites: [], worthwhile: [] },
            },
        ],
    },
    globalSettings: { stayLengths: [2], validStartDays: ["Saturday"] },
    notifierState: { signatures: [] },
};

const RECGOV_WITH_MATCH = {
    campsites: {
        "1": {
            site: "001",
            campsite_type: "STANDARD",
            availabilities: {
                "2026-07-04T00:00:00Z": "Available",
                "2026-07-05T00:00:00Z": "Available",
            },
        },
    },
};

function mockFetch(targets: unknown[] = [target]) {
    return vi.fn(async (url: string | URL, _init?: RequestInit) => {
        const u = String(url);
        if (u.includes("/api/admin/notification-targets")) {
            return new Response(JSON.stringify({ targets }), { status: 200 });
        }
        if (u.includes("/api/admin/first-seen")) {
            return new Response(JSON.stringify({}), { status: 200 });
        }
        if (u.includes("/api/openings/recent")) {
            return new Response(JSON.stringify([]), { status: 200 });
        }
        if (u.includes("recreation.gov")) {
            return new Response(JSON.stringify(RECGOV_WITH_MATCH), { status: 200 });
        }
        return new Response("{}", { status: 200 });
    });
}

describe("run() dry-run", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("reaches the email branch on a real match but sends nothing and writes no state", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch() as never); // uses default [target]
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const kv = stubKv();
        // Notify now reads the cache, not rec.gov: serve the match fixture via getRaw.
        kv.getRaw = vi.fn(async (id: string, month: string) =>
            id === "232358" && month === "2026-07" ? (RECGOV_WITH_MATCH as never) : null,
        );

        await run({
            subscriberApiUrl: "https://campwatch.dev",
            subscriberApiSecret: "secret",
            resendApiKey: "re_x",
            siteUrl: "https://campwatch.dev",
            forceEmail: false,
            dryRun: true,
            kvAdapter: kv,
            now: new Date("2026-07-06T00:00:00Z"),
        });

        const calledUrls = fetchSpy.mock.calls.map((c) => String(c[0]));

        // Reads happened.
        expect(calledUrls.some((u) => u.includes("/api/admin/notification-targets"))).toBe(true);

        // The email branch was actually reached (a match existed) but took the
        // dry-run path — proving the send gate works, not just that there was
        // nothing to send.
        expect(logSpy.mock.calls.some((c) => String(c[0]).includes("would email"))).toBe(true);

        // No send and no state-mutating writes. The prior-stats read is a GET on
        // /api/admin/stats and is allowed; only PUT/POST there count as writes.
        expect(calledUrls.some((u) => u.includes("api.resend.com"))).toBe(false);
        const adminWrites = fetchSpy.mock.calls.filter((c) => {
            const u = String(c[0]);
            const method = (c[1] as RequestInit | undefined)?.method ?? "GET";
            const isAdminStatePath =
                u.includes("/api/admin/notifier-state") ||
                u.includes("/api/admin/openings/recent") ||
                u.includes("/api/admin/stats");
            return isAdminStatePath && method !== "GET";
        });
        expect(adminWrites).toHaveLength(0);
        const firstSeenWrites = fetchSpy.mock.calls.filter(
            (c) => String(c[0]).includes("/api/admin/first-seen") && (c[1] as RequestInit)?.method === "PUT",
        );
        expect(firstSeenWrites).toHaveLength(0);

        // Snapshots are intentionally still written in dry-run (they improve the
        // dashboard and are side-effect-safe).
        expect(kv.putSnapshot).toHaveBeenCalled();
    });
});

describe("web push fan-out", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        sendWebPushMock.mockReset();
    });

    it("pushes to each subscription when vapid is configured and there's a new match", async () => {
        sendWebPushMock.mockResolvedValue({ endpoint: "https://push/1", status: 201, gone: false });
        const pushTarget = {
            ...target,
            pushSubscriptions: [
                { endpoint: "https://push/1", keys: { p256dh: "p", auth: "a" }, createdAt: "x" },
            ],
        };
        vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch([pushTarget]) as never);
        vi.spyOn(console, "log").mockImplementation(() => {});
        const kv = stubKv();
        kv.getRaw = vi.fn(async (id: string, month: string) =>
            id === "232358" && month === "2026-07" ? (RECGOV_WITH_MATCH as never) : null,
        );

        await run({
            subscriberApiUrl: "https://campwatch.dev",
            subscriberApiSecret: "secret",
            resendApiKey: "re_x",
            siteUrl: "https://campwatch.dev",
            forceEmail: false,
            dryRun: false,
            kvAdapter: kv,
            now: new Date("2026-07-06T00:00:00Z"),
            vapid: { privateJWK: { kty: "EC" } as never, subject: "mailto:hello@campwatch.dev" },
        });

        expect(sendWebPushMock).toHaveBeenCalledTimes(1);
        expect(sendWebPushMock.mock.calls[0]?.[0]).toMatchObject({ endpoint: "https://push/1" });
        // One push per campground; body leads with the campground name then the
        // site + dates.
        const payload = sendWebPushMock.mock.calls[0]?.[1] as { title: string; body: string; url: string };
        expect(payload.title).toBe("1 new opening");
        expect(payload.body).toContain("Outlet");
        expect(payload.body).toContain("001");
        expect(payload.body).not.toContain("Site 001"); // the word "Site" is dropped
        expect(payload.body).toContain("Jul 4");
        // Not a favorite here (empty favorites) → no star prefix.
        expect(payload.body).not.toContain("★");
        // Lone opening deep-links straight to that site's booking page with dates.
        expect(payload.url).toContain("recreation.gov/camping/campsites/");
        expect(payload.url).toContain("arrivalDate=2026-07-04");
    });

    it("prefixes favorite sites with a star", async () => {
        sendWebPushMock.mockResolvedValue({ endpoint: "https://push/1", status: 201, gone: false });
        const favTarget = {
            ...target,
            campgrounds: {
                "recreation.gov": [
                    {
                        id: "232358",
                        name: "Outlet",
                        enabled: true,
                        notifyScope: "all",
                        dates: { startDate: "2026-07-01", endDate: "2026-07-10" },
                        sites: { favorites: ["001"], worthwhile: [] },
                    },
                ],
            },
            pushSubscriptions: [
                { endpoint: "https://push/1", keys: { p256dh: "p", auth: "a" }, createdAt: "x" },
            ],
        };
        vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch([favTarget]) as never);
        vi.spyOn(console, "log").mockImplementation(() => {});
        const kv = stubKv();
        kv.getRaw = vi.fn(async (id: string, month: string) =>
            id === "232358" && month === "2026-07" ? (RECGOV_WITH_MATCH as never) : null,
        );

        await run({
            subscriberApiUrl: "https://campwatch.dev",
            subscriberApiSecret: "secret",
            resendApiKey: "re_x",
            siteUrl: "https://campwatch.dev",
            forceEmail: false,
            dryRun: false,
            kvAdapter: kv,
            now: new Date("2026-07-06T00:00:00Z"),
            vapid: { privateJWK: { kty: "EC" } as never, subject: "mailto:hello@campwatch.dev" },
        });

        const payload = sendWebPushMock.mock.calls[0]?.[1] as { body: string };
        expect(payload.body).toContain("★ 001");
    });

    it("does not push when vapid is absent", async () => {
        sendWebPushMock.mockResolvedValue({ endpoint: "https://push/1", status: 201, gone: false });
        const pushTarget = {
            ...target,
            pushSubscriptions: [
                { endpoint: "https://push/1", keys: { p256dh: "p", auth: "a" }, createdAt: "x" },
            ],
        };
        vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch([pushTarget]) as never);
        vi.spyOn(console, "log").mockImplementation(() => {});
        const kv = stubKv();
        kv.getRaw = vi.fn(async (id: string, month: string) =>
            id === "232358" && month === "2026-07" ? (RECGOV_WITH_MATCH as never) : null,
        );

        await run({
            subscriberApiUrl: "https://campwatch.dev",
            subscriberApiSecret: "secret",
            resendApiKey: "re_x",
            siteUrl: "https://campwatch.dev",
            forceEmail: false,
            dryRun: false,
            kvAdapter: kv,
            now: new Date("2026-07-06T00:00:00Z"),
        });

        expect(sendWebPushMock).not.toHaveBeenCalled();
    });
});

function tierCampground(id: string, name: string, checkPriority?: string) {
    return {
        id,
        name,
        enabled: true,
        notifyScope: "all",
        ...(checkPriority ? { checkPriority } : {}),
        dates: { startDate: "2026-07-01", endDate: "2026-07-10" },
        sites: { favorites: [], worthwhile: [] },
    };
}

function tierTarget(campgrounds: unknown[]) {
    return {
        email: "boss@example.com",
        roles: ["curator"],
        notifications: { enabled: true, frequencyMinutes: 0 },
        defaultNotifyScope: "all",
        campgrounds: { "recreation.gov": campgrounds },
        globalSettings: { stayLengths: [2], validStartDays: ["Saturday"] },
        notifierState: { signatures: [] },
    };
}

describe("per-campground check tiers", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("carries forward last-good snapshot for a campground missing from cache", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(
                mockFetch([
                    tierTarget([
                        tierCampground("232358", "Outlet", "high"),
                        tierCampground("999999", "Cold", "low"),
                    ]),
                ]) as never,
            );
        vi.spyOn(console, "log").mockImplementation(() => {});
        const kv = stubKv();
        // Only 232358 is warm in cache; 999999 is a miss.
        kv.getRaw = vi.fn(async (id: string) => (id === "232358" ? (RECGOV_WITH_MATCH as never) : null));
        // Prior snapshot has a last-good entry for the cold campground.
        kv.getSnapshot = vi.fn(async () => ({
            updatedAt: "2026-07-05T00:00:00Z",
            campgrounds: [{ id: "999999", name: "Cold", siteAvailability: {}, totalSitesCount: 7 } as never],
        }));
        await run({
            subscriberApiUrl: "https://campwatch.dev",
            subscriberApiSecret: "secret",
            resendApiKey: "re_x",
            siteUrl: "https://campwatch.dev",
            forceEmail: false,
            dryRun: true,
            kvAdapter: kv,
            now: new Date("2026-07-06T00:00:00Z"),
        });
        const snap = (kv.putSnapshot as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1] as {
            campgrounds: { id: string; totalSitesCount: number }[];
        };
        const cold = snap.campgrounds.find((c) => c.id === "999999");
        expect(cold?.totalSitesCount).toBe(7); // carried forward, not zeroed
        void fetchSpy;
    });
});

describe("delivery address override", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("addresses the alert to notificationEmail but keeps unsubscribe on the account email", async () => {
        const target = {
            ...tierTarget([tierCampground("232358", "Outlet")]),
            notificationEmail: "boss@icloud.example",
            notifierState: { sites: {} }, // not first run → email branch reachable
        };
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch([target]) as never);
        vi.spyOn(console, "log").mockImplementation(() => {});
        const kv = stubKv();
        kv.getRaw = vi.fn(async (id: string, month: string) =>
            id === "232358" && month === "2026-07" ? (RECGOV_WITH_MATCH as never) : null,
        );

        await run({
            subscriberApiUrl: "https://campwatch.dev",
            subscriberApiSecret: "secret",
            resendApiKey: "re_x",
            siteUrl: "https://campwatch.dev",
            forceEmail: false,
            dryRun: false, // real send path — Resend is mocked by mockFetch's fallback
            kvAdapter: kv,
            now: new Date("2026-07-06T00:00:00Z"),
        });

        const resendCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes("api.resend.com"));
        expect(resendCalls.length).toBeGreaterThan(0);
        const payload = JSON.parse(String(resendCalls[0]![1]?.body)) as {
            to: string | string[];
            html: string;
        };
        // sendEmail wraps the address in an array for the Resend API.
        const toAddresses = Array.isArray(payload.to) ? payload.to : [payload.to];
        expect(toAddresses).toContain("boss@icloud.example");
        // Unsubscribe identity stays the ACCOUNT email.
        expect(payload.html).toContain(encodeURIComponent("boss@example.com"));
    });
});

describe("spotted time in sent emails", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("annotates matches so the sent html contains the Spotted line", async () => {
        const target = {
            ...tierTarget([tierCampground("232358", "Outlet")]),
            notifierState: { sites: {} }, // not first run → email branch reachable
        };
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch([target]) as never);
        vi.spyOn(console, "log").mockImplementation(() => {});
        const kv = stubKv();
        kv.getRaw = vi.fn(async (id: string, month: string) =>
            id === "232358" && month === "2026-07" ? (RECGOV_WITH_MATCH as never) : null,
        );

        await run({
            subscriberApiUrl: "https://campwatch.dev",
            subscriberApiSecret: "secret",
            resendApiKey: "re_x",
            siteUrl: "https://campwatch.dev",
            forceEmail: false,
            dryRun: false,
            kvAdapter: kv,
            now: new Date("2026-07-06T00:00:00Z"),
        });

        const resendCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes("api.resend.com"));
        expect(resendCalls.length).toBeGreaterThan(0);
        const payload = JSON.parse(String(resendCalls[0]![1]?.body)) as { html: string };
        expect(payload.html).toContain("Spotted");
        expect(payload.html).toContain("MT ·");
    });
});

describe("adjacent-group alerts", () => {
    beforeEach(() => vi.restoreAllMocks());

    // Two consecutively-numbered sites (001, 002) open for the same Saturday
    // 2-night window. With no coords from KV, the number-fallback adjacency links
    // them into a group; adjacencyAnchor "all" accepts a group with no fav/worthwhile.
    const RECGOV_ADJACENT = {
        campsites: {
            "1": {
                site: "001",
                campsite_type: "STANDARD",
                availabilities: {
                    "2026-07-04T00:00:00Z": "Available",
                    "2026-07-05T00:00:00Z": "Available",
                },
            },
            "2": {
                site: "002",
                campsite_type: "STANDARD",
                availabilities: {
                    "2026-07-04T00:00:00Z": "Available",
                    "2026-07-05T00:00:00Z": "Available",
                },
            },
        },
    };

    function adjacentTarget(notifierState: unknown) {
        return {
            email: "boss@example.com",
            roles: ["curator"],
            notifications: { enabled: true, frequencyMinutes: 0 },
            defaultNotifyScope: "all",
            campgrounds: {
                "recreation.gov": [
                    {
                        id: "232358",
                        name: "Outlet",
                        enabled: true,
                        notifyScope: "all",
                        adjacencyAnchor: "all",
                        dates: { startDate: "2026-07-01", endDate: "2026-07-10" },
                        sites: { favorites: [], worthwhile: [] },
                    },
                ],
            },
            globalSettings: { stayLengths: [2], validStartDays: ["Saturday"] },
            notifierState,
        };
    }

    it("emails an Adjacent openings block, then suppresses a re-send within cooldown", async () => {
        // ── First run: state seeded with empty sites bucket so the email branch is
        //    reachable. Capture the sent HTML and the state written back.
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(mockFetch([adjacentTarget({ sites: {} })]) as never);
        vi.spyOn(console, "log").mockImplementation(() => {});
        const kv = stubKv();
        kv.getRaw = vi.fn(async (id: string, month: string) =>
            id === "232358" && month === "2026-07" ? (RECGOV_ADJACENT as never) : null,
        );

        await run({
            subscriberApiUrl: "https://campwatch.dev",
            subscriberApiSecret: "secret",
            resendApiKey: "re_x",
            siteUrl: "https://campwatch.dev",
            forceEmail: false,
            dryRun: false,
            kvAdapter: kv,
            now: new Date("2026-07-06T00:00:00Z"),
        });

        const resendCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes("api.resend.com"));
        expect(resendCalls.length).toBeGreaterThan(0);
        const payload = JSON.parse(String(resendCalls[0]![1]?.body)) as { html: string };
        expect(payload.html).toContain("Adjacent openings");
        expect(payload.html).toContain("001");
        expect(payload.html).toContain("002");

        // Grab the persisted state to feed the second run.
        const stateCall = fetchSpy.mock.calls.find(
            (c) =>
                String(c[0]).includes("/api/admin/notifier-state") && (c[1] as RequestInit)?.method === "PUT",
        );
        const persisted = JSON.parse(String((stateCall![1] as RequestInit).body)) as {
            updates: Array<{ email: string; state: { sites?: unknown; groups?: unknown } }>;
        };
        const userState = persisted.updates.find((u) => u.email === "boss@example.com")!.state;
        expect(userState.groups).toBeTruthy(); // group bucket persisted alongside sites
        expect(userState.sites).toBeDefined(); // sites bucket not overwritten

        // ── Second run within cooldown: feed back the persisted state. The group
        //    overlaps the alerted window → no Adjacent-openings re-send. Restore the
        //    fetch spy first so the second run's calls are captured cleanly.
        vi.restoreAllMocks();
        const fetchSpy2 = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(mockFetch([adjacentTarget(userState)]) as never);
        vi.spyOn(console, "log").mockImplementation(() => {});
        const kv2 = stubKv();
        kv2.getRaw = vi.fn(async (id: string, month: string) =>
            id === "232358" && month === "2026-07" ? (RECGOV_ADJACENT as never) : null,
        );

        await run({
            subscriberApiUrl: "https://campwatch.dev",
            subscriberApiSecret: "secret",
            resendApiKey: "re_x",
            siteUrl: "https://campwatch.dev",
            forceEmail: false,
            dryRun: false,
            kvAdapter: kv2,
            now: new Date("2026-07-06T00:05:00Z"), // 5 min later, well within 24h cooldown
        });

        const resend2 = fetchSpy2.mock.calls.filter((c) => String(c[0]).includes("api.resend.com"));
        const reSentAdjacent = resend2.some((c) => {
            const body = JSON.parse(String((c[1] as RequestInit)?.body)) as { html: string };
            return body.html.includes("Adjacent openings");
        });
        expect(reSentAdjacent).toBe(false);
    });
});

describe("blackout alert suppression", () => {
    beforeEach(() => vi.restoreAllMocks());

    function targetWithBlackouts(blackoutDates: unknown) {
        return {
            ...tierTarget([tierCampground("232358", "Outlet")]),
            notifierState: { sites: {} },
            globalSettings: {
                stayLengths: [2],
                validStartDays: ["Saturday"],
                ...(blackoutDates ? { blackoutDates } : {}),
            },
        };
    }

    async function resendCallsAt(targets: unknown[]): Promise<number> {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch(targets) as never);
        vi.spyOn(console, "log").mockImplementation(() => {});
        const kv = stubKv();
        kv.getRaw = vi.fn(async (id: string, month: string) =>
            id === "232358" && month === "2026-07" ? (RECGOV_WITH_MATCH as never) : null,
        );
        await run({
            subscriberApiUrl: "https://campwatch.dev",
            subscriberApiSecret: "secret",
            resendApiKey: "re_x",
            siteUrl: "https://campwatch.dev",
            forceEmail: false,
            dryRun: false,
            kvAdapter: kv,
            now: new Date("2026-07-06T00:00:00Z"),
        });
        return fetchSpy.mock.calls.filter((c) => String(c[0]).includes("api.resend.com")).length;
    }

    it("suppresses an alert whose stay night falls in a blackout", async () => {
        // Stay nights Jul 4–5; blackout covers Jul 5.
        const n = await resendCallsAt([targetWithBlackouts([{ from: "2026-07-05", to: "2026-07-05" }])]);
        expect(n).toBe(0);
    });

    it("does not suppress when the blackout starts on checkout day", async () => {
        // Stay to=2026-07-06 (checkout morning); blackout starts that day.
        const n = await resendCallsAt([targetWithBlackouts([{ from: "2026-07-06", to: "2026-07-08" }])]);
        expect(n).toBeGreaterThan(0);
    });

    it("does not suppress without blackouts", async () => {
        const n = await resendCallsAt([targetWithBlackouts(undefined)]);
        expect(n).toBeGreaterThan(0);
    });
});

describe("delivery failure handling", () => {
    beforeEach(() => vi.restoreAllMocks());

    const RECGOV_TWO_ADJACENT = {
        campsites: {
            "1": {
                site: "001",
                campsite_type: "STANDARD",
                availabilities: { "2026-07-04T00:00:00Z": "Available", "2026-07-05T00:00:00Z": "Available" },
            },
            "2": {
                site: "002",
                campsite_type: "STANDARD",
                availabilities: { "2026-07-04T00:00:00Z": "Available", "2026-07-05T00:00:00Z": "Available" },
            },
        },
    };

    function adjacencyTarget(roles: string[]) {
        return {
            email: "boss@example.com",
            roles,
            notifications: { enabled: true, frequencyMinutes: 0 },
            defaultNotifyScope: "all",
            campgrounds: {
                "recreation.gov": [
                    {
                        id: "232358",
                        name: "Outlet",
                        enabled: true,
                        notifyScope: "all",
                        adjacencyAnchor: "all",
                        dates: { startDate: "2026-07-01", endDate: "2026-07-10" },
                        sites: { favorites: [], worthwhile: [] },
                    },
                ],
            },
            globalSettings: { stayLengths: [2], validStartDays: ["Saturday"] },
            notifierState: { sites: {} },
        };
    }

    function mockFetchWith(opts: {
        targets: unknown[];
        firstSeen?: Record<string, string>;
        resendStatus?: number;
    }) {
        return vi.fn(async (url: string | URL, _init?: RequestInit) => {
            const u = String(url);
            if (u.includes("/api/admin/notification-targets")) {
                return new Response(JSON.stringify({ targets: opts.targets }), { status: 200 });
            }
            if (u.includes("/api/admin/first-seen")) {
                return new Response(JSON.stringify(opts.firstSeen ?? {}), { status: 200 });
            }
            if (u.includes("/api/openings/recent")) {
                return new Response(JSON.stringify([]), { status: 200 });
            }
            if (u.includes("api.resend.com")) {
                return new Response("{}", { status: opts.resendStatus ?? 200 });
            }
            return new Response("{}", { status: 200 });
        });
    }

    function kvWithAdjacent() {
        const kv = stubKv();
        kv.getRaw = vi.fn(async (id: string, month: string) =>
            id === "232358" && month === "2026-07" ? (RECGOV_TWO_ADJACENT as never) : null,
        );
        return kv;
    }

    const baseConfig = {
        subscriberApiUrl: "https://campwatch.dev",
        subscriberApiSecret: "secret",
        resendApiKey: "re_x",
        siteUrl: "https://campwatch.dev",
        forceEmail: false,
        dryRun: false,
    };

    function statePutBody(fetchSpy: { mock: { calls: unknown[][] } }) {
        const call = fetchSpy.mock.calls.find(
            (c) =>
                String(c[0]).includes("/api/admin/notifier-state") && (c[1] as RequestInit)?.method === "PUT",
        );
        return JSON.parse(String((call![1] as RequestInit).body)) as { updates: Array<{ email: string }> };
    }

    function firstSeenPutBody(fetchSpy: { mock: { calls: unknown[][] } }) {
        const call = fetchSpy.mock.calls.find(
            (c) => String(c[0]).includes("/api/admin/first-seen") && (c[1] as RequestInit)?.method === "PUT",
        );
        return JSON.parse(String((call![1] as RequestInit).body)) as { map: Record<string, string> };
    }

    it("does not record the alert as sent when every email attempt fails", async () => {
        const target = {
            ...tierTarget([tierCampground("232358", "Outlet")]),
            notifierState: { sites: {} },
        };
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(mockFetchWith({ targets: [target], resendStatus: 500 }) as never);
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
        const kv = stubKv();
        kv.getRaw = vi.fn(async (id: string, month: string) =>
            id === "232358" && month === "2026-07" ? (RECGOV_WITH_MATCH as never) : null,
        );

        await run({ ...baseConfig, kvAdapter: kv, now: new Date("2026-07-06T00:00:00Z") });

        const resendCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes("api.resend.com"));
        expect(resendCalls.length).toBe(2); // one retry, then give up
        const persisted = statePutBody(fetchSpy);
        // No update for this user: the prior state stays, so next tick retries.
        expect(persisted.updates.find((u) => u.email === "boss@example.com")).toBeUndefined();
    }, 10_000);

    it("holds an adjacent group for a non-curator until the group itself clears lead time", async () => {
        const target = adjacencyTarget([]);
        const t0 = new Date("2026-07-06T00:00:00Z");

        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(mockFetchWith({ targets: [target] }) as never);
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
        await run({ ...baseConfig, kvAdapter: kvWithAdjacent(), now: t0 });

        // First sighting: nothing sent, but the group was stamped in the first-seen map.
        expect(fetchSpy.mock.calls.some((c) => String(c[0]).includes("api.resend.com"))).toBe(false);
        const firstSeen = firstSeenPutBody(fetchSpy).map;
        const groupKeys = Object.keys(firstSeen).filter((k) => k.startsWith("group:232358:"));
        expect(groupKeys).toHaveLength(1);

        // 16 minutes later, with that map persisted, the group is released.
        vi.restoreAllMocks();
        const fetchSpy2 = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(mockFetchWith({ targets: [target], firstSeen }) as never);
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
        await run({ ...baseConfig, kvAdapter: kvWithAdjacent(), now: new Date(t0.getTime() + 16 * 60_000) });

        const resend = fetchSpy2.mock.calls.filter((c) => String(c[0]).includes("api.resend.com"));
        expect(resend.length).toBeGreaterThan(0);
        const html = (JSON.parse(String((resend[0]![1] as RequestInit).body)) as { html: string }).html;
        expect(html).toContain("Adjacent openings");
    });

    it("stamps first-seen for an opening watched only by an ineligible user, so their lead-time clock does not restart", async () => {
        const t0 = new Date("2026-07-06T00:00:00Z");
        // Non-curator on a 15-minute frequency, notified one minute ago: ineligible at T0.
        const target = {
            ...tierTarget([tierCampground("232358", "Outlet")]),
            roles: [],
            notifications: { enabled: true, frequencyMinutes: 15 },
            lastNotifiedAt: new Date(t0.getTime() - 60_000).toISOString(),
            notifierState: { sites: {} },
        };
        const kvWithMatch = () => {
            const kv = stubKv();
            kv.getRaw = vi.fn(async (id: string, month: string) =>
                id === "232358" && month === "2026-07" ? (RECGOV_WITH_MATCH as never) : null,
            );
            return kv;
        };

        // Tick 1 at T0: nobody is eligible, but the opening is visible and must be stamped.
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(mockFetchWith({ targets: [target] }) as never);
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
        await run({ ...baseConfig, kvAdapter: kvWithMatch(), now: t0 });

        expect(fetchSpy.mock.calls.some((c) => String(c[0]).includes("api.resend.com"))).toBe(false);
        const firstSeen = firstSeenPutBody(fetchSpy).map;
        const siteSigs = Object.keys(firstSeen).filter((k) => k.startsWith("232358:"));
        expect(siteSigs).toHaveLength(1);
        expect(firstSeen[siteSigs[0]!]).toBe(t0.toISOString());

        // Tick 2 at T0+16m: the user is eligible and the opening has cleared the
        // 15-minute lead time because its first-seen is still T0.
        vi.restoreAllMocks();
        const fetchSpy2 = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(mockFetchWith({ targets: [target], firstSeen }) as never);
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
        await run({ ...baseConfig, kvAdapter: kvWithMatch(), now: new Date(t0.getTime() + 16 * 60_000) });

        expect(fetchSpy2.mock.calls.some((c) => String(c[0]).includes("api.resend.com"))).toBe(true);
        expect(firstSeenPutBody(fetchSpy2).map[siteSigs[0]!]).toBe(t0.toISOString());
    });
});

describe("prior stats read", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("reads prior stats from the authenticated admin route with a timeout, not the public route", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch() as never);
        vi.spyOn(console, "log").mockImplementation(() => {});
        const kv = stubKv();
        kv.getRaw = vi.fn(async (id: string, month: string) =>
            id === "232358" && month === "2026-07" ? (RECGOV_WITH_MATCH as never) : null,
        );

        await run({
            subscriberApiUrl: "https://campwatch.dev",
            subscriberApiSecret: "secret",
            resendApiKey: "re_x",
            siteUrl: "https://campwatch.dev",
            forceEmail: false,
            dryRun: true,
            kvAdapter: kv,
            now: new Date("2026-07-06T00:00:00Z"),
        });

        const statsReads = fetchSpy.mock.calls.filter(
            (c) =>
                String(c[0]).endsWith("/api/admin/stats") &&
                (c[1] as RequestInit | undefined)?.method !== "PUT",
        );
        expect(statsReads).toHaveLength(1);
        const init = statsReads[0]![1] as RequestInit;
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
        expect(init.signal).toBeInstanceOf(AbortSignal);
        expect(fetchSpy.mock.calls.some((c) => String(c[0]).endsWith("/api/stats"))).toBe(false);
    });
});

describe("runTick lock release", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("surfaces the tick's own error when the lock release write also fails", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation((async () => {
            return new Response("{}", { status: 503 });
        }) as never);
        vi.spyOn(console, "log").mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const lockKv = {
            get: vi.fn(async () => null),
            put: vi.fn(async (_key: string, value: string) => {
                if (value === "0") {
                    throw new Error("KV PUT failed: 429");
                }
            }),
        };

        await expect(
            runTick(
                {
                    subscriberApiUrl: "https://campwatch.dev",
                    subscriberApiSecret: "secret",
                    resendApiKey: "re_x",
                    siteUrl: "https://campwatch.dev",
                    forceEmail: false,
                    dryRun: false,
                    kvAdapter: null,
                    now: new Date("2026-07-06T00:00:00Z"),
                },
                lockKv,
            ),
        ).rejects.toThrow("notification-targets returned 503");

        // The release was attempted, failed, and was logged rather than thrown.
        expect(lockKv.put).toHaveBeenCalledWith("notifier:notify-lock", "0", { expirationTtl: 60 });
        expect(errorSpy.mock.calls.some((c) => String(c[0]).includes("release failed"))).toBe(true);
    });
});
