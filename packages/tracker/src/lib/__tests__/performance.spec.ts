import { describe, expect, test } from "vitest";
import { normalizePerfMs, shouldSamplePerf, PERF_SAMPLE_RATE } from "../performance";

describe("normalizePerfMs", () => {
    test("returns 0 for invalid", () => {
        expect(normalizePerfMs(undefined)).toBe(0);
        expect(normalizePerfMs(null)).toBe(0);
        expect(normalizePerfMs(-1)).toBe(0);
        expect(normalizePerfMs(NaN)).toBe(0);
    });
    test("rounds to 50ms and clamps", () => {
        expect(normalizePerfMs(1)).toBe(0);
        expect(normalizePerfMs(24)).toBe(0);
        expect(normalizePerfMs(25)).toBe(50);
        expect(normalizePerfMs(120)).toBe(100);
        expect(normalizePerfMs(999999)).toBe(60000);
    });
});

describe("shouldSamplePerf", () => {
    test("respects rate with deterministic random", () => {
        expect(shouldSamplePerf(() => 0)).toBe(true);
        expect(shouldSamplePerf(() => PERF_SAMPLE_RATE)).toBe(false);
        expect(shouldSamplePerf(() => 0.99)).toBe(false);
    });
});
