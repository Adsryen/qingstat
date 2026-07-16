import { describe, expect, test, vi } from "vitest";

import {
    buildV1Report,
    isV1Interval,
    isV1ReportId,
} from "../api-v1-reports";

describe("isV1ReportId / isV1Interval", () => {
    test("accepts known reports and intervals", () => {
        expect(isV1ReportId("paths")).toBe(true);
        expect(isV1ReportId("nope")).toBe(false);
        expect(isV1Interval("7d")).toBe(true);
        expect(isV1Interval("2h")).toBe(false);
    });
});

describe("buildV1Report", () => {
    test("overview maps counts to rows", async () => {
        const analyticsEngine = {
            getCounts: vi.fn().mockResolvedValue({
                views: 10,
                visitors: 4,
                bounces: 1,
            }),
        };

        const result = await buildV1Report(analyticsEngine as never, {
            siteId: "example.com",
            report: "overview",
            interval: "7d",
            tz: "UTC",
            filters: {},
        });

        expect(result.columns).toEqual(["metric", "value"]);
        expect(result.rows).toEqual([
            ["views", 10],
            ["visitors", 4],
            ["bounces", 1],
        ]);
        expect(result.truncated).toBe(false);
        expect(analyticsEngine.getCounts).toHaveBeenCalledWith(
            "example.com",
            "7d",
            "UTC",
            {},
        );
    });

    test("paths truncates at 1000", async () => {
        const data = Array.from({ length: 1001 }, (_, i) => [
            `/p/${i}`,
            1,
            2,
        ]);
        const analyticsEngine = {
            getCountByPath: vi.fn().mockResolvedValue(data),
        };

        const result = await buildV1Report(analyticsEngine as never, {
            siteId: "example.com",
            report: "paths",
            interval: "7d",
            tz: "UTC",
            filters: {},
        });

        expect(result.truncated).toBe(true);
        expect(result.rows).toHaveLength(1000);
        expect(result.columns).toEqual(["path", "visitors", "views"]);
    });
});
