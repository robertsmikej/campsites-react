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

const HIGH = tierCampground("111", "High Camp", "high");
const NORMAL = tierCampground("222", "Normal Camp"); // no field = normal
const LOW = tierCampground("333", "Low Camp", "low");

async function runAt(
    isoNow: string,
    opts: { targets?: unknown[]; kv?: KvAdapter; forceEmail?: boolean } = {},
): Promise<string[]> {
    const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(mockFetch(opts.targets ?? [tierTarget([HIGH, NORMAL, LOW])]) as never);
    vi.spyOn(console, "log").mockImplementation(() => {});
    await run({
        subscriberApiUrl: "https://campwatch.dev",
        subscriberApiSecret: "secret",
        resendApiKey: "re_x",
        siteUrl: "https://campwatch.dev",
        forceEmail: opts.forceEmail ?? false,
        dryRun: true,
        kvAdapter: opts.kv ?? stubKv(),
        now: new Date(isoNow),
    });
    return fetchSpy.mock.calls.map((c) => String(c[0]));
}

describe("per-campground check tiers", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("fetches only high-tier campgrounds on an off minute", async () => {
        const urls = await runAt("2026-07-06T00:03:00Z");
        expect(urls.some((u) => u.includes("/campground/111/"))).toBe(true);
        expect(urls.some((u) => u.includes("/campground/222/"))).toBe(false);
        expect(urls.some((u) => u.includes("/campground/333/"))).toBe(false);
    });

    it("fetches high+normal on a %5 minute, but not low", async () => {
        const urls = await runAt("2026-07-06T00:05:00Z");
        expect(urls.some((u) => u.includes("/campground/111/"))).toBe(true);
        expect(urls.some((u) => u.includes("/campground/222/"))).toBe(true);
        expect(urls.some((u) => u.includes("/campground/333/"))).toBe(false);
    });

    it("fetches all tiers on a %10 minute", async () => {
        const urls = await runAt("2026-07-06T00:10:00Z");
        for (const id of ["111", "222", "333"]) {
            expect(urls.some((u) => u.includes(`/campground/${id}/`))).toBe(true);
        }
    });

    it("short-circuits with no rec.gov calls or snapshot writes when nothing is due", async () => {
        const kv = stubKv();
        const urls = await runAt("2026-07-06T00:03:00Z", {
            targets: [tierTarget([NORMAL, LOW])],
            kv,
        });
        expect(urls.some((u) => u.includes("recreation.gov"))).toBe(false);
        expect(kv.putSnapshot).not.toHaveBeenCalled();
    });

    it("forceEmail bypasses the tier filter (manual runs check everything)", async () => {
        const urls = await runAt("2026-07-06T00:03:00Z", { forceEmail: true });
        expect(urls.some((u) => u.includes("/campground/333/"))).toBe(true);
    });

    it("carries forward last-good snapshot data for campgrounds skipped this minute", async () => {
        const kv = stubKv();
        const priorNormal = {
            id: "222",
            name: "Normal Camp",
            sites: { favorites: [], worthwhile: [] },
            siteAvailability: {},
            totalSitesCount: 7,
        };
        (kv.getSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue({
            updatedAt: "2026-07-06T00:00:00.000Z",
            campgrounds: [priorNormal],
        });
        await runAt("2026-07-06T00:03:00Z", { kv });

        const calls = (kv.putSnapshot as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        const written = calls[calls.length - 1]![1] as {
            campgrounds: Array<{ id: string; totalSitesCount?: number }>;
        };
        const carried = written.campgrounds.find((c) => c.id === "222");
        expect(carried?.totalSitesCount).toBe(7);
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

        await run({
            subscriberApiUrl: "https://campwatch.dev",
            subscriberApiSecret: "secret",
            resendApiKey: "re_x",
            siteUrl: "https://campwatch.dev",
            forceEmail: false,
            dryRun: false, // real send path — Resend is mocked by mockFetch's fallback
            kvAdapter: stubKv(),
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

        await run({
            subscriberApiUrl: "https://campwatch.dev",
            subscriberApiSecret: "secret",
            resendApiKey: "re_x",
            siteUrl: "https://campwatch.dev",
            forceEmail: false,
            dryRun: false,
            kvAdapter: stubKv(),
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
        await run({
            subscriberApiUrl: "https://campwatch.dev",
            subscriberApiSecret: "secret",
            resendApiKey: "re_x",
            siteUrl: "https://campwatch.dev",
            forceEmail: false,
            dryRun: false,
            kvAdapter: stubKv(),
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

describe("past months are not fetched", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("starts the fetch window at the current month when startDate is in the past", async () => {
        // Window May–July, "now" July 6 (minute 0, all tiers due) → only 2026-07 fetched.
        const stale = {
            ...tierCampground("444", "Stale Start"),
            dates: { startDate: "2026-05-01", endDate: "2026-07-10" },
        };
        const urls = await runAt("2026-07-06T00:00:00Z", { targets: [tierTarget([stale])] });
        expect(urls.some((u) => u.includes("/campground/444/month?start_date=2026-07-01"))).toBe(true);
        expect(urls.some((u) => u.includes("/campground/444/month?start_date=2026-05-01"))).toBe(false);
        expect(urls.some((u) => u.includes("/campground/444/month?start_date=2026-06-01"))).toBe(false);
    });

    it("skips a campground whose whole window is in the past", async () => {
        const past = {
            ...tierCampground("555", "Long Gone"),
            dates: { startDate: "2026-01-01", endDate: "2026-02-15" },
        };
        const urls = await runAt("2026-07-06T00:00:00Z", { targets: [tierTarget([past])] });
        expect(urls.some((u) => u.includes("/campground/555/"))).toBe(false);
    });

    it("still fetches the current month even when today is mid-month", async () => {
        // The month containing "now" is always relevant — only fully past months drop.
        const current = {
            ...tierCampground("666", "Current"),
            dates: { startDate: "2026-07-01", endDate: "2026-08-10" },
        };
        const urls = await runAt("2026-07-06T00:00:00Z", { targets: [tierTarget([current])] });
        expect(urls.some((u) => u.includes("/campground/666/month?start_date=2026-07-01"))).toBe(true);
        expect(urls.some((u) => u.includes("/campground/666/month?start_date=2026-08-01"))).toBe(true);
    });
});
