import { describe, it, expect } from "vitest";
import { isDateBlackedOut, stayOverlapsBlackout } from "./blackout";
import type { BlackoutRange } from "@/types/campground";

const RANGES: BlackoutRange[] = [
    { from: "2026-07-10", to: "2026-07-12", label: "Redfish booked" },
    { from: "2026-08-01", to: "2026-08-01" }, // single day, no label
];

describe("isDateBlackedOut", () => {
    it("inside, boundary, and outside days", () => {
        expect(isDateBlackedOut("2026-07-10", RANGES)).toBe(true); // first day
        expect(isDateBlackedOut("2026-07-11", RANGES)).toBe(true); // middle
        expect(isDateBlackedOut("2026-07-12", RANGES)).toBe(true); // last day (inclusive)
        expect(isDateBlackedOut("2026-07-09", RANGES)).toBe(false);
        expect(isDateBlackedOut("2026-07-13", RANGES)).toBe(false);
        expect(isDateBlackedOut("2026-08-01", RANGES)).toBe(true); // single-day range
    });

    it("empty and absent ranges", () => {
        expect(isDateBlackedOut("2026-07-10", [])).toBe(false);
        expect(isDateBlackedOut("2026-07-10", undefined)).toBe(false);
    });
});

describe("stayOverlapsBlackout", () => {
    it("a stay whose nights are fully inside conflicts", () => {
        expect(stayOverlapsBlackout("2026-07-10", "2026-07-12", RANGES)).toBe(true);
    });

    it("a stay straddling one blackout night conflicts", () => {
        // Nights Jul 9, 10, 11 — Jul 10 is blacked out.
        expect(stayOverlapsBlackout("2026-07-09", "2026-07-12", RANGES)).toBe(true);
    });

    it("checkout on the blackout's first morning does NOT conflict", () => {
        // Nights Jul 8, 9 — checkout morning Jul 10 is the blackout start.
        expect(stayOverlapsBlackout("2026-07-08", "2026-07-10", RANGES)).toBe(false);
    });

    it("check-in the day a blackout ends DOES conflict (that night is blacked out)", () => {
        // Night of Jul 12 is the blackout's last inclusive day.
        expect(stayOverlapsBlackout("2026-07-12", "2026-07-13", RANGES)).toBe(true);
    });

    it("check-in the day AFTER a blackout ends does not conflict", () => {
        expect(stayOverlapsBlackout("2026-07-13", "2026-07-15", RANGES)).toBe(false);
    });

    it("no ranges → never conflicts", () => {
        expect(stayOverlapsBlackout("2026-07-10", "2026-07-12", [])).toBe(false);
        expect(stayOverlapsBlackout("2026-07-10", "2026-07-12", undefined)).toBe(false);
    });
});
