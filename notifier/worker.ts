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
}

export default {
    async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
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
        };
        // Two cron patterns, distinguished by controller.cron:
        //   "* * * * *"   -> tick: fast-lane fetch (high-tier) + notify from cache
        //   "*/5 * * * *" -> sweep: fetch normal/low-tier into cache
        if (controller.cron === "*/5 * * * *") {
            ctx.waitUntil(runSweep(config, env.SUBSCRIBERS as never));
        } else {
            ctx.waitUntil(runTick(config));
        }
    },
};
