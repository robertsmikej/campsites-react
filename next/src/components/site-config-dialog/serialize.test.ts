import { describe, it, expect } from "vitest";
import { toEditableCampground, sanitizeCampground, createEmptyCampground } from "./serialize";
import { CUSTOM_CATALOG_OPTION } from "./types";

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

    it("marks campgrounds not in the catalog as custom", () => {
        const e = toEditableCampground(
            { id: "99999", name: "Mystery", sites: { favorites: [], worthwhile: [] } },
            new Set(["111", "222"]),
        );
        expect(e.catalogId).toBe(CUSTOM_CATALOG_OPTION);
    });

    it("preserves catalogId when the id is in the catalog", () => {
        const e = toEditableCampground(
            { id: "222", name: "Listed", sites: { favorites: [], worthwhile: [] } },
            new Set(["111", "222"]),
        );
        expect(e.catalogId).toBe("222");
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
        editable.favoritesArray = ["A"];
        editable.worthwhileArray = ["B"];

        const out = sanitizeCampground(editable);
        expect(out).toMatchObject({
            id: "1",
            name: "Test",
            sites: { favorites: ["A"], worthwhile: ["B"] },
        });
    });

    it("omits notifyAll/validStartDays/stayLengths/enabled when not set", () => {
        const editable = createEmptyCampground();
        editable.id = "1";
        editable.name = "Test";
        const out = sanitizeCampground(editable) as Record<string, unknown>;
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
});
