import { describe, expect, test } from "vitest";

import {
    aggregateVisitorLoyalty,
    frequencyBucket,
    returnGapBucket,
    loyaltyBucketsToTableRows,
} from "../visitor-loyalty";

describe("frequencyBucket", () => {
    test("fixed boundaries", () => {
        expect(frequencyBucket(1)).toBe("1");
        expect(frequencyBucket(2)).toBe("2");
        expect(frequencyBucket(3)).toBe("3-5");
        expect(frequencyBucket(5)).toBe("3-5");
        expect(frequencyBucket(6)).toBe("6-10");
        expect(frequencyBucket(10)).toBe("6-10");
        expect(frequencyBucket(11)).toBe("11+");
        expect(frequencyBucket(100)).toBe("11+");
    });
});

describe("returnGapBucket", () => {
    const day = 24 * 60 * 60 * 1000;
    test("fixed boundaries", () => {
        expect(returnGapBucket(0)).toBe("<1d");
        expect(returnGapBucket(day * 0.5)).toBe("<1d");
        expect(returnGapBucket(day * 1)).toBe("1-7d");
        expect(returnGapBucket(day * 6.9)).toBe("1-7d");
        expect(returnGapBucket(day * 7)).toBe("7-30d");
        expect(returnGapBucket(day * 29)).toBe("7-30d");
        expect(returnGapBucket(day * 30)).toBe("30d+");
        expect(returnGapBucket(day * 90)).toBe("30d+");
    });
});

describe("aggregateVisitorLoyalty", () => {
    test("counts frequency and gaps; ignores missing visitor_id for loyalty metrics", () => {
        const summary = aggregateVisitorLoyalty(
            [
                {
                    visit_id: "v1",
                    visitor_id: "a",
                    first_seen_at: "2026-07-01T00:00:00.000Z",
                },
                {
                    visit_id: "v2",
                    visitor_id: "a",
                    first_seen_at: "2026-07-03T00:00:00.000Z", // 2d gap
                },
                {
                    visit_id: "v3",
                    visitor_id: "b",
                    first_seen_at: "2026-07-02T00:00:00.000Z",
                },
                {
                    visit_id: "v4",
                    visitor_id: null,
                    first_seen_at: "2026-07-02T12:00:00.000Z",
                },
            ],
            4,
        );

        expect(summary.available).toBe(true);
        expect(summary.identifiedVisitors).toBe(2);
        expect(summary.identifiedVisits).toBe(3);
        expect(summary.identityCoverageRate).toBeCloseTo(0.75);
        expect(loyaltyBucketsToTableRows(summary.frequencyBuckets)).toEqual([
            ["1", 1], // b
            ["2", 1], // a
            ["3-5", 0],
            ["6-10", 0],
            ["11+", 0],
        ]);
        // one gap of 2 days for visitor a
        expect(
            summary.returnGapBuckets.find((b) => b.bucket === "1-7d")?.visitors,
        ).toBe(1);
        expect(summary.note).toMatch(/localStorage/i);
    });

    test("no-identity when only anonymous visits", () => {
        const summary = aggregateVisitorLoyalty(
            [
                {
                    visit_id: "v1",
                    visitor_id: null,
                    first_seen_at: "2026-07-01T00:00:00.000Z",
                },
            ],
            1,
        );
        expect(summary.reason).toBe("no-identity");
        expect(summary.identifiedVisitors).toBe(0);
    });
});
