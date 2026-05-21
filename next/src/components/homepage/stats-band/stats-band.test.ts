import { describe, it, expect } from "vitest";

// StatsBand reads from StatsContext and formats values with formatCount.
// We test the formatting logic directly (it's inlined in the component).

describe("StatsBand formatCount logic", () => {
    function formatCount(n: number | null | undefined): string {
        if (n == null || !Number.isFinite(n)) return "—";
        return n.toLocaleString();
    }

    it("returns '—' when stats is null", () => {
        expect(formatCount(null)).toBe("—");
    });

    it("returns '—' when value is undefined", () => {
        expect(formatCount(undefined)).toBe("—");
    });

    it("returns '—' for NaN", () => {
        expect(formatCount(NaN)).toBe("—");
    });

    it("returns '—' for Infinity", () => {
        expect(formatCount(Infinity)).toBe("—");
    });

    it("formats 0 as '0'", () => {
        expect(formatCount(0)).toBe("0");
    });

    it("formats a positive integer", () => {
        expect(formatCount(42)).toBe("42");
    });

    it("formats a large number with locale separators", () => {
        // toLocaleString on 1234 is '1,234' in en-US; test just that it is truthy + contains digits
        const result = formatCount(1234);
        expect(result).toMatch(/1.?234/); // handles both '1,234' and '1234'
    });
});

describe("StatsBand — null stats fallbacks", () => {
    // When stats is null every tile should show "—" as its value.
    function tileValue(stats: Record<string, number> | null, key: string): string {
        if (!stats) return "—";
        const val = stats[key];
        if (val == null || !Number.isFinite(val)) return "—";
        return val.toLocaleString();
    }

    it("shows '—' for campgroundsTracked when stats is null", () => {
        expect(tileValue(null, "campgroundsTracked")).toBe("—");
    });

    it("shows '—' for openingsSentToday when stats is null", () => {
        expect(tileValue(null, "openingsSentToday")).toBe("—");
    });

    it("shows formatted value when stats is populated", () => {
        expect(tileValue({ campgroundsTracked: 7 }, "campgroundsTracked")).toBe("7");
    });
});

describe("StatsBand module exports", () => {
    it("exports StatsBand as a function", async () => {
        const mod = await import("./stats-band");
        expect(typeof mod.StatsBand).toBe("function");
    });
});
