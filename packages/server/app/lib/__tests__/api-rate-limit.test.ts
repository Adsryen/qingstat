import { afterEach, describe, expect, test } from "vitest";

import { checkRateLimit, resetRateLimitState } from "../api-rate-limit";

afterEach(() => {
    resetRateLimitState();
});

describe("checkRateLimit", () => {
    test("allows up to max then blocks", () => {
        const key = "tok-1";
        const now = 1_000_000;
        const opts = { windowMs: 60_000, max: 3 };

        expect(checkRateLimit(key, now, opts).allowed).toBe(true);
        expect(checkRateLimit(key, now + 1, opts).allowed).toBe(true);
        expect(checkRateLimit(key, now + 2, opts).allowed).toBe(true);

        const blocked = checkRateLimit(key, now + 3, opts);
        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfterSec).toBeGreaterThan(0);
    });

    test("resets after window elapses", () => {
        const key = "tok-2";
        const opts = { windowMs: 1000, max: 1 };
        const t0 = 5_000;

        expect(checkRateLimit(key, t0, opts).allowed).toBe(true);
        expect(checkRateLimit(key, t0 + 100, opts).allowed).toBe(false);
        expect(checkRateLimit(key, t0 + 1000, opts).allowed).toBe(true);
    });

    test("isolates keys", () => {
        const opts = { windowMs: 60_000, max: 1 };
        const now = 10_000;
        expect(checkRateLimit("a", now, opts).allowed).toBe(true);
        expect(checkRateLimit("b", now, opts).allowed).toBe(true);
        expect(checkRateLimit("a", now + 1, opts).allowed).toBe(false);
        expect(checkRateLimit("b", now + 1, opts).allowed).toBe(false);
    });
});
