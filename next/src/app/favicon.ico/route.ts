// Browsers request /favicon.ico regardless of <link rel="icon">. Redirect to
// the real SVG icon so the request doesn't 404.
export function GET(): Response {
    return new Response(null, {
        status: 301,
        headers: { Location: "/icon.svg", "Cache-Control": "public, max-age=604800, immutable" },
    });
}
