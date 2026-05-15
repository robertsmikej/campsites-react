import { readSession } from "@/lib/sessions";
import { getUserProfile, updateUserProfile, listCurators } from "@/lib/users";
import { jsonResponse, withCors } from "@/lib/responses";
import type { UserRole } from "@/types/user";

const VALID_ROLES: readonly UserRole[] = ["curator"];

function isValidRoles(value: unknown): value is UserRole[] {
    if (!Array.isArray(value)) return false;
    return value.every((r) => typeof r === "string" && VALID_ROLES.includes(r as UserRole));
}

export async function PUT(
    request: Request,
    context: { params: Promise<{ email: string }> },
): Promise<Response> {
    const { email: emailParam } = await context.params;
    const targetEmail = decodeURIComponent(emailParam).toLowerCase();

    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    const me = await getUserProfile(session.email);
    if (!me?.roles?.includes("curator")) {
        return withCors(jsonResponse({ error: "Forbidden" }, 403));
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return withCors(jsonResponse({ error: "Invalid JSON" }, 400));
    }

    const roles = (body as { roles?: unknown })?.roles;
    if (!isValidRoles(roles)) {
        return withCors(jsonResponse({ error: "Body must include roles: UserRole[]" }, 400));
    }

    const target = await getUserProfile(targetEmail);
    if (!target) return withCors(jsonResponse({ error: "User not found" }, 404));

    const removingCurator = target.roles?.includes("curator") && !roles.includes("curator");
    if (removingCurator) {
        const curators = await listCurators();
        if (curators.length <= 1 && curators.includes(targetEmail)) {
            return withCors(
                jsonResponse({ error: "Cannot remove the last curator" }, 400),
            );
        }
    }

    const updated = await updateUserProfile(targetEmail, { roles });
    return withCors(jsonResponse(updated));
}
