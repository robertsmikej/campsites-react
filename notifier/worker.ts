import { runTick, runSweep } from "./check";
import { WorkerKvAdapter } from "../next/src/lib/recgov/worker-kv";
import type { KVNamespace, ScheduledController, ExecutionContext } from "@cloudflare/workers-types";

interface Env {
    SUBSCRIBERS: KVNamespace;
    RESEND_API_KEY: string;
    SUBSCRIBER_API_SECRET: string;
    SUBSCRIBER_API_URL: string;
    SITE_URL?: string;
    DRY_RUN?: string;
    VAPID_PRIVATE_JWK?: string;
    /** Dead-man's-switch URL (e.g. healthchecks.io) pinged after a successful tick;
     *  if pings stop, the external monitor alerts that the notifier has stalled. */
    HEARTBEAT_URL?: string;
}

export default {
    async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        const vapid = env.VAPID_PRIVATE_JWK
            ? {
                  privateJWK: JSON.parse(env.VAPID_PRIVATE_JWK) as JsonWebKey,
                  subject: "mailto:hello@campwatch.dev",
              }
            : undefined;
        const config = {
            subscriberApiUrl: env.SUBSCRIBER_API_URL,
            subscriberApiSecret: env.SUBSCRIBER_API_SECRET,
            resendApiKey: env.RESEND_API_KEY,
            siteUrl: env.SITE_URL ?? "",
            forceEmail: false,
            dryRun: env.DRY_RUN === "true",
            kvAdapter: new WorkerKvAdapter(env.SUBSCRIBERS as never),
            // scheduledTime keeps the minute stable across slow starts.
            now: new Date(controller.scheduledTime),
            ...(vapid ? { vapid } : {}),
        };
        // Two cron patterns, distinguished by controller.cron:
        //   "* * * * *"   -> tick: fast-lane fetch (high-tier) + notify from cache
        //   "*/5 * * * *" -> sweep: fetch normal/low-tier into cache
        if (controller.cron === "*/5 * * * *") {
            ctx.waitUntil(runSweep(config, env.SUBSCRIBERS as never));
        } else {
            // Ping the heartbeat only after a successful tick — if runTick throws (or
            // the cron stops firing), the ping is skipped and the external monitor alerts.
            const heartbeat = env.HEARTBEAT_URL;
            ctx.waitUntil(
                runTick(config, env.SUBSCRIBERS as never).then(() =>
                    heartbeat
                        ? fetch(heartbeat).then(
                              () => undefined,
                              () => undefined,
                          )
                        : undefined,
                ),
            );
        }
    },
};
