import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/sessions";

// Paths that require a signed-in user. Anonymous visitors get 307'd to
// /auth/google/start with returnTo set to the original path + query.
const PROTECTED_PREFIXES = ["/app"];

function requiresAuth(pathname: string): boolean {
    return PROTECTED_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
}

export function middleware(request: NextRequest) {
    const { pathname, search } = request.nextUrl;
    if (!requiresAuth(pathname)) return NextResponse.next();

    const session = request.cookies.get(SESSION_COOKIE);
    if (session?.value) return NextResponse.next();

    const returnTo = pathname + search;
    const url = request.nextUrl.clone();
    url.pathname = "/auth/google/start";
    url.search = `?returnTo=${encodeURIComponent(returnTo)}`;
    return NextResponse.redirect(url);
}

export const config = {
    matcher: ["/app", "/app/:path*"],
};
