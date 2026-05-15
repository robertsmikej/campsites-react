import { getKv } from "./cloudflare";
import { generateOpaqueToken } from "./crypto-helpers";

export interface Session {
    id: string;
    email: string;
    createdAt: string;
    expiresAt: string;
    userAgent?: string;
}

export const SESSION_COOKIE = "campwatch_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function sessionKey(id: string): string {
    return `session:${id}`;
}

function buildCookie(value: string, maxAge: number): string {
    return [
        `${SESSION_COOKIE}=${value}`,
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
        "Path=/",
        `Max-Age=${maxAge}`,
    ].join("; ");
}

export function clearingCookie(): string {
    return buildCookie("", 0);
}

function readCookie(request: Request, name: string): string | null {
    const header = request.headers.get("Cookie");
    if (!header) return null;
    for (const part of header.split(";")) {
        const [k, ...rest] = part.trim().split("=");
        if (k === name) return rest.join("=");
    }
    return null;
}

export async function createSession(
    email: string,
    request: Request,
): Promise<{ session: Session; cookie: string }> {
    const id = generateOpaqueToken(32);
    const now = new Date();
    const expires = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
    const userAgent = request.headers.get("User-Agent") ?? undefined;

    const session: Session = {
        id,
        email,
        createdAt: now.toISOString(),
        expiresAt: expires.toISOString(),
        ...(userAgent ? { userAgent } : {}),
    };

    await getKv().put(sessionKey(id), JSON.stringify(session));
    return { session, cookie: buildCookie(id, SESSION_TTL_SECONDS) };
}

export async function readSession(request: Request): Promise<Session | null> {
    const id = readCookie(request, SESSION_COOKIE);
    if (!id) return null;

    const kv = getKv();
    const session = (await kv.get(sessionKey(id), "json")) as Session | null;
    if (!session) return null;

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
        await kv.delete(sessionKey(id));
        return null;
    }

    return session;
}

export async function destroySession(request: Request): Promise<{ cookie: string }> {
    const id = readCookie(request, SESSION_COOKIE);
    if (id) {
        await getKv().delete(sessionKey(id));
    }
    return { cookie: clearingCookie() };
}
