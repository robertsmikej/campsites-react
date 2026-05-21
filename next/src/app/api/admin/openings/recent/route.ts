import { getEnv, getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { withErrorLogging } from "@/lib/route-helpers";

export interface RecentOpening {
    signature: string;
    campgroundId: string;
    campgroundName: string;
    siteId: string;
    siteName: string;
    from: string;
    to: string;
    nights: number;
    detectedAt: string;
}

const KV_KEY = "notifier:recent";

function auth(request: Request, secret: string): boolean {
    const header = request.headers.get("Authorization");
    return header === `Bearer ${secret}`;
}

function isValidBlob(value: unknown): value is RecentOpening[] {
    if (!Array.isArray(value)) return false;
    return value.every((item) => {
        if (!item || typeof item !== "object") return false;
        const r = item as Record<string, unknown>;
        return (
            typeof r.signature === "string" &&
            typeof r.campgroundId === "string" &&
            typeof r.campgroundName === "string" &&
            typeof r.siteId === "string" &&
            typeof r.siteName === "string" &&
            typeof r.from === "string" &&
            typeof r.to === "string" &&
            typeof r.nights === "number" &&
            typeof r.detectedAt === "string"
        );
    });
}

async function getHandler(request: Request): Promise<Response> {
    const env = getEnv();
    if (!env.API_SECRET) {
        return withCors(jsonResponse({ error: "Server misconfigured: API_SECRET not set" }, 500));
    }
    if (!auth(request, env.API_SECRET)) {
        return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    }

    const stored = (await getKv().get(KV_KEY, "json")) as RecentOpening[] | null;
    return withCors(jsonResponse(stored ?? []));
}
export const GET = withErrorLogging(getHandler, "GET /api/admin/openings/recent");

async function putHandler(request: Request): Promise<Response> {
    const env = getEnv();
    if (!env.API_SECRET) {
        return withCors(jsonResponse({ error: "Server misconfigured: API_SECRET not set" }, 500));
    }
    if (!auth(request, env.API_SECRET)) {
        return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return withCors(jsonResponse({ error: "Invalid JSON" }, 400));
    }

    if (!isValidBlob(body)) {
        return withCors(jsonResponse({ error: "Body must be a RecentOpening[]" }, 400));
    }

    await getKv().put(KV_KEY, JSON.stringify(body));
    return withCors(jsonResponse({ ok: true, count: body.length }));
}
export const PUT = withErrorLogging(putHandler, "PUT /api/admin/openings/recent");
