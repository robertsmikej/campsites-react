import { destroySession } from "@/lib/sessions";

export async function POST(request: Request): Promise<Response> {
    const { cookie } = await destroySession(request);
    const url = new URL(request.url);
    const response = Response.redirect(`${url.origin}/`, 302);
    const mutable = new Response(response.body, response);
    mutable.headers.append("Set-Cookie", cookie);
    return mutable;
}
