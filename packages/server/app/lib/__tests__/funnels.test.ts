import { describe, expect, test } from "vitest";

import { computeFunnelFromSequences, normalizeSteps } from "../funnels";

describe("normalizeSteps", () => {
    test("requires 2-5 steps", () => {
        expect(() => normalizeSteps([{ type: "url", value: "/a" }])).toThrow();
        expect(() =>
            normalizeSteps([
                { type: "url", value: "/a" },
                { type: "url", value: "/b" },
            ]),
        ).not.toThrow();
    });
});

describe("computeFunnelFromSequences", () => {
    const steps = normalizeSteps([
        { type: "url", value: "/a", mode: "exact" },
        { type: "url", value: "/b", mode: "exact" },
        { type: "url", value: "/c", mode: "exact" },
    ]);

    test("strict ordered progress", () => {
        const result = computeFunnelFromSequences(steps, [
            {
                id: "v1",
                paths: [
                    { path: "/a", at: "2026-01-01T00:00:00.000Z" },
                    { path: "/b", at: "2026-01-01T00:01:00.000Z" },
                    { path: "/c", at: "2026-01-01T00:02:00.000Z" },
                ],
            },
            {
                id: "v2",
                paths: [
                    { path: "/a", at: "2026-01-01T00:00:00.000Z" },
                    { path: "/c", at: "2026-01-01T00:01:00.000Z" }, // skip b → stuck at step0 only for completion of step0
                ],
            },
            {
                id: "v3",
                paths: [{ path: "/b", at: "2026-01-01T00:00:00.000Z" }], // no step0
            },
        ]);

        expect(result[0].visitors).toBe(2); // v1,v2
        expect(result[1].visitors).toBe(1); // v1 only
        expect(result[2].visitors).toBe(1); // v1 only
        expect(result[1].dropOff).toBe(1);
        expect(result[2].conversionFromStart).toBeCloseTo(0.5);
    });
});
