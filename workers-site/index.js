// Redirect shim. The old campsites-finder Worker forwards every request to
// the new campwatch Worker, preserving path, query string, and request method.
//
// Why a 307 (Temporary Redirect): preserves the request method (GET, POST, PUT)
// for API callers like the notifier's older runs and any old unsubscribe link
// embedded in already-sent emails. Older browsers might cache 308 (Permanent
// Redirect) responses too aggressively for our taste, so 307 is the safer
// default during the migration window.

const TARGET_ORIGIN = "https://campwatch.mikeroberts421.workers.dev";

const cors = (response) => {
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return response;
};

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (request.method === "OPTIONS") {
            return cors(new Response(null, { status: 204 }));
        }

        if (url.pathname === "/" || url.pathname === "") {
            return Response.redirect(`${TARGET_ORIGIN}/app`, 307);
        }

        const target = new URL(url.pathname + url.search, TARGET_ORIGIN);
        return Response.redirect(target.toString(), 307);
    },
};
