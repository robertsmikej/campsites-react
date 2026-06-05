import { jsonResponse, withCors } from "@/lib/responses";
import { getDefaultConfig } from "@/lib/default-config";
import { withErrorLogging } from "@/lib/route-helpers";

async function getHandler(): Promise<Response> {
    return withCors(jsonResponse(await getDefaultConfig()));
}
export const GET = withErrorLogging(getHandler, "GET /api/default");
