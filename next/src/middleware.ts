import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { canonicalRedirectUrl } from "@/lib/canonical-host";
import { SESSION_COOKIE } from "@/lib/sessions";
import { applySecurityHeaders, httpsRedirectTarget } from "@/lib/security-headers";

// Paths that require a signed-in user. Anonymous visitors are sent to /discover,
// which shows the curator's list with a sign-in banner; the page itself sends an
// expired session on to /auth/google/start.
const PROTECTED_PREFIXES = ["/app"];

const IS_PRODUCTION = process.env.NODE_ENV === "production";

function requiresAuth(pathname: string): boolean {
    return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function secured(response: NextResponse): NextResponse {
    applySecurityHeaders(response.headers);
    return response;
}

function routeRequest(request: NextRequest): NextResponse {
    const { pathname, searchParams } = request.nextUrl;

    // Signed-in visitors to the marketing homepage go straight to their dashboard,
    // unless they explicitly asked to see it (?home — the account menu's "Home page"
    // link uses this). Dev skips the redirect (the DEV_USER bypass has no cookie).
    if (pathname === "/") {
        if (!IS_PRODUCTION) return NextResponse.next();
        if (searchParams.has("home")) return NextResponse.next();
        if (request.cookies.get(SESSION_COOKIE)?.value) {
            const url = request.nextUrl.clone();
            url.pathname = "/app";
            url.search = "";
            return NextResponse.redirect(url);
        }
        return NextResponse.next();
    }

    if (!requiresAuth(pathname)) return NextResponse.next();

    // In dev, the DEV_USER bypass authenticates via env var without ever
    // setting a session cookie — so the cookie check below would always
    // bounce a dev user. Skip the redirect entirely in non-production;
    // the page itself still calls /api/me and renders correctly.
    if (!IS_PRODUCTION) return NextResponse.next();

    const session = request.cookies.get(SESSION_COOKIE);
    if (session?.value) return NextResponse.next();

    const url = request.nextUrl.clone();
    url.pathname = "/discover";
    url.search = "";
    return NextResponse.redirect(url);
}

export function middleware(request: NextRequest) {
    // Plain-http requests reach the Worker as-is; upgrade before anything else
    // so no page or API response is ever served in the clear.
    const secureUrl = httpsRedirectTarget(new URL(request.url), IS_PRODUCTION);
    if (secureUrl) return secured(NextResponse.redirect(secureUrl, 308));

    // www.campwatch.dev is attached to this worker only so we can bounce it
    // here; the apex is the single canonical origin (service worker and push
    // subscriptions are origin-scoped, so the app must never serve on www).
    const { pathname } = request.nextUrl;
    const canonical = canonicalRedirectUrl(request.headers.get("host"), pathname, request.nextUrl.search);
    if (canonical) return secured(NextResponse.redirect(canonical, 301));

    return secured(routeRequest(request));
}

export const config = {
    // All paths, not just the auth-gated ones: the https/www redirects and the
    // security headers must cover every URL. The auth logic above still only
    // acts on "/" and "/app/*".
    matcher: ["/:path*"],
};
