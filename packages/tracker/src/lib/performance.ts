/**
 * Performance sample helpers (Web Vitals-ish).
 * Values are rounded/clamped to reduce fingerprint surface.
 */

export const PERF_SAMPLE_RATE = 0.1; // 10% of pageviews
export const PERF_MAX_MS = 60_000;
export const PERF_RULES_VERSION = "v1";

/** Round ms to 50ms buckets; clamp to [0, PERF_MAX_MS]. 0 = missing. */
export function normalizePerfMs(value: number | null | undefined): number {
    if (value === null || value === undefined) return 0;
    if (!Number.isFinite(value) || value <= 0) return 0;
    const clamped = Math.min(PERF_MAX_MS, Math.max(0, value));
    return Math.round(clamped / 50) * 50;
}

export function shouldSamplePerf(random: () => number = Math.random): boolean {
    return random() < PERF_SAMPLE_RATE;
}

/**
 * Best-effort navigation timing (ms from navigation start).
 * Uses PerformanceNavigationTiming when available.
 */
export function readNavigationPerf(
    performanceObj: Performance | undefined,
): { ttfbMs: number; lcpMs: number } {
    if (!performanceObj || typeof performanceObj.getEntriesByType !== "function") {
        return { ttfbMs: 0, lcpMs: 0 };
    }
    try {
        const nav = performanceObj.getEntriesByType(
            "navigation",
        )[0] as PerformanceNavigationTiming | undefined;
        if (!nav) return { ttfbMs: 0, lcpMs: 0 };
        const ttfb = normalizePerfMs(nav.responseStart);
        // Prefer loadEventEnd as coarse "page ready"; true LCP needs observer (optional later)
        const lcp = normalizePerfMs(
            nav.loadEventEnd || nav.domContentLoadedEventEnd || nav.duration,
        );
        return { ttfbMs: ttfb, lcpMs: lcp };
    } catch {
        return { ttfbMs: 0, lcpMs: 0 };
    }
}
