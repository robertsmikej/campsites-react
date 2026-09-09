import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
    // Security response headers live in src/middleware.ts so they also cover
    // redirects and API routes.
    poweredByHeader: false,
    experimental: {
        viewTransition: true,
    },
};

void initOpenNextCloudflareForDev();

export default nextConfig;
