import { describe, expect, test } from "vitest";

import {
    getNewReturningSummary,
    unavailableNewReturningSummary,
} from "../new-return";

type VisitRow = {
    site_id: string;
    visit_id: string;
    visitor_id: string | null;
    first_seen_at: string;
    entry_path?: string | null;
    entry_referrer?: string | null;
    country?: string | null;
    region?: string | null;
    city?: string | null;
};

type PageviewRow = {
    site_id: string;
    visit_id: string;
    occurred_at: string;
    path?: string | null;
    referrer?: string | null;
};

function createNewReturningD1(visits: VisitRow[], pageviews: PageviewRow[] = []) {
    return {
        prepare(sql: string) {
            const binds: unknown[] = [];
            const stmt = {
                bind(...args: unknown[]) {
                    binds.push(...args);
                    return stmt;
                },
                async first<T>() {
                    const [siteId] = binds as [string];
                    if (sql.includes("MIN(first_seen_at)")) {
                        const rows = visits.filter((visit) => visit.site_id === siteId);
                        const first = rows
                            .map((visit) => visit.first_seen_at)
                            .sort((a, b) => a.localeCompare(b))[0];
                        return { coverage_started_at: first ?? null } as T;
                    }
                    return null as T | null;
                },
                async all<T>() {
                    const [siteId] = binds as [string];
                    if (sql.includes("FROM visits")) {
                        return {
                            results: visits.filter((visit) => visit.site_id === siteId) as T[],
                        };
                    }
                    if (sql.includes("FROM pageviews")) {
                        return {
                            results: pageviews.filter(
                                (pageview) => pageview.site_id === siteId,
                            ) as T[],
                        };
                    }
                    return { results: [] as T[] };
                },
                async run() {
                    return { meta: { changes: 0 } };
                },
            };
            return stmt;
        },
    } as unknown as D1Database;
}

describe("new/returning visitor summaries", () => {
    const range = {
        startDate: new Date("2026-07-14T00:00:00.000Z"),
        endDate: new Date("2026-07-15T00:00:00.000Z"),
    };

    test("classifies distinct visitors by their first D1 visit in the site", async () => {
        const db = createNewReturningD1([
            {
                site_id: "site-a",
                visit_id: "old-returning",
                visitor_id: "visitor-returning",
                first_seen_at: "2026-07-13T09:00:00.000Z",
                entry_path: "/old",
            },
            {
                site_id: "site-a",
                visit_id: "returning-window-1",
                visitor_id: "visitor-returning",
                first_seen_at: "2026-07-14T10:00:00.000Z",
                entry_path: "/home",
            },
            {
                site_id: "site-a",
                visit_id: "returning-window-2",
                visitor_id: "visitor-returning",
                first_seen_at: "2026-07-14T11:00:00.000Z",
                entry_path: "/pricing",
            },
            {
                site_id: "site-a",
                visit_id: "new-window",
                visitor_id: "visitor-new",
                first_seen_at: "2026-07-14T12:00:00.000Z",
                entry_path: "/home",
            },
            {
                site_id: "site-b",
                visit_id: "other-site-noise",
                visitor_id: "visitor-noise",
                first_seen_at: "2026-07-14T12:00:00.000Z",
            },
        ]);

        const result = await getNewReturningSummary(db, "site-a", range, {
            intervalType: "DAY",
            timezone: "UTC",
        });

        expect(result).toMatchObject({
            available: true,
            reason: null,
            coverageStartedAt: "2026-07-13T09:00:00.000Z",
            newVisitors: 1,
            returningVisitors: 1,
            classifiedVisitors: 2,
            unclassifiedVisitors: 0,
            newVisitorRate: 0.5,
            returningVisitorRate: 0.5,
        });
        expect(result.trend).toEqual([
            {
                bucket: "2026-07-14T00:00:00.000Z",
                newVisitors: 1,
                returningVisitors: 1,
            },
        ]);
    });

    test("keeps missing visitor ids unclassified and out of percentage denominators", async () => {
        const db = createNewReturningD1([
            {
                site_id: "site-a",
                visit_id: "new-window",
                visitor_id: "visitor-new",
                first_seen_at: "2026-07-14T12:00:00.000Z",
            },
            {
                site_id: "site-a",
                visit_id: "missing-id",
                visitor_id: null,
                first_seen_at: "2026-07-14T13:00:00.000Z",
            },
            {
                site_id: "site-a",
                visit_id: "blank-id",
                visitor_id: "   ",
                first_seen_at: "2026-07-14T14:00:00.000Z",
            },
        ]);

        await expect(
            getNewReturningSummary(db, "site-a", range, {
                intervalType: "DAY",
                timezone: "UTC",
            }),
        ).resolves.toMatchObject({
            newVisitors: 1,
            returningVisitors: 0,
            classifiedVisitors: 1,
            unclassifiedVisitors: 2,
            newVisitorRate: 1,
            returningVisitorRate: 0,
        });
    });

    test("applies supported filters and reports unsupported filters without mixing AE-only dimensions", async () => {
        const db = createNewReturningD1(
            [
                {
                    site_id: "site-a",
                    visit_id: "home",
                    visitor_id: "visitor-home",
                    first_seen_at: "2026-07-14T10:00:00.000Z",
                    entry_path: "/home",
                    country: "US",
                },
                {
                    site_id: "site-a",
                    visit_id: "pricing",
                    visitor_id: "visitor-pricing",
                    first_seen_at: "2026-07-14T11:00:00.000Z",
                    entry_path: "/pricing",
                    country: "US",
                },
            ],
            [
                {
                    site_id: "site-a",
                    visit_id: "pricing",
                    occurred_at: "2026-07-14T11:01:00.000Z",
                    path: "/pricing",
                },
            ],
        );

        const result = await getNewReturningSummary(db, "site-a", range, {
            intervalType: "DAY",
            timezone: "UTC",
            filters: { path: "/pricing", deviceType: "Mobile", country: "US" },
        });

        expect(result).toMatchObject({
            newVisitors: 1,
            returningVisitors: 0,
            classifiedVisitors: 1,
            unsupportedFilters: ["deviceType"],
        });
    });

    test("returns an unavailable summary when D1 is missing", () => {
        expect(unavailableNewReturningSummary()).toEqual({
            available: false,
            reason: "db-unavailable",
            coverageStartedAt: null,
            classifiedVisitors: 0,
            newVisitors: 0,
            returningVisitors: 0,
            unclassifiedVisitors: 0,
            newVisitorRate: null,
            returningVisitorRate: null,
            unsupportedFilters: [],
            trend: [],
        });
    });
});



