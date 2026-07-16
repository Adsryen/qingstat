/**
 * In-memory sliding/fixed window rate limiter for open API tokens.
 * Not shared across Worker isolates — documented MVP limitation.
 */

export type RateLimitOptions = {
    windowMs?: number;
    max?: number;
};

export type RateLimitResult = {
    allowed: boolean;
    retryAfterSec: number;
};

type WindowState = {
    windowStart: number;
    count: number;
};

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 60;

const windows = new Map<string, WindowState>();

/**
 * Check and consume one request against the per-key window.
 * On exceed returns allowed:false and Retry-After style seconds.
 */
export function checkRateLimit(
    key: string,
    now: number,
    opts?: RateLimitOptions,
): RateLimitResult {
    const windowMs = opts?.windowMs ?? DEFAULT_WINDOW_MS;
    const max = opts?.max ?? DEFAULT_MAX;

    let state = windows.get(key);
    if (!state || now - state.windowStart >= windowMs) {
        state = { windowStart: now, count: 0 };
        windows.set(key, state);
    }

    if (state.count >= max) {
        const elapsed = now - state.windowStart;
        const remainingMs = Math.max(0, windowMs - elapsed);
        return {
            allowed: false,
            retryAfterSec: Math.max(1, Math.ceil(remainingMs / 1000)),
        };
    }

    state.count += 1;
    return { allowed: true, retryAfterSec: 0 };
}

/** Test helper: clear all windows. */
export function resetRateLimitState(): void {
    windows.clear();
}
