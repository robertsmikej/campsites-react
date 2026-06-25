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

// Deliberately a standalone copy of next/src/lib/push/send.ts (not a re-export):
// the @pushforge/builder *runtime* import must live in a notifier/ file so
// wrangler's esbuild resolves it from notifier/node_modules when bundling this
// worker. A next/src file importing it only resolves against next/node_modules,
// which the notifier deploy job doesn't install — that broke the bundle.
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
