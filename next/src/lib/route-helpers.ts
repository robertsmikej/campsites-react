export function withErrorLogging<T extends (...args: never[]) => Promise<Response>>(
    handler: T,
    routeName: string,
): T {
    return (async (...args: Parameters<T>) => {
        try {
            return await handler(...args);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const stack = err instanceof Error ? err.stack : undefined;
            console.error(`[route:${routeName}]`, {
                message,
                stack,
                at: new Date().toISOString(),
            });
            return new Response(JSON.stringify({ error: "Internal error" }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    }) as T;
}
