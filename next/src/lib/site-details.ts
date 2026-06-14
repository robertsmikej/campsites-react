export interface SiteDetail {
    id: string; // site name/number, e.g. "002"
    campsiteId: string; // rec.gov campsite_id (booking link)
    lat: number | null;
    lng: number | null;
    type: "tent" | "rv" | "walkin" | "other";
    maxRvLength?: number;
    rating: number | null;
    reviews: number;
    cell: number | null; // aggregate 0–4 (NOT per-carrier — API only gives aggregate)
    shade?: "full" | "partial" | "sun";
    amenities: {
        firePit?: boolean;
        picnicTable?: boolean;
        accessible?: boolean;
        tentPad?: boolean;
        campfire?: boolean;
    };
}

interface RawAttr {
    attribute_category?: string;
    attribute_name?: string;
    attribute_value?: string | number;
}
interface RawEquip {
    equipment_name?: string;
    max_length?: number;
}
interface RawCampsite {
    campsite_id?: string;
    name?: string;
    campsite_type?: string;
    latitude?: number | string;
    longitude?: number | string;
    average_rating?: number;
    number_of_ratings?: number;
    aggregate_cell_coverage?: number;
    permitted_equipment?: RawEquip[];
    attributes?: RawAttr[];
}

const YES = new Set(["y", "yes", "true", "1"]);
const isYes = (v: unknown) => typeof v === "string" && YES.has(v.trim().toLowerCase());

/**
 * rec.gov returns campsite latitude/longitude as numeric strings
 * (e.g. "37.73799345000000"). Coerce to a finite number; treat 0 / blank /
 * non-numeric as "no coordinate" so the map skips those sites rather than
 * dropping a pin at (0, 0).
 */
function toCoord(v: unknown): number | null {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseFloat(v) : NaN;
    return Number.isFinite(n) && n !== 0 ? n : null;
}

function deriveType(
    equip: RawEquip[],
    campsiteType?: string,
): { type: SiteDetail["type"]; maxRvLength?: number } {
    const names = equip.map((e) => (e.equipment_name ?? "").toLowerCase());
    const ct = (campsiteType ?? "").toLowerCase();
    if (ct.includes("walk") || ct.includes("hike")) return { type: "walkin" };
    const rv = equip.find((e) => /rv|trailer/i.test(e.equipment_name ?? ""));
    if (rv) return { type: "rv", maxRvLength: rv.max_length || undefined };
    if (names.some((n) => n.includes("tent"))) return { type: "tent" };
    return { type: "other" };
}

function attr(attrs: RawAttr[], name: string): string | undefined {
    const a = attrs.find((x) => (x.attribute_name ?? "").toLowerCase() === name.toLowerCase());
    return a?.attribute_value != null ? String(a.attribute_value) : undefined;
}

/** Map one recreation.gov campsite object to a SiteDetail. Returns null if it has no name. */
export function parseCampsite(raw: unknown): SiteDetail | null {
    if (!raw || typeof raw !== "object") return null;
    const c = raw as RawCampsite;
    const name = (c.name ?? "").trim();
    if (!name) return null;

    const equip = Array.isArray(c.permitted_equipment) ? c.permitted_equipment : [];
    const attrs = Array.isArray(c.attributes) ? c.attributes : [];
    const { type, maxRvLength } = deriveType(equip, c.campsite_type);

    const shadeRaw = (attr(attrs, "Shade") ?? "").toLowerCase();
    const shade: SiteDetail["shade"] = shadeRaw.startsWith("full")
        ? "full"
        : shadeRaw.startsWith("part")
          ? "partial"
          : shadeRaw.includes("sun")
            ? "sun"
            : undefined;

    return {
        id: name,
        campsiteId: String(c.campsite_id ?? ""),
        lat: toCoord(c.latitude),
        lng: toCoord(c.longitude),
        type,
        ...(maxRvLength ? { maxRvLength } : {}),
        rating: typeof c.average_rating === "number" ? c.average_rating : null,
        reviews: typeof c.number_of_ratings === "number" ? c.number_of_ratings : 0,
        cell: typeof c.aggregate_cell_coverage === "number" ? c.aggregate_cell_coverage : null,
        ...(shade ? { shade } : {}),
        amenities: {
            firePit: isYes(attr(attrs, "Fire Pit")),
            picnicTable: isYes(attr(attrs, "Picnic Table")),
            accessible: isYes(attr(attrs, "Accessibility")),
            tentPad: isYes(attr(attrs, "Tent Pad")),
            campfire: isYes(attr(attrs, "Campfire Allowed")),
        },
    };
}
