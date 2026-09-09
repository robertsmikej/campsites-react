import type { MetadataRoute } from "next";

const SITE_URL = "https://campwatch.dev";

// Only the two public pages. Everything under /app is per-user.
export default function sitemap(): MetadataRoute.Sitemap {
    return [
        { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
        { url: `${SITE_URL}/discover`, changeFrequency: "daily", priority: 0.8 },
    ];
}
