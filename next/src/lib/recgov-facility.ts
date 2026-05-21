export interface FacilitySummary {
    id: string;
    name: string;
    area?: string;
    type: "campground" | "cabin" | "lookout";
    description?: string;
    imageUrl?: string;
}

/**
 * Given a bare integer string or a recreation.gov campground URL, returns
 * the numeric facility ID as a string. Returns null for anything else.
 */
export function parseFacilityId(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // Bare integer
    if (/^\d+$/.test(trimmed)) return trimmed;

    // Try as URL
    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        return null;
    }

    if (!url.hostname.endsWith("recreation.gov")) return null;

    const match = url.pathname.match(/\/campgrounds\/(\d+)(?:\/|$)/);
    if (!match) return null;

    return match[1] ?? null;
}

interface RecGovCampground {
    facility_name?: string;
    addresses?: Array<{ city?: string; state_code?: string }>;
    facility_description_map?: Record<string, string>;
    media?: Array<{ media_type?: string; url?: string }>;
}

function titleCase(s: string): string {
    return s
        .split(" ")
        .map((w) => (w.length > 0 ? (w[0] ?? "").toUpperCase() + w.slice(1).toLowerCase() : w))
        .join(" ");
}

function cleanName(raw: string): string {
    // Strip trailing parenthetical suffix like "(ID)"
    const stripped = raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
    return titleCase(stripped.toLocaleLowerCase());
}

function stripHtml(html: string): string {
    return html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Fetches a facility summary from recreation.gov.
 * - 4xx responses: returns null (with console.warn).
 * - 5xx / network errors: rethrows (caller handles).
 */
export async function fetchFacilitySummary(id: string): Promise<FacilitySummary | null> {
    const url = `https://www.recreation.gov/api/camps/campgrounds/${id}`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });

    if (response.status >= 400 && response.status < 500) {
        console.warn(`[recgov] ${response.status} for facility ${id}`);
        return null;
    }

    const data = (await response.json()) as { campground?: RecGovCampground };
    const cg = data.campground ?? {};

    const rawName = cg.facility_name;
    if (!rawName || rawName.trim() === "") return null;

    const name = cleanName(rawName);

    // Type inferred from raw name (uppercase)
    const upper = rawName.toUpperCase();
    let type: FacilitySummary["type"];
    if (upper.includes("LOOKOUT")) {
        type = "lookout";
    } else if (upper.includes("CABIN")) {
        type = "cabin";
    } else {
        type = "campground";
    }

    // Area from first address city
    const city = cg.addresses?.[0]?.city;
    const area = city ? cleanName(city) : undefined;

    // Description: first non-empty of Overview / Description
    let description: string | undefined;
    if (cg.facility_description_map) {
        const raw = cg.facility_description_map["Overview"] || cg.facility_description_map["Description"];
        if (raw && raw.trim()) {
            const stripped = stripHtml(raw);
            description = stripped.slice(0, 300).trim() || undefined;
        }
    }

    // Image: first media entry with type "Image" and https URL
    let imageUrl: string | undefined;
    if (cg.media) {
        const img = cg.media.find((m) => m.media_type === "Image" && m.url?.startsWith("https://"));
        if (img?.url) imageUrl = img.url;
    }

    const summary: FacilitySummary = { id, name, type };
    if (area !== undefined) summary.area = area;
    if (description !== undefined) summary.description = description;
    if (imageUrl !== undefined) summary.imageUrl = imageUrl;

    return summary;
}
