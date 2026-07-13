import { describe, expect, test } from "vitest";

import {
    ANALYTICS_NAVIGATION_GROUPS,
    LEGACY_METRIC_DEFINITIONS,
    METRIC_DEFINITIONS,
    getMetricDefinition,
    getMetricValueAvailability,
} from "../metrics";
import type { MetricCode } from "../metrics";

const coreMetricCodes: MetricCode[] = [
    "pageViews",
    "visitors",
    "visits",
    "uniqueIps",
    "onlineVisits",
    "activeVisits5m",
    "activeVisits30m",
];

describe("metrics dictionary", () => {
    test("defines one stable contract for every core Baidu-parity metric", () => {
        expect(METRIC_DEFINITIONS.map((metric) => metric.code)).toEqual(
            coreMetricCodes,
        );

        const codes = new Set(METRIC_DEFINITIONS.map((metric) => metric.code));
        expect(codes.size).toBe(METRIC_DEFINITIONS.length);

        for (const metric of METRIC_DEFINITIONS) {
            expect(metric.label.zh).not.toEqual("");
            expect(metric.label.en).not.toEqual("");
            expect(metric.definition).not.toEqual("");
            expect(metric.numerator).not.toEqual("");
            expect(metric.dedupeKey).not.toEqual("");
            expect(metric.timeBoundary).not.toEqual("");
            expect(metric.primarySource).toMatch(/^(ae|d1|presence)$/);
            expect(metric.refreshCadence).not.toEqual("");
            expect(metric.coverage).toMatchObject({
                coverageStartedAt: null,
                coverageEndedAt: null,
                sampled: false,
            });
        }
    });

    test("keeps current online and recent active windows separate", () => {
        expect(getMetricDefinition("onlineVisits")).toMatchObject({
            primarySource: "presence",
            dedupeKey: "visit_id",
            window: "60s-presence-grace",
        });

        expect(getMetricDefinition("activeVisits5m")).toMatchObject({
            primarySource: "d1",
            dedupeKey: "visit_id",
            window: "5m-last-seen",
        });
        expect(getMetricDefinition("activeVisits30m")).toMatchObject({
            primarySource: "d1",
            dedupeKey: "visit_id",
            window: "30m-last-seen",
        });

        expect(getMetricDefinition("onlineVisits").definition).not.toContain(
            "5",
        );
    });

    test("does not map legacy AE newVisitor/newSession columns to stable UV or visits", () => {
        expect(getMetricDefinition("visitors")).toMatchObject({
            primarySource: "d1",
            dedupeKey: "visitor_id",
        });
        expect(getMetricDefinition("visits")).toMatchObject({
            primarySource: "d1",
            dedupeKey: "visit_id",
        });

        expect(getMetricDefinition("visitors").legacyAeColumn).toBeUndefined();
        expect(getMetricDefinition("visits").legacyAeColumn).toBeUndefined();

        expect(LEGACY_METRIC_DEFINITIONS).toEqual([
            expect.objectContaining({
                code: "legacyDailyVisitors",
                aeColumn: "newVisitor",
                replacement: "visitors",
                coverage: expect.objectContaining({ exactness: "legacy" }),
            }),
            expect.objectContaining({
                code: "legacyNewSessionColumn",
                aeColumn: "newSession",
                replacement: null,
                coverage: expect.objectContaining({ exactness: "legacy" }),
            }),
        ]);
    });

    test("marks unique IPs unavailable when raw IP recording is disabled without disabling visit metrics", () => {
        expect(
            getMetricValueAvailability("uniqueIps", { recordIp: false }),
        ).toEqual({
            available: false,
            reason: "ip-not-recorded",
        });

        expect(
            getMetricValueAvailability("visits", { recordIp: false }),
        ).toEqual({
            available: true,
            reason: null,
        });
        expect(
            getMetricValueAvailability("activeVisits30m", { recordIp: false }),
        ).toEqual({
            available: true,
            reason: null,
        });
    });
});

describe("analytics information architecture", () => {
    test("freezes the Baidu-parity top-level navigation groups", () => {
        expect(ANALYTICS_NAVIGATION_GROUPS.map((group) => group.id)).toEqual([
            "overview",
            "realtime",
            "sources",
            "visitors",
            "content",
            "conversions",
            "management",
        ]);
    });

    test("assigns every planned Baidu-parity leaf task to exactly one group", () => {
        const items = ANALYTICS_NAVIGATION_GROUPS.flatMap((group) =>
            group.items.map((item) => ({ ...item, groupId: group.id })),
        );
        const taskIds = items.flatMap((item) => item.taskIds);

        expect(taskIds).toContain("baidu-p0-metrics-ia");
        expect(taskIds).toContain("baidu-p1-realtime");
        expect(taskIds).toContain("baidu-p0-ip-geo");
        expect(taskIds).toContain("baidu-p4-heatmap-spike");

        const duplicates = taskIds.filter(
            (taskId, index) => taskIds.indexOf(taskId) !== index,
        );
        expect(duplicates).toEqual([]);

        const taskGroup = new Map(
            items.flatMap((item) =>
                item.taskIds.map((taskId) => [taskId, item.groupId] as const),
            ),
        );
        expect(taskGroup.get("baidu-p1-realtime")).toBe("realtime");
        expect(taskGroup.get("baidu-p0-ip-geo")).toBe("visitors");
        expect(taskGroup.get("baidu-p4-data-governance")).toBe("management");
    });
});
