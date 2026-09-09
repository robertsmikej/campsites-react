import type { MetadataRoute } from "next";

const SITE_URL = "https://campwatch.dev";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: "*",
                allow: ["/", "/discover"],
                // Signed-in surfaces and the API have nothing to index.
                disallow: ["/app", "/app/", "/api/", "/auth/"],
            },
        ],
        sitemap: `${SITE_URL}/sitemap.xml`,
    };
}
