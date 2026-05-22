import { getEnv } from "@/lib/cloudflare";
import { normalizeEmail } from "@/lib/email";
import { verifyUnsubscribeToken } from "@/lib/hmac";
import { deleteUser } from "@/lib/users";
import { withErrorLogging } from "@/lib/route-helpers";

function htmlResponse(body: string, status = 200): Response {
    return new Response(body, {
        status,
        headers: { "Content-Type": "text/html; charset=utf-8" },
    });
}

const PAGE_STYLE = `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
    max-width:520px;margin:80px auto;padding:0 24px;color:#1a1614;text-align:center;line-height:1.55;`;

function pageShell(title: string, body: string): string {
    return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · CampWatch</title>
</head><body style="background:#fbf6ea;margin:0;">
<div style="${PAGE_STYLE}">${body}</div>
</body></html>`;
}

async function validate(request: Request): Promise<{ email: string } | { error: Response }> {
    const url = new URL(request.url);
    const email = normalizeEmail(url.searchParams.get("email"));
    const token = url.searchParams.get("token");

    if (!email || !token) {
        return { error: htmlResponse(pageShell("Missing parameters", "<h2>Missing email or token.</h2>"), 400) };
    }

    const env = getEnv();
    if (!env.API_SECRET) {
        return {
            error: htmlResponse(
                pageShell("Server error", "<h2>Server misconfigured: API_SECRET not set.</h2>"),
                500,
            ),
        };
    }

    const valid = await verifyUnsubscribeToken(email, token, env.API_SECRET);
    if (!valid) {
        return {
            error: htmlResponse(
                pageShell("Invalid link", "<h2>This unsubscribe link is invalid or expired.</h2>"),
                403,
            ),
        };
    }

    return { email };
}

async function getHandler(request: Request): Promise<Response> {
    const result = await validate(request);
    if ("error" in result) return result.error;
    const { email } = result;

    const url = new URL(request.url);
    const action = url.pathname + url.search;

    return htmlResponse(
        pageShell(
            "Confirm unsubscribe",
            `<h2 style="margin:0 0 12px;">Unsubscribe from CampWatch</h2>
            <p style="margin:0 0 24px;color:#555;">We&rsquo;ll stop sending alerts to <strong>${email}</strong> and remove your watchlist.</p>
            <form method="POST" action="${action}" style="margin:0;">
                <button type="submit" style="background:#1f3d2a;color:#fbf6ea;border:0;padding:14px 28px;font-size:14px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;cursor:pointer;border-radius:2px;">
                    Yes, unsubscribe me
                </button>
            </form>
            <p style="margin:24px 0 0;font-size:13px;color:#888;">Change your mind? Just close this tab.</p>`,
        ),
    );
}
export const GET = withErrorLogging(getHandler, "GET /api/unsubscribe");

async function postHandler(request: Request): Promise<Response> {
    const result = await validate(request);
    if ("error" in result) return result.error;
    const { email } = result;

    await deleteUser(email);

    return htmlResponse(
        pageShell(
            "Unsubscribed",
            `<h2 style="margin:0 0 12px;">You&rsquo;re unsubscribed.</h2>
            <p style="margin:0;color:#555;"><strong>${email}</strong> has been removed from CampWatch alerts.</p>
            <p style="margin:24px 0 0;font-size:13px;color:#888;">See you out there.</p>`,
        ),
    );
}
export const POST = withErrorLogging(postHandler, "POST /api/unsubscribe");
