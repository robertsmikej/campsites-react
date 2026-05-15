import { readSession } from "@/lib/sessions";
import { getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { putUserCampgrounds } from "@/lib/user-campgrounds";
import { sites as staticSites } from "@/data/sites";
import { getSitewideDefaultSettings } from "@/lib/settings";
import type { SiteConfig } from "@/types/campground";

export async function POST(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    const fromKv = (await getKv().get("config:campgrounds", "json")) as {
        campgrounds?: SiteConfig;
        globalSettings?: { stayLengths: number[]; validStartDays: string[] };
    } | null;

    const defaults = getSitewideDefaultSettings({});
    const campgrounds = fromKv?.campgrounds ?? staticSites;
    const globalSettings = fromKv?.globalSettings ?? {
        stayLengths: defaults.dates.stayLengths,
        validStartDays: defaults.dates.validStartDays,
    };

    const stored = await putUserCampgrounds(session.email, { campgrounds, globalSettings });
    return withCors(jsonResponse(stored));
}
