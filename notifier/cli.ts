import { runTick, buildKvAdapter, type RunConfig } from "./check";

async function main(): Promise<void> {
    const config: RunConfig = {
        subscriberApiUrl: process.env.SUBSCRIBER_API_URL ?? "",
        subscriberApiSecret: process.env.SUBSCRIBER_API_SECRET ?? "",
        resendApiKey: process.env.RESEND_API_KEY ?? "",
        siteUrl: process.env.SITE_URL ?? "",
        forceEmail: process.env.FORCE_EMAIL === "true",
        dryRun: process.env.DRY_RUN === "true",
        kvAdapter: buildKvAdapter(),
        now: new Date(),
    };
    await runTick(config);
}

main().catch((err) => {
    console.error("[Fatal]", err);
    process.exit(1);
});
