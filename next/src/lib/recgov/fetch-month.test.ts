import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchMonth, REC_GOV_MONTH_URL } from "./fetch-month";

describe("fetchMonth", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    it("builds the correct rec.gov URL with the encoded month", async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ campsites: {} }), { status: 200 }));
        await fetchMonth("232358", "2026-07");
        const calledWith = fetchSpy.mock.calls[0]?.[0] as string;
        expect(calledWith).toContain("/api/camps/availability/campground/232358/month");
        expect(calledWith).toContain("start_date=2026-07-01T00%3A00%3A00.000Z");
    });

    it("returns parsed JSON on 200", async () => {
        const body = { campsites: { "1": { site: "001", campsite_type: "STANDARD", availabilities: {} } } };
        fetchSpy.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
        const result = await fetchMonth("232358", "2026-07");
        expect(result).toEqual(body);
    });

    it("returns null on non-2xx", async () => {
        fetchSpy.mockResolvedValue(new Response("server error", { status: 500 }));
        const result = await fetchMonth("232358", "2026-07");
        expect(result).toBeNull();
    });

    it("returns null on network error", async () => {
        fetchSpy.mockRejectedValue(new Error("ECONNREFUSED"));
        const result = await fetchMonth("232358", "2026-07");
        expect(result).toBeNull();
    });

    it("exports the URL template constant", () => {
        expect(REC_GOV_MONTH_URL).toContain("recreation.gov");
    });
});
