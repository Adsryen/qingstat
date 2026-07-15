import { describe, expect, test } from "vitest";

import {
    getEntryPageSummary,
    getExitPageSummary,
    getPathExitRateSummary,
    UNKNOWN_PATH_LABEL,
} from "../entry-exit";

type VisitRow = {
    site_id: string;
    visit_id: string;
    first_seen_at: string;
    entry_path: string | null;
};

type PageviewRow = {
    site_id: string;
    visit_id: string;
    occurred_at: string;
    created_at: string;
    pageview_id: string;
    path: string | null;
};

function createEntryExitD1(visits: VisitRow[], pageviews: PageviewRow[]) {
    return {
        prepare(sql: string) {
            const binds: unknown[] = [];
            const stmt = {
                bind(...args: unknown[]) {
                    binds.push(...args);
                    return stmt;
                },
                async first<T>() {
                    return null as T | null;
                },
                async all<T>() {
                    const stringBinds = binds.map((bind) => String(bind));
                    const dates = stringBinds.filter((bind) =>
                        /^\d{4}-\d{2}-\d{2}T/.test(bind),
                    );
                    const siteId =
                        stringBinds.find(
                            (bind) =>
                                !/^\d{4}-\d{2}-\d{2}T/.test(bind) &&
                                !bind.startsWith("/") &&
                                bind !== UNKNOWN_PATH_LABEL,
                        ) || "";
                    const start = dates[0] || "";
                    const end = dates[1] || "";
                    const pathFilter = binds
                        .map((bind) => String(bind))
                        .find((bind) => bind.startsWith("/"));

                    if (sql.includes("entry_path")) {
                        const rows = summarizeEntry(
                            visits,
                            pageviews,
                            siteId,
                            start,
                            end,
                            pathFilter,
                        );
                        return { results: rows as T[] };
                    }

                    if (sql.includes("ROW_NUMBER()")) {
                        if (sql.includes("per_path") || sql.includes("AS exits")) {
                            const rows = summarizePathExitRate(
                                pageviews,
                                siteId,
                                start,
                                end,
                                pathFilter,
                            );
                            return { results: rows as T[] };
                        }
                        const rows = summarizeExit(
                            pageviews,
                            siteId,
                            start,
                            end,
                            pathFilter,
                        );
                        return { results: rows as T[] };
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

function normalizePath(path: string | null) {
    return path?.trim() || UNKNOWN_PATH_LABEL;
}

function summarizeEntry(
    visits: VisitRow[],
    pageviews: PageviewRow[],
    siteId: string,
    start: string,
    end: string,
    pathFilter?: string,
) {
    const grouped = new Map<string, { path: string; sessions: number; views: number }>();

    visits
        .filter(
            (visit) =>
                visit.site_id === siteId &&
                visit.first_seen_at >= start &&
                visit.first_seen_at < end,
        )
        .forEach((visit) => {
            const path = normalizePath(visit.entry_path);
            if (pathFilter && path !== pathFilter) return;

            const row = grouped.get(path) || { path, sessions: 0, views: 0 };
            row.sessions += 1;
            row.views += pageviews.filter(
                (pageview) =>
                    pageview.site_id === siteId &&
                    pageview.visit_id === visit.visit_id &&
                    normalizePath(pageview.path) === path &&
                    pageview.occurred_at >= start &&
                    pageview.occurred_at < end,
            ).length;
            grouped.set(path, row);
        });

    return Array.from(grouped.values()).sort((a, b) => b.sessions - a.sessions);
}

function summarizeExit(
    pageviews: PageviewRow[],
    siteId: string,
    start: string,
    end: string,
    pathFilter?: string,
) {
    const byVisit = new Map<string, PageviewRow[]>();
    pageviews
        .filter(
            (pageview) =>
                pageview.site_id === siteId &&
                pageview.occurred_at >= start &&
                pageview.occurred_at < end,
        )
        .forEach((pageview) => {
            const rows = byVisit.get(pageview.visit_id) || [];
            rows.push(pageview);
            byVisit.set(pageview.visit_id, rows);
        });

    const grouped = new Map<string, { path: string; sessions: number; views: number }>();
    for (const rows of byVisit.values()) {
        const last = [...rows].sort((a, b) => {
            const occurred = b.occurred_at.localeCompare(a.occurred_at);
            if (occurred !== 0) return occurred;
            const created = b.created_at.localeCompare(a.created_at);
            if (created !== 0) return created;
            return b.pageview_id.localeCompare(a.pageview_id);
        })[0];
        const path = normalizePath(last.path);
        if (pathFilter && path !== pathFilter) continue;

        const row = grouped.get(path) || { path, sessions: 0, views: 0 };
        row.sessions += 1;
        row.views += rows.filter((pageview) => normalizePath(pageview.path) === path).length;
        grouped.set(path, row);
    }

    return Array.from(grouped.values()).sort((a, b) => b.sessions - a.sessions);
}

function summarizePathExitRate(
    pageviews: PageviewRow[],
    siteId: string,
    start: string,
    end: string,
    pathFilter?: string,
) {
    const byVisit = new Map<string, PageviewRow[]>();
    pageviews
        .filter(
            (pageview) =>
                pageview.site_id === siteId &&
                pageview.occurred_at >= start &&
                pageview.occurred_at < end,
        )
        .forEach((pageview) => {
            const rows = byVisit.get(pageview.visit_id) || [];
            rows.push(pageview);
            byVisit.set(pageview.visit_id, rows);
        });

    const sessionsByPath = new Map<string, Set<string>>();
    const exitsByPath = new Map<string, Set<string>>();

    for (const [visitId, rows] of byVisit.entries()) {
        const sorted = [...rows].sort((a, b) => {
            const occurred = b.occurred_at.localeCompare(a.occurred_at);
            if (occurred !== 0) return occurred;
            const created = b.created_at.localeCompare(a.created_at);
            if (created !== 0) return created;
            return b.pageview_id.localeCompare(a.pageview_id);
        });
        const lastPath = normalizePath(sorted[0].path);
        const paths = new Set(rows.map((r) => normalizePath(r.path)));
        for (const path of paths) {
            if (pathFilter && path !== pathFilter) continue;
            if (!sessionsByPath.has(path)) sessionsByPath.set(path, new Set());
            sessionsByPath.get(path)!.add(visitId);
        }
        if (!pathFilter || lastPath === pathFilter) {
            if (!exitsByPath.has(lastPath)) exitsByPath.set(lastPath, new Set());
            exitsByPath.get(lastPath)!.add(visitId);
        }
    }

    return Array.from(sessionsByPath.entries())
        .map(([path, visits]) => ({
            path,
            sessions: visits.size,
            exits: exitsByPath.get(path)?.size || 0,
        }))
        .sort((a, b) => b.exits - a.exits || b.sessions - a.sessions);
}

describe("entry/exit page summaries", () => {
    const range = {
        startDate: new Date("2026-07-14T00:00:00.000Z"),
        endDate: new Date("2026-07-15T00:00:00.000Z"),
    };

    const visits: VisitRow[] = [
        {
            site_id: "site-a",
            visit_id: "single",
            first_seen_at: "2026-07-14T01:00:00.000Z",
            entry_path: "/home",
        },
        {
            site_id: "site-a",
            visit_id: "multi",
            first_seen_at: "2026-07-14T02:00:00.000Z",
            entry_path: "/home",
        },
        {
            site_id: "site-a",
            visit_id: "spa",
            first_seen_at: "2026-07-14T03:00:00.000Z",
            entry_path: "/landing",
        },
        {
            site_id: "site-a",
            visit_id: "empty-path",
            first_seen_at: "2026-07-14T04:00:00.000Z",
            entry_path: "",
        },
        {
            site_id: "site-a",
            visit_id: "outside",
            first_seen_at: "2026-07-13T23:59:00.000Z",
            entry_path: "/old",
        },
    ];

    const pageviews: PageviewRow[] = [
        {
            site_id: "site-a",
            visit_id: "single",
            occurred_at: "2026-07-14T01:00:00.000Z",
            created_at: "2026-07-14T01:00:00.000Z",
            pageview_id: "pv-1",
            path: "/home",
        },
        {
            site_id: "site-a",
            visit_id: "multi",
            occurred_at: "2026-07-14T02:00:00.000Z",
            created_at: "2026-07-14T02:00:00.000Z",
            pageview_id: "pv-2",
            path: "/home",
        },
        {
            site_id: "site-a",
            visit_id: "multi",
            occurred_at: "2026-07-14T02:03:00.000Z",
            created_at: "2026-07-14T02:03:00.000Z",
            pageview_id: "pv-3",
            path: "/pricing",
        },
        {
            site_id: "site-a",
            visit_id: "spa",
            occurred_at: "2026-07-14T03:00:00.000Z",
            created_at: "2026-07-14T03:00:00.000Z",
            pageview_id: "pv-4",
            path: "/landing",
        },
        {
            site_id: "site-a",
            visit_id: "spa",
            occurred_at: "2026-07-14T03:02:00.000Z",
            created_at: "2026-07-14T03:02:00.000Z",
            pageview_id: "pv-5",
            path: "/signup",
        },
        {
            site_id: "site-a",
            visit_id: "empty-path",
            occurred_at: "2026-07-14T04:00:00.000Z",
            created_at: "2026-07-14T04:00:00.000Z",
            pageview_id: "pv-6",
            path: null,
        },
    ];

    test("summarizes entry pages by visit entry path", async () => {
        const db = createEntryExitD1(visits, pageviews);

        await expect(getEntryPageSummary(db, "site-a", range)).resolves.toEqual({
            available: true,
            reason: null,
            countsByProperty: [
                ["/home", 2, 2],
                ["/landing", 1, 1],
                [UNKNOWN_PATH_LABEL, 1, 1],
            ],
        });
    });

    test("summarizes exit pages from the last known pageview per visit", async () => {
        const db = createEntryExitD1(visits, pageviews);

        await expect(getExitPageSummary(db, "site-a", range)).resolves.toEqual({
            available: true,
            reason: null,
            countsByProperty: [
                ["/home", 1, 1],
                ["/pricing", 1, 1],
                ["/signup", 1, 1],
                [UNKNOWN_PATH_LABEL, 1, 1],
            ],
        });
    });

    test("applies path filter without letting sessions exceed visits", async () => {
        const db = createEntryExitD1(visits, pageviews);

        const result = await getEntryPageSummary(db, "site-a", range, {
            path: "/home",
        });

        expect(result.countsByProperty).toEqual([["/home", 2, 2]]);
        expect(
            result.countsByProperty.every(([, sessions]) => sessions <= visits.length),
        ).toBe(true);
    });

    test("computes path exit rate as exits/sessions (not bounce)", async () => {
        const db = createEntryExitD1(visits, pageviews);

        const result = await getPathExitRateSummary(db, "site-a", range);
        expect(result.available).toBe(true);
        expect(result.reason).toBeNull();

        // /home: viewed by single+multi (2), exit only single → 50%
        // /pricing, /signup, (unknown): one session each and each is exit → 100%
        // /landing: spa viewed then left for /signup → 0%
        expect(result.countsByProperty).toEqual(
            expect.arrayContaining([
                ["/home", 2, "50.0%"],
                ["/pricing", 1, "100.0%"],
                ["/signup", 1, "100.0%"],
                ["/landing", 1, "0.0%"],
                [UNKNOWN_PATH_LABEL, 1, "100.0%"],
            ]),
        );
        expect(result.countsByProperty).toHaveLength(5);
    });
});
