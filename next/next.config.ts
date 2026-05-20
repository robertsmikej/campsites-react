import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
    experimental: {
        viewTransition: true,
    },
};

void initOpenNextCloudflareForDev();

export default nextConfig;
