// Small retry helper for the notifier's network hops. Every call the tick makes
// (rec.gov, Resend, the campwatch.dev admin API) can fail transiently, and a
// single failure used to either drop an alert for good or duplicate it next tick.

export interface RetryOptions {
    /** Total attempts including the first one. */
    attempts: number;
    /** Delay before the second attempt; doubles on each further attempt. */
    baseDelayMs: number;
    /** Label used in the warning logged between attempts. */
    label: string;
    /** Injectable for tests; defaults to a real timer. */
    sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `operation` up to `attempts` times, waiting `baseDelayMs * 2^n` between
 * tries. Rethrows the last error once attempts are exhausted so the caller
 * decides what a hard failure means.
 */
export async function retry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
    const sleep = options.sleep ?? realSleep;
    let lastError: unknown;
    for (let attempt = 1; attempt <= options.attempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (attempt === options.attempts) {
                break;
            }
            const delayMs = options.baseDelayMs * 2 ** (attempt - 1);
            console.warn(
                `[retry] ${options.label} attempt ${attempt}/${options.attempts} failed: ${(error as Error).message}; retrying in ${delayMs}ms`,
            );
            await sleep(delayMs);
        }
    }
    throw lastError;
}

/** Throws when the response is not 2xx so `retry` treats it as a failed attempt. */
export function assertOk(response: Response, label: string): Response {
    if (!response.ok) {
        throw new Error(`${label} returned HTTP ${response.status}`);
    }
    return response;
}
