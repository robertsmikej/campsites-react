import { getEnv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";

export async function GET(request: Request): Promise<Response> {
    const env = getEnv();
    if (!env.API_SECRET) {
        return withCors(jsonResponse({ error: "Server misconfigured: API_SECRET not set" }, 500));
    }

    const auth = request.headers.get("Authorization");
    if (!auth || auth !== `Bearer ${env.API_SECRET}`) {
        return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    }

    const emails: string[] = [];
    let cursor: string | undefined;
    do {
        const result = await env.SUBSCRIBERS.list({ prefix: "email:", cursor });
        for (const key of result.keys) {
            const value = (await env.SUBSCRIBERS.get(key.name, "json")) as { email?: string } | null;
            if (value?.email) emails.push(value.email);
        }
        cursor = result.list_complete ? undefined : result.cursor;
    } while (cursor);

    return withCors(jsonResponse({ subscribers: emails }));
}
