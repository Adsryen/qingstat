import { describe, expect, test } from "vitest";
import type { Site } from "../sites";
import {
    buildMultisiteSummary,
    INSTALL_HEALTH,
    parseLastSeenMs,
    statusFor,
    type MultisiteMetricInput,
} from "../multisite-summary";

function site(overrides: Partial<Site> & { siteId: string; name?: string }): Site {
    return {
        siteId: overrides.siteId,
        name: overrides.name ?? overrides.siteId,
        enabled: overrides.enabled ?? true,
        publicStats: overrides.publicStats ?? true,
        recordIp: overrides.recordIp ?? true,
        ipRetentionDays: overrides.ipRetentionDays ?? 60,
        allowedHosts: overrides.allowedHosts ?? null,
        createdAt: overrides.createdAt ?? "2026-07-01T00:00:00.000Z",
        updatedAt: overrides.updatedAt ?? "2026-07-01T00:00:00.000Z",
    };
}

function metric(input: MultisiteMetricInput): MultisiteMetricInput {
    return input;
}

describe("buildMultisiteSummary", () => {
    test("merges registry sites with AE-only discovered sites", () => {
        const rows = buildMultisiteSummary({
            registry: [site({ siteId: "blog", name: "Blog" })],
            metrics: [
                metric({
                    siteId: "blog",
                    views: 10,
                    visitors: 5,
                    bounces: 2,
                    lastSeenAt: "2026-07-14 02:00:00",
                }),
                metric({
                    siteId: "shop",
                    views: 20,
                    visitors: 8,
                    bounces: 4,
                    lastSeenAt: "2026-07-14 03:00:00",
                }),
            ],
        });

        expect(rows.map((r) => r.siteId)).toEqual(["shop", "blog"]);
        expect(rows.find((r) => r.siteId === "blog")).toMatchObject({
            name: "Blog",
            inRegistry: true,
            views: 10,
            visitors: 5,
            bounceRate: 0.4,
            status: "active",
        });
        expect(rows.find((r) => r.siteId === "shop")).toMatchObject({
            name: "shop",
            inRegistry: false,
            publicStats: true,
            recordIp: true,
            ipRetentionDays: 60,
            status: "active",
        });
    });

    test("keeps registered sites without AE data visible as waiting", () => {
        const rows = buildMultisiteSummary({
            registry: [site({ siteId: "empty", name: "Empty" })],
            metrics: [],
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            siteId: "empty",
            views: 0,
            visitors: 0,
            bounces: 0,
            bounceRate: null,
            lastSeenAt: null,
            status: "waiting",
        });
    });

    test("calculates disabled and metrics-unavailable statuses", () => {
        const rows = buildMultisiteSummary({
            registry: [
                site({ siteId: "off", name: "Off", enabled: false }),
                site({ siteId: "on", name: "On" }),
            ],
            metrics: [],
            metricsUnavailable: true,
        });

        expect(rows.find((r) => r.siteId === "off")?.status).toBe("disabled");
        expect(rows.find((r) => r.siteId === "on")).toMatchObject({
            status: "metrics-unavailable",
            views: null,
            visitors: null,
            bounces: null,
            bounceRate: null,
        });
    });

    test("sorts by PV desc, pushes no-data rows behind data rows, then sorts by name", () => {
        const rows = buildMultisiteSummary({
            registry: [
                site({ siteId: "z", name: "Zulu" }),
                site({ siteId: "a", name: "Alpha" }),
                site({ siteId: "b", name: "Beta" }),
            ],
            metrics: [
                metric({
                    siteId: "b",
                    views: 3,
                    visitors: 1,
                    bounces: 0,
                    lastSeenAt: "2026-07-14 03:00:00",
                }),
                metric({
                    siteId: "z",
                    views: 3,
                    visitors: 1,
                    bounces: 0,
                    lastSeenAt: "2026-07-14 02:00:00",
                }),
            ],
        });

        expect(rows.map((r) => r.siteId)).toEqual(["b", "z", "a"]);
    });

    test("filters to visible site ids for future public multisite summaries", () => {
        const rows = buildMultisiteSummary({
            registry: [
                site({ siteId: "public", publicStats: true }),
                site({ siteId: "private", publicStats: false }),
            ],
            metrics: [
                metric({
                    siteId: "private",
                    views: 99,
                    visitors: 9,
                    bounces: 1,
                    lastSeenAt: "2026-07-14 02:00:00",
                }),
            ],
            visibleSiteIds: new Set(["public"]),
        });

        expect(rows).toHaveLength(1);
        expect(rows[0].siteId).toBe("public");
    });

    test("marks sites stale when lastSeen is older than threshold", () => {
        const now = new Date("2026-07-15T12:00:00.000Z");
        const rows = buildMultisiteSummary({
            registry: [site({ siteId: "old", name: "Old" })],
            metrics: [
                metric({
                    siteId: "old",
                    views: 10,
                    visitors: 3,
                    bounces: 1,
                    lastSeenAt: "2026-07-01 00:00:00",
                }),
            ],
            now,
            staleAfterDays: INSTALL_HEALTH.staleAfterDays,
        });

        expect(rows[0]).toMatchObject({
            status: "stale",
            healthHint: "check-tracker",
            lastSeenAt: "2026-07-01 00:00:00",
        });
        // registry updatedAt must not be used as lastSeen
        expect(rows[0].lastSeenAt).not.toBe(rows[0].updatedAt);
    });

    test("statusFor uses lastSeen age, not registry timestamps", () => {
        const nowMs = Date.parse("2026-07-15T12:00:00.000Z");
        expect(
            statusFor({
                enabled: true,
                metricsUnavailable: false,
                views: 5,
                lastSeenAt: "2026-07-15 10:00:00",
                nowMs,
                staleAfterDays: 7,
            }),
        ).toBe("active");
        expect(
            statusFor({
                enabled: true,
                metricsUnavailable: false,
                views: 5,
                lastSeenAt: "2026-06-01 00:00:00",
                nowMs,
                staleAfterDays: 7,
            }),
        ).toBe("stale");
        expect(
            statusFor({
                enabled: true,
                metricsUnavailable: false,
                views: 0,
                lastSeenAt: null,
                nowMs,
                staleAfterDays: 7,
            }),
        ).toBe("waiting");
    });

    test("parseLastSeenMs accepts AE space-separated timestamps", () => {
        expect(parseLastSeenMs("2026-07-14 02:00:00")).toBe(
            Date.parse("2026-07-14T02:00:00.000Z"),
        );
        expect(parseLastSeenMs(null)).toBeNull();
    });
});
