import { describe, it, expect } from "vitest";
import { parseCampsite, type SiteDetail } from "./site-details";

// Trimmed real shape from recreation.gov /api/search/campsites
const RAW = {
    campsite_id: "69072",
    name: "002",
    campsite_type: "STANDARD NONELECTRIC",
    latitude: 44.1437,
    longitude: -114.9114,
    average_rating: 3,
    number_of_ratings: 3,
    aggregate_cell_coverage: 2,
    permitted_equipment: [
        { equipment_name: "Tent", max_length: 35 },
        { equipment_name: "RV", max_length: 35 },
    ],
    attributes: [
        { attribute_category: "site_details", attribute_name: "Shade", attribute_value: "Full" },
        { attribute_category: "amenities", attribute_name: "Fire Pit", attribute_value: "Y" },
        { attribute_category: "amenities", attribute_name: "Picnic Table", attribute_value: "Y" },
        { attribute_category: "amenities", attribute_name: "Accessibility", attribute_value: "Y" },
        { attribute_category: "site_details", attribute_name: "Campfire Allowed", attribute_value: "Yes" },
    ],
};

describe("parseCampsite", () => {
    it("maps the core fields", () => {
        const s = parseCampsite(RAW) as SiteDetail;
        expect(s.id).toBe("002");
        expect(s.campsiteId).toBe("69072");
        expect(s.lat).toBeCloseTo(44.1437);
        expect(s.lng).toBeCloseTo(-114.9114);
        expect(s.rating).toBe(3);
        expect(s.reviews).toBe(3);
        expect(s.cell).toBe(2);
        expect(s.shade).toBe("full");
    });

    it("parses string coordinates (real rec.gov shape) into numbers", () => {
        const s = parseCampsite({
            ...RAW,
            latitude: "37.73799345000000",
            longitude: "-119.56430680000000",
        }) as SiteDetail;
        expect(s.lat).toBeCloseTo(37.73799345);
        expect(s.lng).toBeCloseTo(-119.5643068);
    });

    it("treats unparseable or zero coordinates as null", () => {
        const s = parseCampsite({ ...RAW, latitude: "0", longitude: "0" }) as SiteDetail;
        expect(s.lat).toBeNull();
        expect(s.lng).toBeNull();
        const t = parseCampsite({ ...RAW, latitude: "N/A", longitude: "" }) as SiteDetail;
        expect(t.lat).toBeNull();
        expect(t.lng).toBeNull();
    });

    it("derives type rv with max length when RV equipment present", () => {
        const s = parseCampsite(RAW)!;
        expect(s.type).toBe("rv");
        expect(s.maxRvLength).toBe(35);
    });

    it("derives type tent when only tents permitted", () => {
        const s = parseCampsite({
            ...RAW,
            permitted_equipment: [{ equipment_name: "Tent", max_length: 0 }],
        })!;
        expect(s.type).toBe("tent");
    });

    it("reads amenities from the attributes array", () => {
        const s = parseCampsite(RAW)!;
        expect(s.amenities).toMatchObject({
            firePit: true,
            picnicTable: true,
            accessible: true,
            campfire: true,
        });
    });

    it("tolerates missing rating / shade / coords without throwing", () => {
        const s = parseCampsite({ campsite_id: "1", name: "A-01", permitted_equipment: [], attributes: [] })!;
        expect(s.rating).toBeNull();
        expect(s.reviews).toBe(0);
        expect(s.cell).toBeNull();
        expect(s.shade).toBeUndefined();
        expect(s.lat).toBeNull();
        expect(s.type).toBe("other");
    });

    it("returns null for an entry with no name", () => {
        expect(parseCampsite({ campsite_id: "1" })).toBeNull();
    });

    it("captures the trimmed loop name", () => {
        const site = parseCampsite({ name: "012", loop: "OUTLET CAMPGROUND ", latitude: "44.1", longitude: "-114.9" });
        expect(site?.loop).toBe("OUTLET CAMPGROUND");
    });

    it("omits loop when blank", () => {
        const site = parseCampsite({ name: "012", loop: "  " });
        expect(site?.loop).toBeUndefined();
    });
});
