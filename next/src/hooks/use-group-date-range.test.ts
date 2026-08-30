import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getGroupDefaultRange } from "./use-group-date-range";

const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("getGroupDefaultRange", () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date(2026, 7, 30)); // Aug 30, 2026, local midnight
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("falls back to a 120-day window when the group has no configured dates", () => {
        const { start, end } = getGroupDefaultRange(null);
        expect(iso(start)).toBe("2026-08-30");
        expect(iso(end)).toBe("2026-12-27");
    });

    it("shows the full configured window for a winter cabin running past year-end", () => {
        // Redfish Cabin: Sep 1 2026 – Mar 31 2027. The Feb 22–26 2027 opening
        // has to be on the axis, so the window can't stop at start + 120 days.
        const { start, end } = getGroupDefaultRange({ start: "2026-09-01", end: "2027-03-31" });
        expect(iso(start)).toBe("2026-09-01");
        expect(iso(end)).toBe("2027-03-31");
    });

    it("starts at today when the configured window already opened", () => {
        const { start, end } = getGroupDefaultRange({ start: "2026-05-01", end: "2026-09-30" });
        expect(iso(start)).toBe("2026-08-30");
        expect(iso(end)).toBe("2026-09-30");
    });

    it("bounds an absurdly wide configured window to 365 days", () => {
        const { start, end } = getGroupDefaultRange({ start: "2026-09-01", end: "2030-01-01" });
        expect(iso(start)).toBe("2026-09-01");
        expect(iso(end)).toBe("2027-08-31"); // start + 364 days
    });

    it("collapses to the end date when the window is already over", () => {
        const { start, end } = getGroupDefaultRange({ start: "2026-05-01", end: "2026-06-30" });
        expect(iso(start)).toBe("2026-06-30");
        expect(iso(end)).toBe("2026-06-30");
    });
});
