import { getEnv, getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";

const KV_KEY = "notifier:first-seen";

type FirstSeenMap = Record<string, string>; // signature → ISO timestamp

function isValidMap(value: unknown): value is FirstSeenMap {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    return Object.values(value as Record<string, unknown>).every((v) => typeof v === "string");
}

function auth(request: Request, secret: string): boolean {
    const header = request.headers.get("Authorization");
    return header === `Bearer ${secret}`;
}

export async function GET(request: Request): Promise<Response> {
    const env = getEnv();
    if (!env.API_SECRET) {
        return withCors(jsonResponse({ error: "Server misconfigured: API_SECRET not set" }, 500));
    }
    if (!auth(request, env.API_SECRET)) {
        return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    }

    const kv = getKv();
    const stored = (await kv.get(KV_KEY, "json")) as FirstSeenMap | null;
    return withCors(jsonResponse(stored ?? {}));
}

export async function PUT(request: Request): Promise<Response> {
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

    if (
        !body ||
        typeof body !== "object" ||
        !("map" in (body as object)) ||
        !isValidMap((body as { map: unknown }).map)
    ) {
        return withCors(jsonResponse({ error: "Body must include map: { [signature]: isoTimestamp }" }, 400));
    }

    const kv = getKv();
    await kv.put(KV_KEY, JSON.stringify((body as { map: FirstSeenMap }).map));
    return withCors(jsonResponse({ ok: true }));
}
