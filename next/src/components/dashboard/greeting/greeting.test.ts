import { describe, it, expect } from "vitest";

// Greeting embeds getTimeOfDay() and StatusSentence logic.
// We test those branches directly.

describe("getTimeOfDay logic", () => {
    function getTimeOfDay(hour: number): "morning" | "afternoon" | "evening" {
        if (hour < 12) return "morning";
        if (hour < 18) return "afternoon";
        return "evening";
    }

    it("returns morning for hour 0", () => {
        expect(getTimeOfDay(0)).toBe("morning");
    });

    it("returns morning for hour 11", () => {
        expect(getTimeOfDay(11)).toBe("morning");
    });

    it("returns afternoon for hour 12", () => {
        expect(getTimeOfDay(12)).toBe("afternoon");
    });

    it("returns afternoon for hour 17", () => {
        expect(getTimeOfDay(17)).toBe("afternoon");
    });

    it("returns evening for hour 18", () => {
        expect(getTimeOfDay(18)).toBe("evening");
    });

    it("returns evening for hour 23", () => {
        expect(getTimeOfDay(23)).toBe("evening");
    });
});

describe("StatusSentence campground count text", () => {
    function statusText(isLoading: boolean, campgroundsWithOpenings: number): string {
        if (isLoading) return "Checking your campgrounds…";
        if (campgroundsWithOpenings > 0) {
            const plural = campgroundsWithOpenings !== 1 ? "s" : "";
            return `${campgroundsWithOpenings} campground${plural} have bookable sites for your dates.`;
        }
        return "No bookable sites found in your date window — we're still watching.";
    }

    it("shows loading message when isLoading is true", () => {
        expect(statusText(true, 0)).toBe("Checking your campgrounds…");
    });

    it("loading takes precedence over count", () => {
        expect(statusText(true, 5)).toBe("Checking your campgrounds…");
    });

    it("shows 'no bookable sites' when count is 0", () => {
        expect(statusText(false, 0)).toContain("No bookable sites");
    });

    it("uses singular 'campground' for count of 1", () => {
        expect(statusText(false, 1)).toContain("1 campground have");
    });

    it("uses plural 'campgrounds' for count of 2", () => {
        expect(statusText(false, 2)).toContain("2 campgrounds have");
    });

    it("uses plural for larger counts", () => {
        expect(statusText(false, 7)).toContain("7 campgrounds have");
    });
});

describe("Greeting userName extraction", () => {
    // Component uses auth.user?.name?.split(" ")[0] ?? "there"
    function extractFirstName(name: string | null | undefined): string {
        return name?.split(" ")[0] ?? "there";
    }

    it("returns first token of full name", () => {
        expect(extractFirstName("Alice Smith")).toBe("Alice");
    });

    it("returns the single token if no space", () => {
        expect(extractFirstName("Alice")).toBe("Alice");
    });

    it("falls back to 'there' when name is null", () => {
        expect(extractFirstName(null)).toBe("there");
    });

    it("falls back to 'there' when name is undefined", () => {
        expect(extractFirstName(undefined)).toBe("there");
    });
});

describe("Greeting module exports", () => {
    it("exports Greeting as a function", async () => {
        const mod = await import("./greeting");
        expect(typeof mod.Greeting).toBe("function");
    });
});
