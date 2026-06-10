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

describe("per-campground check tiers", () => {
    beforeEach(() => vi.restoreAllMocks());

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
