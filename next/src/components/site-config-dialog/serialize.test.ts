import { describe, it, expect } from "vitest";
import {
    toEditableCampground,
    sanitizeCampground,
    createEmptyCampground,
    enableWithHighCapCheck,
} from "./serialize";

describe("toEditableCampground", () => {
    it("populates favoritesArray and worthwhileArray from the input sites", () => {
        const e = toEditableCampground({
            id: "232358",
            name: "Outlet",
            sites: { favorites: ["013", "015"], worthwhile: ["016"] },
        });
        expect(e.favoritesArray).toEqual(["013", "015"]);
        expect(e.worthwhileArray).toEqual(["016"]);
        expect(e.favoritesText).toBe("013, 015");
        expect(e.worthwhileText).toBe("016");
    });

    it("defaults enabled to true when omitted", () => {
        const e = toEditableCampground({
            id: "1",
            name: "X",
            sites: { favorites: [], worthwhile: [] },
        });
        expect(e.enabled).toBe(true);
    });

    it("respects enabled: false", () => {
        const e = toEditableCampground({
            id: "1",
            name: "X",
            enabled: false,
            sites: { favorites: [], worthwhile: [] },
        });
        expect(e.enabled).toBe(false);
    });
});

describe("sanitizeCampground", () => {
    it("emits the standard fields", () => {
        const editable = createEmptyCampground();
        editable.id = "1";
        editable.name = "Test";
        editable.favoritesText = "A";
        editable.worthwhileText = "B";

        const out = sanitizeCampground(editable);
        expect(out).toMatchObject({
            id: "1",
            name: "Test",
            sites: { favorites: ["A"], worthwhile: ["B"] },
        });
    });

    it("saves favorites/worthwhile typed in the textarea even when the array fields are stale", () => {
        // Reproduces the configure-dialog bug: when availableSites is empty the
        // editor shows a textarea that updates only *Text, leaving *Array stale.
        const editable = toEditableCampground({
            id: "234007",
            name: "Black Rock",
            sites: { favorites: [], worthwhile: [] },
        });
        editable.favoritesText = "011, 008";
        editable.worthwhileText = "009";

        const out = sanitizeCampground(editable);
        expect(out.sites.favorites).toEqual(["011", "008"]);
        expect(out.sites.worthwhile).toEqual(["009"]);
    });

    it("clears favorites when the textarea is emptied", () => {
        const editable = toEditableCampground({
            id: "1",
            name: "X",
            sites: { favorites: ["011"], worthwhile: ["009"] },
        });
        editable.favoritesText = "";
        editable.worthwhileText = "";

        const out = sanitizeCampground(editable);
        expect(out.sites.favorites).toEqual([]);
        expect(out.sites.worthwhile).toEqual([]);
    });

    it("omits notifyAll/validStartDays/stayLengths/enabled when not set", () => {
        const editable = createEmptyCampground();
        editable.id = "1";
        editable.name = "Test";
        const out = sanitizeCampground(editable) as unknown as Record<string, unknown>;
        expect("notifyAll" in out).toBe(false);
        expect("validStartDays" in out).toBe(false);
        expect("stayLengths" in out).toBe(false);
        expect("enabled" in out).toBe(false);
    });

    it("emits enabled: false explicitly when disabled", () => {
        const editable = createEmptyCampground();
        editable.id = "1";
        editable.name = "Test";
        editable.enabled = false;
        const out = sanitizeCampground(editable);
        expect(out.enabled).toBe(false);
    });

    it("emits notifyAll when set", () => {
        const editable = createEmptyCampground();
        editable.id = "1";
        editable.name = "Test";
        editable.notifyAll = true;
        const out = sanitizeCampground(editable);
        expect(out.notifyAll).toBe(true);
    });

    it("persists checkPriority high/low and omits normal/unset", () => {
        const base = { ...createEmptyCampground(), name: "X", id: "1" };

        expect(sanitizeCampground({ ...base, checkPriority: "high" }).checkPriority).toBe("high");
        expect(sanitizeCampground({ ...base, checkPriority: "low" }).checkPriority).toBe("low");
        expect("checkPriority" in sanitizeCampground({ ...base, checkPriority: "normal" })).toBe(false);
        expect("checkPriority" in sanitizeCampground(base)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// enableWithHighCapCheck
// ---------------------------------------------------------------------------

function makeHigh(id: string, enabled = true): EditableCampground {
    return { ...createEmptyCampground(), id, name: id, checkPriority: "high", enabled };
}

function makeNormal(id: string, enabled = true): EditableCampground {
    return { ...createEmptyCampground(), id, name: id, enabled };
}

// Re-import EditableCampground type (already resolved via serialize imports above)
import type { EditableCampground } from "./types";

describe("enableWithHighCapCheck", () => {
    it("re-enabling a high campground with 3 other enabled highs demotes it to normal", () => {
        const campgrounds: EditableCampground[] = [
            makeHigh("A"),
            makeHigh("B"),
            makeHigh("C"),
            { ...makeHigh("D"), enabled: false },
        ];
        const result = enableWithHighCapCheck(campgrounds, 3);
        expect(result.enabled).toBe(true);
        expect(result.checkPriority).toBeUndefined();
    });

    it("re-enabling a high campground with 2 other enabled highs keeps high priority", () => {
        const campgrounds: EditableCampground[] = [
            makeHigh("A"),
            makeHigh("B"),
            makeNormal("C"),
            { ...makeHigh("D"), enabled: false },
        ];
        const result = enableWithHighCapCheck(campgrounds, 3);
        expect(result.enabled).toBe(true);
        expect(result.checkPriority).toBe("high");
    });

    it("re-enabling a normal campground at the cap is untouched besides enabled:true", () => {
        const campgrounds: EditableCampground[] = [
            makeHigh("A"),
            makeHigh("B"),
            makeHigh("C"),
            { ...makeNormal("D"), enabled: false },
        ];
        const result = enableWithHighCapCheck(campgrounds, 3);
        expect(result.enabled).toBe(true);
        expect(result.checkPriority).toBeUndefined();
    });

    it("disabled other highs don't count toward the cap", () => {
        const campgrounds: EditableCampground[] = [
            { ...makeHigh("A"), enabled: false },
            { ...makeHigh("B"), enabled: false },
            { ...makeHigh("C"), enabled: false },
            { ...makeHigh("D"), enabled: false },
        ];
        const result = enableWithHighCapCheck(campgrounds, 3);
        expect(result.enabled).toBe(true);
        expect(result.checkPriority).toBe("high");
    });
});
