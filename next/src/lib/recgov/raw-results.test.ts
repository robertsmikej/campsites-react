import { describe, it, expect } from "vitest";
import { fetchProducedNoData } from "./raw-results";

describe("fetchProducedNoData", () => {
    it("is true for an empty array (no months fetched)", () => {
        expect(fetchProducedNoData([])).toBe(true);
    });

    it("is true for null/undefined input", () => {
        expect(fetchProducedNoData(null)).toBe(true);
        expect(fetchProducedNoData(undefined)).toBe(true);
    });

    it("is true when every month came back null (rec.gov failed)", () => {
        expect(fetchProducedNoData([null, null])).toBe(true);
        expect(fetchProducedNoData([null, undefined])).toBe(true);
    });

    it("is false when at least one month returned data", () => {
        expect(fetchProducedNoData([null, { campsites: {} }])).toBe(false);
        expect(fetchProducedNoData([{ campsites: {} }])).toBe(false);
    });
});
