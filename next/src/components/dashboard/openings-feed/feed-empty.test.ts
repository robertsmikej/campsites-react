import { describe, it, expect } from "vitest";

// FeedEmpty renders a single copy string. We verify the module exports
// correctly and check the copy matches what the component renders.

describe("FeedEmpty module exports", () => {
    it("exports FeedEmpty as a function", async () => {
        const mod = await import("./feed-empty");
        expect(typeof mod.FeedEmpty).toBe("function");
    });
});

describe("FeedEmpty source copy", () => {
    it("source contains the empty-state copy", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const src = readFileSync(resolve(__dirname, "feed-empty.tsx"), "utf8");
        expect(src).toContain("No new openings today");
        expect(src).toContain("still watching");
    });
});
