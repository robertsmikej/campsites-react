import { describe, it, expect, vi, beforeEach } from "vitest";
import { run, diffTripsWithCooldown, suppressTripDuplicates, buildTripDigests } from "./check";
import type { TripSiteHit } from "../next/src/lib/trip-windows";
import type { TripWindow } from "../next/src/types/campground";
import type { MatchResult } from "./lib/diff";
import type { KvAdapter } from "../next/src/lib/recgov/cache";

const NOW = Date.parse("2026-07-22T18:00:00Z");
const HOURS = 60 * 60 * 1000;

const hit = (over: Partial<TripSiteHit> = {}): TripSiteHit => ({
    windowId: "w1",
    campgroundId: "233563",
    campgroundName: "Point Campground",
    siteId: "111",
    siteName: "A01",
    tier: "favorites",
    run: { from: "2026-07-31", to: "2026-08-02", nights: 2 },
    ...over,
});

const win: TripWindow = { id: "w1", from: "2026-07-31", to: "2026-08-02", label: "Lake weekend" };

describe("diffTripsWithCooldown", () => {
    it("first sighting fires and is recorded", () => {
        const { newHits, nextTripState } = diffTripsWithCooldown([hit()], null, NOW);
        expect(newHits).toHaveLength(1);
        expect(nextTripState["w1:233563:111"]).toHaveLength(1);
    });

    it("an overlapping run within the cooldown does not re-fire", () => {
        const prior = {
            trips: {
                "w1:233563:111": [
                    { from: "2026-07-31", to: "2026-08-02", seen: new Date(NOW - 2 * HOURS).toISOString() },
                ],
            },
        };
        const { newHits, nextTripState } = diffTripsWithCooldown([hit()], prior, NOW);
        expect(newHits).toHaveLength(0);
        // The prior seen is PRESERVED (not refreshed), so it can age out and re-fire.
        expect(nextTripState["w1:233563:111"]![0]!.seen).toBe(new Date(NOW - 2 * HOURS).toISOString());
    });

    it("re-fires once the prior range ages past the 6h cooldown", () => {
        const prior = {
            trips: {
                "w1:233563:111": [
                    { from: "2026-07-31", to: "2026-08-02", seen: new Date(NOW - 7 * HOURS).toISOString() },
                ],
            },
        };
        const { newHits } = diffTripsWithCooldown([hit()], prior, NOW);
        expect(newHits).toHaveLength(1);
    });

    it("keys are independent per window and site", () => {
        const prior = {
            trips: {
                "w1:233563:111": [
                    { from: "2026-07-31", to: "2026-08-02", seen: new Date(NOW - 1 * HOURS).toISOString() },
                ],
            },
        };
        const other = hit({ siteId: "222", siteName: "B02" });
        const { newHits } = diffTripsWithCooldown([hit(), other], prior, NOW);
        expect(newHits.map((h) => h.siteId)).toEqual(["222"]);
    });
});

describe("suppressTripDuplicates", () => {
    const match = {
        campgroundId: "233563",
        campgroundName: "Point Campground",
        campgroundArea: "",
        campgroundDescription: "",
        siteId: "111",
        siteName: "A01",
        group: "favorites",
        match: { from: "2026-07-31", to: "2026-08-02", nights: 2 },
    } as MatchResult;
    it("drops normal matches covered by a trip hit this run", () => {
        expect(suppressTripDuplicates([match], [hit()])).toEqual([]);
    });
    it("keeps non-overlapping matches", () => {
        const sept = { ...match, match: { from: "2026-09-04", to: "2026-09-06", nights: 2 } } as never;
        expect(suppressTripDuplicates([sept], [hit()])).toHaveLength(1);
    });
});

describe("buildTripDigests", () => {
    it("one digest per window, favorites first, capped body, sole-hit deep link", () => {
        const digests = buildTripDigests([hit()], [win], "https://campwatch.dev");
        expect(digests).toHaveLength(1);
        expect(digests[0]!.push.title).toBe("Trip match: Lake weekend");
        expect(digests[0]!.push.tag).toBe("cw-trip-w1");
        expect(digests[0]!.push.url).toContain("/camping/campsites/111?");
        expect(digests[0]!.push.body).toContain("★ Point Campground · A01");
    });
    it("multi-campground digest links to the dashboard", () => {
        const hits = [
            hit(),
            hit({
                campgroundId: "999",
                campgroundName: "Other",
                siteId: "9",
                siteName: "Z9",
                tier: "all-others",
            }),
        ];
        const digests = buildTripDigests(hits, [win], "https://campwatch.dev");
        expect(digests[0]!.push.url).toBe("https://campwatch.dev/app");
    });
    it("returns nothing for windows with no hits", () => {
        expect(buildTripDigests([], [win], "")).toEqual([]);
    });
});

