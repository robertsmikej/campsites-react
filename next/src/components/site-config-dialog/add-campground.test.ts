import { describe, it, expect } from "vitest";
import { defaultDates } from "./add-campground";

describe("defaultDates", () => {
    it("keeps the rolling 3-month window when it ends before season end", () => {
        // June 9: +3-month window ends Sep 30 — exactly at the cap, untouched.
        const d = defaultDates(new Date(2026, 5, 9));
        expect(d.startDate).toBe("2026-06-01");
        expect(d.endDate).toBe("2026-09-30");
    });

    it("caps the end date at Sep 30 for mid-season adds", () => {
        // July 15: rolling window would end Oct 31 — clamp to season end.
        const d = defaultDates(new Date(2026, 6, 15));
        expect(d.startDate).toBe("2026-07-01");
        expect(d.endDate).toBe("2026-09-30");
    });

    it("caps the end date at Sep 30 for late-season adds", () => {
        // September 5: rolling window would end Dec 31 — clamp to season end.
        const d = defaultDates(new Date(2026, 8, 5));
        expect(d.startDate).toBe("2026-09-01");
        expect(d.endDate).toBe("2026-09-30");
    });

    it("uses next year's season end for off-season adds (rolling window wins)", () => {
        // November 10: season end is Sep 30 NEXT year; the +3 window (Feb 28)
        // is shorter, so it stands. Never an October-or-later end within season.
        const d = defaultDates(new Date(2026, 10, 10));
        expect(d.startDate).toBe("2026-11-01");
        expect(d.endDate).toBe("2027-02-28");
    });
});
