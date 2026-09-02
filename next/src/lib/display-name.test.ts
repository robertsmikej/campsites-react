import { describe, it, expect } from "vitest";
import { displayName } from "./display-name";

describe("displayName", () => {
    it("appends Campground when the name lacks it", () => {
        expect(displayName("Shoreline", "campground")).toBe("Shoreline Campground");
    });

    it("leaves the name alone when it already contains the type word", () => {
        expect(displayName("Outlet Campground", "campground")).toBe("Outlet Campground");
    });

    it("is case-insensitive when checking for the type word", () => {
        expect(displayName("Redfish CAMPGROUND", "campground")).toBe("Redfish CAMPGROUND");
    });

    it("appends Cabin when the name lacks it", () => {
        expect(displayName("Ranger Station", "cabin")).toBe("Ranger Station Cabin");
    });

    it("leaves a cabin name alone when it already says Cabin", () => {
        expect(displayName("Redfish Cabin", "cabin")).toBe("Redfish Cabin");
    });

    it("appends Lookout when the name lacks it", () => {
        expect(displayName("Deadwood", "lookout")).toBe("Deadwood Lookout");
    });

    it("leaves a lookout name alone when it already says Lookout", () => {
        expect(displayName("Deadwood Lookout Rec Cabin", "lookout")).toBe("Deadwood Lookout Rec Cabin");
    });

    it("returns the name unchanged when type is undefined", () => {
        expect(displayName("Shoreline")).toBe("Shoreline");
    });

    it("returns the name unchanged when type is an unknown string", () => {
        expect(displayName("Shoreline", "yurt")).toBe("Shoreline");
    });
});
