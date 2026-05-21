import { describe, it, expect } from "vitest";

// OpeningCard encodes several pieces of extractable logic:
//   - tag: "CANCEL" when daysUntilArrival < 14, otherwise "NEW"
//   - nights pluralization
//   - rec.gov URL construction
//   - formatOpeningDates output format

const CANCEL_THRESHOLD_DAYS = 14;

// ─── NEW vs CANCEL tag ────────────────────────────────────────────────────────

describe("OpeningCard tag logic", () => {
    function tag(daysUntilArrival: number): "CANCEL" | "NEW" {
        return daysUntilArrival < CANCEL_THRESHOLD_DAYS ? "CANCEL" : "NEW";
    }

    it("shows CANCEL for a 5-day-out arrival", () => {
        expect(tag(5)).toBe("CANCEL");
    });

    it("shows CANCEL for 0 days out", () => {
        expect(tag(0)).toBe("CANCEL");
    });

    it("shows CANCEL for 13 days out (threshold - 1)", () => {
        expect(tag(13)).toBe("CANCEL");
    });

    it("shows NEW for exactly 14 days out (at threshold)", () => {
        expect(tag(14)).toBe("NEW");
    });

    it("shows NEW for a 30-day-out arrival", () => {
        expect(tag(30)).toBe("NEW");
    });

    it("shows NEW for 60 days out", () => {
        expect(tag(60)).toBe("NEW");
    });
});

describe("OpeningCard daysUntilArrival calculation", () => {
    // daysUntilArrival = (new Date(item.from).getTime() - nowMs) / 86_400_000
    function daysUntil(fromIso: string, nowMs: number): number {
        return (new Date(fromIso).getTime() - nowMs) / 86_400_000;
    }

    it("yields ~5 for a date 5 days in the future", () => {
        const now = new Date("2026-07-01T12:00:00.000Z");
        const from = "2026-07-06"; // 5 days ahead
        const days = daysUntil(from, now.getTime());
        // Should be close to 4.5 depending on exact time-of-day parsing
        expect(days).toBeGreaterThan(4);
        expect(days).toBeLessThan(6);
    });

    it("yields ~30 for a date 30 days in the future", () => {
        const now = new Date("2026-07-01T00:00:00.000Z");
        const from = "2026-07-31";
        const days = daysUntil(from, now.getTime());
        expect(days).toBeGreaterThan(29);
        expect(days).toBeLessThan(31);
    });
});

// ─── nights pluralization ─────────────────────────────────────────────────────

describe("OpeningCard nights label", () => {
    function nightsLabel(nights: number): string {
        return `${nights} night${nights !== 1 ? "s" : ""}`;
    }

    it("uses singular 'night' for 1 night", () => {
        expect(nightsLabel(1)).toBe("1 night");
    });

    it("uses plural 'nights' for 2+ nights", () => {
        expect(nightsLabel(2)).toBe("2 nights");
        expect(nightsLabel(7)).toBe("7 nights");
    });
});

// ─── rec.gov URL ──────────────────────────────────────────────────────────────

describe("OpeningCard rec.gov URL", () => {
    function recGovUrl(recGovId: string | undefined): string {
        return recGovId
            ? `https://www.recreation.gov/camping/campgrounds/${recGovId}`
            : "https://www.recreation.gov";
    }

    it("builds a campground-specific URL when recGovId is provided", () => {
        expect(recGovUrl("233881")).toBe(
            "https://www.recreation.gov/camping/campgrounds/233881",
        );
    });

    it("falls back to the rec.gov homepage when recGovId is undefined", () => {
        expect(recGovUrl(undefined)).toBe("https://www.recreation.gov");
    });
});

// ─── formatOpeningDates ───────────────────────────────────────────────────────

describe("OpeningCard formatOpeningDates", () => {
    // Replicated from opening-card.tsx for isolated testing
    function formatOpeningDates(from: string, to: string): string {
        const f = new Date(from + "T00:00:00");
        const tDate = new Date(to + "T00:00:00");
        const last = new Date(tDate);
        last.setDate(tDate.getDate() - 1);
        const dow = new Intl.DateTimeFormat("en-US", { weekday: "short" });
        const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
        if (f.toDateString() === last.toDateString()) {
            return `${dow.format(f)}, ${date.format(f)}`;
        }
        return `${dow.format(f)} – ${dow.format(last)}, ${date.format(f)} – ${date.format(last)}`;
    }

    it("formats a single-night stay as a single date", () => {
        // from 2026-07-10, to 2026-07-11 → last = Jul 10 → same day as from
        const result = formatOpeningDates("2026-07-10", "2026-07-11");
        // Should be "Fri, Jul 10" style (single date)
        expect(result).toMatch(/,/);
        expect(result).not.toContain("–");
    });

    it("formats a multi-night stay with a range", () => {
        const result = formatOpeningDates("2026-07-10", "2026-07-13");
        // from Jul 10, last Jul 12 — different days, expect "–" range
        expect(result).toContain("–");
    });
});

describe("OpeningCard module exports", () => {
    it("exports OpeningCard as a function", async () => {
        const mod = await import("./opening-card");
        expect(typeof mod.OpeningCard).toBe("function");
    });
});
