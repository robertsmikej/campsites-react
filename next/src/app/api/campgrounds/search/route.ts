import { withCors } from "@/lib/responses";
import { withErrorLogging } from "@/lib/route-helpers";
import { REC_GOV_USER_AGENT } from "@/lib/recgov/types";

export interface SearchResult {
    id: string;
    name: string;
    area: string | null;
    previewImageUrl: string | null;
    state: string | null;
}

interface RecGovSearchResult {
    entity_id?: string;
    entity_type?: string;
    name?: string;
    parent_name?: string;
    state_code?: string;
    preview_image_url?: string | null;
}

// Public name search. Proxies recreation.gov's search endpoint and returns the
// top campground matches. No auth required; cached at the edge briefly.
async function getHandler(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();
    if (q.length < 2) {
        return withCors(
            new Response(JSON.stringify([]), {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "public, max-age=60, s-maxage=60",
                },
            }),
        );
    }

    const recGovUrl = `https://www.recreation.gov/api/search?q=${encodeURIComponent(q)}&entity_type=campground&size=10`;
    try {
        const resp = await fetch(recGovUrl, {
            headers: { "User-Agent": REC_GOV_USER_AGENT },
            cf: { cacheTtl: 300, cacheEverything: true },
        } as RequestInit);
        if (!resp.ok) {
            return withCors(
                new Response(JSON.stringify([]), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
            );
        }
        const data = (await resp.json()) as { results?: RecGovSearchResult[] };
        const results: SearchResult[] = (data.results ?? [])
            .filter((r) => r.entity_type === "campground" && r.entity_id && /^\d+$/.test(r.entity_id))
            .map((r) => ({
                id: String(r.entity_id),
                name: r.name ?? "(unnamed)",
                area: r.parent_name ?? null,
                previewImageUrl: r.preview_image_url ?? null,
                state: r.state_code ?? null,
            }))
            .slice(0, 8);
        return withCors(
            new Response(JSON.stringify(results), {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "public, max-age=300, s-maxage=300",
                },
            }),
        );
    } catch {
        return withCors(
            new Response(JSON.stringify([]), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }),
        );
    }
}
export const GET = withErrorLogging(getHandler, "GET /api/campgrounds/search");