// End-to-end through run(): a trip-only opening (no normal match) must produce a
// "Trip match" email, persist the trip dedup bucket, and stay quiet on the next
// run inside the 6h cooldown. Mirrors the run()-level harness in check.test.ts.
describe("run() trip alerts (integration)", () => {
    beforeEach(() => vi.restoreAllMocks());

    // One site open exactly the trip weekend (Fri+Sat nights). With stayLengths [7]
    // the normal match path finds zero stays, so any Resend send here is purely
    // trip-driven.
    const RECGOV_TRIP_ONLY = {
        campsites: {
            "111": {
                site: "A01",
                campsite_type: "STANDARD",
                availabilities: {
                    "2026-07-24T00:00:00Z": "Available",
                    "2026-07-25T00:00:00Z": "Available",
                },
            },
        },
    };

    function tripTarget(notifierState: unknown) {
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
                        dates: { startDate: "2026-07-01", endDate: "2026-07-31" },
                        sites: { favorites: [], worthwhile: [] },
                    },
                ],
            },
            globalSettings: {
                stayLengths: [7],
                validStartDays: [
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                    "Sunday",
                ],
                tripWindows: [{ id: "w1", from: "2026-07-24", to: "2026-07-26", label: "Lake weekend" }],
            },
            notifierState,
        };
    }

    function stubKv(): KvAdapter {
        return {
            getRaw: vi.fn(async (id: string, month: string) =>
                id === "232358" && month === "2026-07" ? (RECGOV_TRIP_ONLY as never) : null,
            ),
            putRaw: vi.fn(async () => {}),
            getSnapshot: vi.fn(async () => null),
            putSnapshot: vi.fn(async () => {}),
            deleteSnapshot: vi.fn(async () => {}),
        };
    }

    function mockFetch(targets: unknown[]) {
        return vi.fn(async (url: string | URL) => {
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
            // Resend POST + every other admin write falls through here (status 200).
            return new Response("{}", { status: 200 });
        });
    }

    const runConfig = (kv: KvAdapter, now: Date) => ({
        subscriberApiUrl: "https://campwatch.dev",
        subscriberApiSecret: "secret",
        resendApiKey: "re_x",
        siteUrl: "https://campwatch.dev",
        forceEmail: false,
        dryRun: false,
        kvAdapter: kv,
        now,
    });

    it("emails a Trip match, persists the trip bucket, then holds within cooldown", async () => {
        // ── First run: empty (non-null) state so it isn't treated as a first run.
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(mockFetch([tripTarget({})]) as never);
        vi.spyOn(console, "log").mockImplementation(() => {});

        await run(runConfig(stubKv(), new Date("2026-07-22T18:00:00Z")));

        // Subject leads with "Trip match:".
        const resendCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes("api.resend.com"));
        expect(resendCalls.length).toBeGreaterThan(0);
        const emailBody = JSON.parse(String((resendCalls[0]![1] as RequestInit)?.body)) as {
            subject: string;
        };
        expect(emailBody.subject.startsWith("Trip match:")).toBe(true);

        // Persisted state carries the trip bucket keyed w1:<cgId>:<siteId>.
        const stateCall = fetchSpy.mock.calls.find(
            (c) =>
                String(c[0]).includes("/api/admin/notifier-state") && (c[1] as RequestInit)?.method === "PUT",
        );
        const persisted = JSON.parse(String((stateCall![1] as RequestInit).body)) as {
            updates: Array<{ email: string; state: { trips?: Record<string, unknown> } }>;
        };
        const userState = persisted.updates.find((u) => u.email === "boss@example.com")!.state;
        expect(userState.trips).toBeTruthy();
        expect(Object.keys(userState.trips!)).toContain("w1:232358:111");

        // ── Second run 2h later, feeding the persisted state back. The still-open run
        //    overlaps the alerted window inside the 6h trip cooldown → no re-send.
        vi.restoreAllMocks();
        const fetchSpy2 = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(mockFetch([tripTarget(userState)]) as never);
        vi.spyOn(console, "log").mockImplementation(() => {});

        await run(runConfig(stubKv(), new Date("2026-07-22T20:00:00Z")));

        const resend2 = fetchSpy2.mock.calls.filter((c) => String(c[0]).includes("api.resend.com"));
        expect(resend2).toHaveLength(0);
    });
});
