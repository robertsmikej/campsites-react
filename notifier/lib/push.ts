import { buildPushHTTPRequest } from "@pushforge/builder";
import type { PushSubscriptionRecord } from "../../next/src/lib/push/subscription";

export interface WebPushVapid {
    privateJWK: JsonWebKey;
    subject: string;
}

export interface SendResult {
    endpoint: string;
    status: number;
    gone: boolean;
}

// Send one Web Push. `gone` is true on 404/410 (subscription expired/unsubscribed)
// so the caller can prune it. Errors from the encryption/build step propagate.
export async function sendWebPush(
    subscription: PushSubscriptionRecord,
    payload: { title: string; body: string; url: string; tag?: string },
    vapid: WebPushVapid,
    fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
    const { endpoint, headers, body } = await buildPushHTTPRequest({
        privateJWK: vapid.privateJWK,
        subscription,
        message: { payload, adminContact: vapid.subject },
    });
    const res = await fetchImpl(endpoint, { method: "POST", headers, body });
    return {
        endpoint: subscription.endpoint,
        status: res.status,
        gone: res.status === 404 || res.status === 410,
    };
}
