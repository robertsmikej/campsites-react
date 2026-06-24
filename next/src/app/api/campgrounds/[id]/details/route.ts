import { getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { withErrorLogging } from "@/lib/route-helpers";
import { REC_GOV_USER_AGENT } from "@/lib/recgov/types";

export interface CampgroundDetails {
    facilityId: string;
    name: string | null;
    previewImageUrl: string | null;
    latitude: number | null;
    longitude: number | null;
    cachedAt: number;
}

const CACHE_PREFIX = "cg-details:";
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

async function fetchSearchPreview(facilityId: string, facilityName: string | null): Promise<string | null> {
    if (!facilityName) return null;
    const url = `https://www.recreation.gov/api/search?q=${encodeURIComponent(facilityName)}&entity_type=campground&size=10`;
    try {
        const resp = await fetch(url, { headers: { "User-Agent": REC_GOV_USER_AGENT } });
        if (!resp.ok) return null;
        const data = (await resp.json()) as {
            results?: Array<{ entity_id?: string; preview_image_url?: string | null }>;
        };
        const match = data.results?.find((r) => r.entity_id === facilityId);
        return match?.preview_image_url ?? null;
    } catch {
        return null;
    }
}

async function fetchCampgroundLatLng(
    facilityId: string,
): Promise<{ name: string | null; latitude: number | null; longitude: number | null }> {
    try {
        const resp = await fetch(`https://www.recreation.gov/api/camps/campgrounds/${facilityId}`, {
            headers: { "User-Agent": REC_GOV_USER_AGENT },
        });
        if (!resp.ok) return { name: null, latitude: null, longitude: null };
        const data = (await resp.json()) as {
            campground?: {
                facility_name?: string;
                facility_latitude?: number;
                facility_longitude?: number;
            };
        };
        return {
            name: data.campground?.facility_name ?? null,
            latitude: data.campground?.facility_latitude ?? null,
            longitude: data.campground?.facility_longitude ?? null,
        };
    } catch {
        return { name: null, latitude: null, longitude: null };
    }
}

async function getHandler(_req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
    const { id } = await context.params;

    if (!id || !/^\d+$/.test(id)) {
        return withCors(jsonResponse({ error: "Invalid campground id" }, 400));
    }

    const kv = getKv();
    const cacheKey = `${CACHE_PREFIX}${id}`;

    // Check cache
    const cached = (await kv.get(cacheKey, "json")) as CampgroundDetails | null;
    if (cached && cached.cachedAt + CACHE_TTL_SECONDS * 1000 > Date.now()) {
        return withCors(jsonResponse(cached));
    }

    // Fetch both endpoints in parallel
    const latLng = await fetchCampgroundLatLng(id);
    const previewImageUrl = await fetchSearchPreview(id, latLng.name);

    const details: CampgroundDetails = {
        facilityId: id,
        name: latLng.name,
        previewImageUrl,
        latitude: latLng.latitude,
        longitude: latLng.longitude,
        cachedAt: Date.now(),
    };

    await kv.put(cacheKey, JSON.stringify(details), { expirationTtl: CACHE_TTL_SECONDS });

    return withCors(jsonResponse(details));
}
export const GET = withErrorLogging(getHandler, "GET /api/campgrounds/[id]/details");
