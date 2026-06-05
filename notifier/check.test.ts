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

function mockFetch() {
    return vi.fn(async (url: string | URL, _init?: RequestInit) => {
        const u = String(url);
        if (u.includes("/api/admin/notification-targets")) {
            return new Response(JSON.stringify({ targets: [target] }), { status: 200 });
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
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch() as never);
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
