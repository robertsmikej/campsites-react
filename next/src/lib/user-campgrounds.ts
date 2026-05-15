import { getKv } from "./cloudflare";
import type { SiteConfig, GlobalSettings } from "@/types/campground";

export interface UserCampgroundsRecord {
    campgrounds: SiteConfig;
    globalSettings: GlobalSettings;
    updatedAt: string;
}

function key(email: string): string {
    return `user:${email}:campgrounds`;
}

export async function getUserCampgrounds(email: string): Promise<UserCampgroundsRecord | null> {
    return (await getKv().get(key(email), "json")) as UserCampgroundsRecord | null;
}

export async function putUserCampgrounds(
    email: string,
    record: Omit<UserCampgroundsRecord, "updatedAt">,
): Promise<UserCampgroundsRecord> {
    const stored: UserCampgroundsRecord = {
        ...record,
        updatedAt: new Date().toISOString(),
    };
    await getKv().put(key(email), JSON.stringify(stored));
    return stored;
}

export async function deleteUserCampgrounds(email: string): Promise<void> {
    await getKv().delete(key(email));
}
