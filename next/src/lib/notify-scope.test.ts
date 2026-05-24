import { describe, it, expect } from "vitest";
import { resolveNotifyScope, matchPassesScope } from "./notify-scope";

describe("resolveNotifyScope", () => {
    it("prefers explicit notifyScope when set", () => {
        expect(resolveNotifyScope({ notifyScope: "favorites" }, "all")).toBe("favorites");
        expect(resolveNotifyScope({ notifyScope: "all", notifyAll: false }, "worthwhile")).toBe("all");
    });

    it("upgrades legacy notifyAll=true to 'all'", () => {
        expect(resolveNotifyScope({ notifyAll: true }, "favorites")).toBe("all");
    });

    it("falls back to the user default when neither is set", () => {
        expect(resolveNotifyScope({}, "favorites")).toBe("favorites");
        expect(resolveNotifyScope({}, "all")).toBe("all");
    });

    it("falls back to 'favorites' when user default is undefined", () => {
        expect(resolveNotifyScope({}, undefined)).toBe("favorites");
    });

    it("treats notifyAll=false the same as undefined", () => {
        expect(resolveNotifyScope({ notifyAll: false }, "all")).toBe("all");
    });
});

describe("matchPassesScope", () => {
    it("'all' lets every group through", () => {
        expect(matchPassesScope("favorites", "all")).toBe(true);
        expect(matchPassesScope("worthwhile", "all")).toBe(true);
        expect(matchPassesScope("all-others", "all")).toBe(true);
    });

    it("'worthwhile' passes favorites + worthwhile, blocks all-others", () => {
        expect(matchPassesScope("favorites", "worthwhile")).toBe(true);
        expect(matchPassesScope("worthwhile", "worthwhile")).toBe(true);
        expect(matchPassesScope("all-others", "worthwhile")).toBe(false);
    });

    it("'favorites' only passes favorites", () => {
        expect(matchPassesScope("favorites", "favorites")).toBe(true);
        expect(matchPassesScope("worthwhile", "favorites")).toBe(false);
        expect(matchPassesScope("all-others", "favorites")).toBe(false);
    });
});
