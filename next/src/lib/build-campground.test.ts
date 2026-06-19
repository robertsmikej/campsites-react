import { describe, it, expect } from "vitest";
import { buildCampgroundFromFacility } from "./build-campground";
import type { FacilitySummary } from "./recgov-facility";

const dates = { startDate: "2026-05-01", endDate: "2026-09-30" };

describe("buildCampgroundFromFacility", () => {
    it("maps the core facility fields and the supplied dates", () => {
        const facility: FacilitySummary = { id: "232358", name: "  Outlet  ", type: "campground" };
        const cg = buildCampgroundFromFacility(facility, dates);
        expect(cg).toMatchObject({
            id: "232358",
            name: "Outlet",
            site: "recreation.gov",
            type: "campground",
            sites: { favorites: [], worthwhile: [] },
            showOrHide: { Favorites: true, Worthwhile: true, "All Others": true },
            enabled: true,
            dates: { startDate: "2026-05-01", endDate: "2026-09-30" },
        });
    });

    it("includes trimmed area / description / image only when present", () => {
        const facility: FacilitySummary = {
            id: "1",
            name: "X",
            type: "cabin",
            area: "  Sawtooth  ",
            description: "  desc  ",
            imageUrl: "  http://img  ",
        };
        const cg = buildCampgroundFromFacility(facility, dates);
        expect(cg.area).toBe("Sawtooth");
        expect(cg.description).toBe("desc");
        expect(cg.image).toBe("http://img");

        const bare = buildCampgroundFromFacility({ id: "2", name: "Y", type: "lookout" }, dates);
        expect("area" in bare).toBe(false);
        expect("description" in bare).toBe(false);
        expect("image" in bare).toBe(false);
    });

    it("stamps addedAt so curator additions date the default", () => {
        const cg = buildCampgroundFromFacility({ id: "1", name: "X", type: "campground" }, dates);
        expect(typeof cg.addedAt).toBe("string");
    });
});
