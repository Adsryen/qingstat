/**
 * Open API v1 report builders — same report set and row shapes as CSV export.
 */

import type { AnalyticsEngineAPI } from "~/analytics/query";
import {
    TRAFFIC_SOURCE_LABELS,
    type TrafficSourceType,
} from "~/analytics/source-taxonomy";
import type { SearchFilters } from "~/lib/types";

export const V1_EXPORT_MAX_ROWS = 1000;

/** Fetch one extra row so truncated is true only when more data exists. */
const V1_FETCH_LIMIT = V1_EXPORT_MAX_ROWS + 1;

export const V1_ALLOWED_INTERVALS = [
    "today",
    "yesterday",
    "1d",
    "7d",
    "30d",
    "90d",
] as const;

export type V1Interval = (typeof V1_ALLOWED_INTERVALS)[number];

export const V1_REPORT_OPTIONS = [
    { id: "overview", label: "Overview" },
    { id: "paths", label: "Paths" },
    { id: "referrers", label: "Referrers" },
    { id: "countries", label: "Countries" },
    { id: "browsers", label: "Browsers" },
    { id: "devices", label: "Devices" },
    { id: "source-types", label: "Source Types" },
    { id: "utm-sources", label: "UTM Sources" },
] as const;

export type V1ReportId = (typeof V1_REPORT_OPTIONS)[number]["id"];

const ALLOWED_REPORTS = new Set<string>(
    V1_REPORT_OPTIONS.map((option) => option.id),
);
const ALLOWED_INTERVALS = new Set<string>(V1_ALLOWED_INTERVALS);

export function isV1ReportId(value: string): value is V1ReportId {
    return ALLOWED_REPORTS.has(value);
}

export function isV1Interval(value: string): value is V1Interval {
    return ALLOWED_INTERVALS.has(value);
}

export type V1ReportPayload = {
    columns: string[];
    rows: Array<Array<string | number | null | undefined>>;
    truncated: boolean;
};

function capRows<T>(data: T[]): { rows: T[]; truncated: boolean } {
    const truncated = data.length > V1_EXPORT_MAX_ROWS;
    return {
        rows: truncated ? data.slice(0, V1_EXPORT_MAX_ROWS) : data,
        truncated,
    };
}

export type BuildV1ReportArgs = {
    siteId: string;
    report: V1ReportId;
    interval: string;
    tz: string;
    filters: SearchFilters;
};

/**
 * Build columns/rows for a v1 report using the same AE methods as CSV export.
 */
export async function buildV1Report(
    analyticsEngine: AnalyticsEngineAPI,
    args: BuildV1ReportArgs,
): Promise<V1ReportPayload> {
    const { siteId, report, interval, tz, filters } = args;
    const site = siteId;

    switch (report) {
        case "overview": {
            const counts = await analyticsEngine.getCounts(
                site,
                interval,
                tz,
                filters,
            );
            return {
                columns: ["metric", "value"],
                rows: [
                    ["views", counts.views],
                    ["visitors", counts.visitors],
                    ["bounces", counts.bounces],
                ],
                truncated: false,
            };
        }
        case "paths": {
            const data = await analyticsEngine.getCountByPath(
                site,
                interval,
                tz,
                filters,
                1,
                V1_FETCH_LIMIT,
            );
            const { rows, truncated } = capRows(data);
            return {
                columns: ["path", "visitors", "views"],
                rows: rows.map(([path, visitors, views]) => [
                    path,
                    visitors,
                    views,
                ]),
                truncated,
            };
        }
        case "referrers": {
            const data = await analyticsEngine.getCountByReferrer(
                site,
                interval,
                tz,
                filters,
                1,
                V1_FETCH_LIMIT,
            );
            const { rows, truncated } = capRows(data);
            return {
                columns: ["referrer", "visitors", "views"],
                rows: rows.map(([referrer, visitors, views]) => [
                    referrer,
                    visitors,
                    views,
                ]),
                truncated,
            };
        }
        case "countries": {
            const data = await analyticsEngine.getCountByCountry(
                site,
                interval,
                tz,
                filters,
                1,
                V1_FETCH_LIMIT,
            );
            const { rows, truncated } = capRows(data);
            return {
                columns: ["country", "visitors"],
                rows: rows.map(([country, visitors]) => [country, visitors]),
                truncated,
            };
        }
        case "browsers": {
            const data = await analyticsEngine.getCountByBrowser(
                site,
                interval,
                tz,
                filters,
                1,
                V1_FETCH_LIMIT,
            );
            const { rows, truncated } = capRows(data);
            return {
                columns: ["browser", "visitors"],
                rows: rows.map(([browser, visitors]) => [browser, visitors]),
                truncated,
            };
        }
        case "devices": {
            const data = await analyticsEngine.getCountByDeviceType(
                site,
                interval,
                tz,
                filters,
                1,
                V1_FETCH_LIMIT,
            );
            const { rows, truncated } = capRows(data);
            return {
                columns: ["deviceType", "visitors"],
                rows: rows.map(([deviceType, visitors]) => [
                    deviceType,
                    visitors,
                ]),
                truncated,
            };
        }
        case "source-types": {
            const data = await analyticsEngine.getTrafficSourceSummary(
                site,
                interval,
                tz,
                filters,
            );
            const { rows, truncated } = capRows(data);
            return {
                columns: ["sourceType", "visitors", "views"],
                rows: rows.map(([sourceType, visitors, views]) => [
                    TRAFFIC_SOURCE_LABELS[sourceType as TrafficSourceType] ||
                        sourceType,
                    visitors,
                    views,
                ]),
                truncated,
            };
        }
        case "utm-sources": {
            const data = await analyticsEngine.getCountByUtmSource(
                site,
                interval,
                tz,
                filters,
                1,
                V1_FETCH_LIMIT,
            );
            const { rows, truncated } = capRows(data);
            return {
                columns: ["utmSource", "visitors"],
                rows: rows.map(([utmSource, visitors]) => [
                    utmSource,
                    visitors,
                ]),
                truncated,
            };
        }
        default: {
            const _exhaustive: never = report;
            throw new Error(`Unsupported report: ${_exhaustive}`);
        }
    }
}
