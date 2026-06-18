import { describe, it, expect, vi, beforeEach } from "vitest";
import { run } from "./check";
import type { KvAdapter } from "../next/src/lib/recgov/cache";

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

        // No send and no state-mutating writes.
        expect(calledUrls.some((u) => u.includes("api.resend.com"))).toBe(false);
        expect(
            calledUrls.some(
                (u) =>
                    u.includes("/api/admin/notifier-state") ||
                    u.includes("/api/admin/openings/recent") ||
                    u.includes("/api/admin/stats"),
            ),
        ).toBe(false);
        const firstSeenWrites = fetchSpy.mock.calls.filter(
            (c) => String(c[0]).includes("/api/admin/first-seen") && (c[1] as RequestInit)?.method === "PUT",
        );
        expect(firstSeenWrites).toHaveLength(0);

        // Snapshots are intentionally still written in dry-run (they improve the
        // dashboard and are side-effect-safe).
        expect(kv.putSnapshot).toHaveBeenCalled();
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
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch([tierTarget([
            tierCampground("232358", "Outlet", "high"),
            tierCampground("999999", "Cold", "low"),
        ])]) as never);
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

