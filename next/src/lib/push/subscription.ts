import { getKv } from "@/lib/cloudflare";

export interface PushSubscriptionRecord {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    createdAt: string;
}

export function pushSubsKey(email: string): string {
    return `push-subs:${email.toLowerCase()}`;
}

export function isValidSubscription(v: unknown): v is PushSubscriptionRecord {
    if (!v || typeof v !== "object") return false;
    const o = v as Record<string, unknown>;
    const keys = o.keys as Record<string, unknown> | undefined;
    return (
        typeof o.endpoint === "string" &&
        o.endpoint.length > 0 &&
        !!keys &&
        typeof keys.p256dh === "string" &&
        typeof keys.auth === "string"
    );
}

export async function readPushSubs(email: string): Promise<PushSubscriptionRecord[]> {
    const raw = (await getKv().get(pushSubsKey(email), "json")) as PushSubscriptionRecord[] | null;
    return Array.isArray(raw) ? raw.filter(isValidSubscription) : [];
}

export async function upsertPushSub(email: string, sub: PushSubscriptionRecord): Promise<void> {
    const existing = await readPushSubs(email);
    const next = [...existing.filter((s) => s.endpoint !== sub.endpoint), sub];
    await getKv().put(pushSubsKey(email), JSON.stringify(next));
}

export async function removePushSub(email: string, endpoint: string): Promise<void> {
    const existing = await readPushSubs(email);
    const next = existing.filter((s) => s.endpoint !== endpoint);
    if (next.length === existing.length) return;
    await getKv().put(pushSubsKey(email), JSON.stringify(next));
}
