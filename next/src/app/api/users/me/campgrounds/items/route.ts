import { readSession } from "@/lib/sessions";
import { getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { getUserCampgrounds, putUserCampgrounds } from "@/lib/user-campgrounds";
import { getSitewideDefaultSettings } from "@/lib/settings";
import type { Campground, GlobalSettings, SiteConfig } from "@/types/campground";
import { withErrorLogging } from "@/lib/route-helpers";

interface DefaultConfig {
    campgrounds?: SiteConfig;
    globalSettings?: GlobalSettings;
}

function defaultGlobalSettings(): GlobalSettings {
    const defaults = getSitewideDefaultSettings({});
    return {
        stayLengths: defaults.dates.stayLengths,
        validStartDays: defaults.dates.validStartDays,
    };
}

async function postHandler(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return withCors(jsonResponse({ error: "Invalid JSON" }, 400));
    }
    const id = (body as { id?: unknown })?.id;
    if (typeof id !== "string" || !id) {
        return withCors(jsonResponse({ error: "Body must include id: string" }, 400));
    }

    const def = (await getKv().get("config:campgrounds", "json")) as DefaultConfig | null;
    if (!def?.campgrounds) {
        return withCors(jsonResponse({ error: "No default config to copy from" }, 404));
    }

    const fromDefault: Campground | undefined = def.campgrounds["recreation.gov"]?.find((c) => c.id === id);
    if (!fromDefault) {
        return withCors(jsonResponse({ error: "Campground not in default list" }, 404));
    }

    const existing = await getUserCampgrounds(session.email);
    const userCampgrounds = existing?.campgrounds ?? { "recreation.gov": [] };
    const userGlobalSettings: GlobalSettings = existing?.globalSettings ?? defaultGlobalSettings();

    const already = userCampgrounds["recreation.gov"].some((c) => c.id === id);
    if (already) {
        return withCors(
            jsonResponse({
                message: "Already in your list",
                campgrounds: userCampgrounds,
                globalSettings: userGlobalSettings,
                updatedAt: existing?.updatedAt ?? null,
            }),
        );
    }

    const next: SiteConfig = {
        "recreation.gov": [...userCampgrounds["recreation.gov"], fromDefault],
    };
    const stored = await putUserCampgrounds(session.email, {
        campgrounds: next,
        globalSettings: userGlobalSettings,
    });
    return withCors(jsonResponse(stored));
}
export const POST = withErrorLogging(postHandler, "POST /api/users/me/campgrounds/items");
