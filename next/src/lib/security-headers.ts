// Response headers applied by the middleware to every page and API response.
// The app was shipping none of these (and served plain HTTP with no redirect).

const ONE_YEAR_SECONDS = 31_536_000;

// Report-only for now so nothing breaks while the allowlist is validated in
// browser consoles. Flip to Content-Security-Policy once it has been quiet.
// Sources: self-hosted fonts/scripts, Cloudflare Web Analytics beacon, Leaflet
// satellite tiles over https, inline styles from Tailwind/next/font.
const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
].join("; ");

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
    "Strict-Transport-Security": `max-age=${ONE_YEAR_SECONDS}; includeSubDomains`,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Content-Security-Policy-Report-Only": CONTENT_SECURITY_POLICY,
};

/** Sets every security header on `headers` and returns it. Existing values win. */
export function applySecurityHeaders(headers: Headers): Headers {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        if (!headers.has(name)) {
            headers.set(name, value);
        }
    }
    return headers;
}

/**
 * Returns the https URL to redirect to when a request arrived over plain http,
 * or null when it is already secure (or not a production request, so local dev
 * over http keeps working).
 */
export function httpsRedirectTarget(requestUrl: URL, isProduction: boolean): URL | null {
    if (!isProduction || requestUrl.protocol !== "http:") {
        return null;
    }
    const secure = new URL(requestUrl.toString());
    secure.protocol = "https:";
    return secure;
}
