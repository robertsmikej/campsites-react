// Curator-only endpoint to delete a user record (profile, campgrounds,
// notifier-state, and any sessions belonging to that email). Idempotent.

import { getEnv } from "@/lib/cloudflare";
import { readSession } from "@/lib/sessions";
import { deleteUser, getUserProfile } from "@/lib/users";
import { jsonResponse, withCors } from "@/lib/responses";

async function isAuthorized(request: Request): Promise<boolean> {
    const env = getEnv();
    const auth = request.headers.get("Authorization");
    if (env.API_SECRET && auth === `Bearer ${env.API_SECRET}`) return true;

    const session = await readSession(request);
    if (!session) return false;
    const profile = await getUserProfile(session.email);
    return !!profile?.roles?.includes("curator");
}

export async function DELETE(
    request: Request,
    context: { params: Promise<{ email: string }> },
): Promise<Response> {
    if (!(await isAuthorized(request))) {
        return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    }

    const { email: encoded } = await context.params;
    const email = decodeURIComponent(encoded);
    if (!email || !email.includes("@")) {
        return withCors(jsonResponse({ error: "Invalid email" }, 400));
    }

    const existed = !!(await getUserProfile(email));
    await deleteUser(email);

    return withCors(jsonResponse({ email, existed, deleted: true }));
}
