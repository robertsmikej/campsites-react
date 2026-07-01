import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "./relative-time";

const base = Date.parse("2026-07-01T12:00:00.000Z");
const ago = (ms: number) => new Date(base - ms).toISOString();
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatRelativeTime", () => {
    it("returns null for missing input", () => {
        expect(formatRelativeTime(null, base)).toBeNull();
        expect(formatRelativeTime(undefined, base)).toBeNull();
        expect(formatRelativeTime("", base)).toBeNull();
    });

    it("returns null for an unparseable date", () => {
        expect(formatRelativeTime("not-a-date", base)).toBeNull();
    });

    it("says 'just now' within the last 45 seconds", () => {
        expect(formatRelativeTime(ago(0), base)).toBe("just now");
        expect(formatRelativeTime(ago(30 * SEC), base)).toBe("just now");
    });

    it("treats a future timestamp as just now (clock skew)", () => {
        expect(formatRelativeTime(ago(-5 * MIN), base)).toBe("just now");
    });

    it("formats minutes", () => {
        expect(formatRelativeTime(ago(60 * SEC), base)).toBe("1m ago");
        expect(formatRelativeTime(ago(5 * MIN), base)).toBe("5m ago");
        expect(formatRelativeTime(ago(59 * MIN), base)).toBe("59m ago");
    });

    it("formats hours", () => {
        expect(formatRelativeTime(ago(60 * MIN), base)).toBe("1h ago");
        expect(formatRelativeTime(ago(3 * HOUR), base)).toBe("3h ago");
    });

    it("formats days", () => {
        expect(formatRelativeTime(ago(25 * HOUR), base)).toBe("1d ago");
        expect(formatRelativeTime(ago(3 * DAY), base)).toBe("3d ago");
    });
});
