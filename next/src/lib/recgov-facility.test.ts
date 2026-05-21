import { describe, it, expect, vi } from "vitest";
import { parseFacilityId, fetchFacilitySummary } from "./recgov-facility";

// ---------------------------------------------------------------------------
// parseFacilityId
// ---------------------------------------------------------------------------

describe("parseFacilityId", () => {
    it("bare ID returns itself", () => {
        expect(parseFacilityId("232358")).toBe("232358");
    });

    it("trims whitespace from bare ID", () => {
        expect(parseFacilityId("  232358  ")).toBe("232358");
    });

    it("full campground URL", () => {
        expect(parseFacilityId("https://www.recreation.gov/camping/campgrounds/232358")).toBe("232358");
    });

    it("URL with query string", () => {
        expect(parseFacilityId("https://www.recreation.gov/camping/campgrounds/232358?abc=1")).toBe("232358");
    });

    it("URL with trailing path segment", () => {
        expect(parseFacilityId("https://www.recreation.gov/camping/campgrounds/232358/availability")).toBe(
            "232358",
        );
    });

    it("non-numeric string returns null", () => {
        expect(parseFacilityId("abc")).toBeNull();
    });

    it("non-recreation.gov URL returns null", () => {
        expect(parseFacilityId("https://example.com/something")).toBeNull();
    });

    it("digits + suffix (no delimiter) returns null", () => {
        expect(parseFacilityId("232358extra")).toBeNull();
    });

    it("empty string returns null", () => {
        expect(parseFacilityId("")).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// fetchFacilitySummary
// ---------------------------------------------------------------------------

function makeFetchMock(status: number, body: unknown): typeof fetch {
    return vi.fn().mockResolvedValue({
        status,
        ok: status >= 200 && status < 300,
        json: async () => body,
    } as Response);
}

describe("fetchFacilitySummary", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("maps facility_name with trailing parenthetical → name and campground type", async () => {
        vi.stubGlobal(
            "fetch",
            makeFetchMock(200, {
                campground: { facility_name: "OUTLET CAMPGROUND (ID)" },
            }),
        );
        const result = await fetchFacilitySummary("232358");
        expect(result).not.toBeNull();
        expect(result!.name).toBe("Outlet Campground");
        expect(result!.type).toBe("campground");
        expect(result!.id).toBe("232358");
    });

    it("LOOKOUT takes precedence over CABIN in type inference", async () => {
        vi.stubGlobal(
            "fetch",
            makeFetchMock(200, {
                campground: { facility_name: "DEADWOOD LOOKOUT REC CABIN" },
            }),
        );
        const result = await fetchFacilitySummary("999");
        expect(result!.type).toBe("lookout");
    });

    it("CABIN type when no LOOKOUT", async () => {
        vi.stubGlobal(
            "fetch",
            makeFetchMock(200, {
                campground: { facility_name: "REDFISH CABIN" },
            }),
        );
        const result = await fetchFacilitySummary("888");
        expect(result!.type).toBe("cabin");
    });

    it("maps addresses[0].city to area", async () => {
        vi.stubGlobal(
            "fetch",
            makeFetchMock(200, {
                campground: {
                    facility_name: "SOME CAMPGROUND",
                    addresses: [{ city: "STANLEY", state_code: "ID" }],
                },
            }),
        );
        const result = await fetchFacilitySummary("111");
        expect(result!.area).toBe("Stanley");
    });

    it("strips HTML tags from description", async () => {
        vi.stubGlobal(
            "fetch",
            makeFetchMock(200, {
                campground: {
                    facility_name: "SOME CAMPGROUND",
                    facility_description_map: { Overview: "Some <b>HTML</b> text." },
                },
            }),
        );
        const result = await fetchFacilitySummary("111");
        expect(result!.description).toBe("Some HTML text.");
    });

    it("maps first Image media entry to imageUrl", async () => {
        vi.stubGlobal(
            "fetch",
            makeFetchMock(200, {
                campground: {
                    facility_name: "SOME CAMPGROUND",
                    media: [{ media_type: "Image", url: "https://x.com/img.jpg" }],
                },
            }),
        );
        const result = await fetchFacilitySummary("111");
        expect(result!.imageUrl).toBe("https://x.com/img.jpg");
    });

    it("returns null when facility_name is missing", async () => {
        vi.stubGlobal(
            "fetch",
            makeFetchMock(200, {
                campground: {},
            }),
        );
        const result = await fetchFacilitySummary("111");
        expect(result).toBeNull();
    });

    it("returns null on 404 without throwing", async () => {
        vi.stubGlobal("fetch", makeFetchMock(404, {}));
        const result = await fetchFacilitySummary("111");
        expect(result).toBeNull();
    });
});
