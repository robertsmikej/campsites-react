import { run } from "./check";
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
    async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        ctx.waitUntil(
            run({
                subscriberApiUrl: env.SUBSCRIBER_API_URL,
                subscriberApiSecret: env.SUBSCRIBER_API_SECRET,
                resendApiKey: env.RESEND_API_KEY,
                siteUrl: env.SITE_URL ?? "",
                forceEmail: false,
                dryRun: env.DRY_RUN === "true",
                kvAdapter: new WorkerKvAdapter(env.SUBSCRIBERS as never),
                now: new Date(),
            }),
        );
    },
};
