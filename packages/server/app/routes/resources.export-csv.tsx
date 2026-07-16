import { useMemo, useState } from "react";

import type { LoaderFunctionArgs } from "react-router";

import type { AnalyticsEngineAPI } from "~/analytics/query";
import {
    TRAFFIC_SOURCE_LABELS,
    type TrafficSourceType,
} from "~/analytics/source-taxonomy";
import { rowsToCsv } from "~/lib/csv";
import { assertCanViewSiteStats } from "~/lib/siteAccess";
import type { SearchFilters } from "~/lib/types";
import { getFiltersFromSearchParams, paramsFromUrl } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";

export const EXPORT_MAX_ROWS = 1000;

const ALLOWED_INTERVALS = new Set([
    "today",
    "yesterday",
    "1d",
    "7d",
    "30d",
    "90d",
]);

const REPORT_OPTIONS = [
    { id: "overview", label: "Overview" },
    { id: "paths", label: "Paths" },
    { id: "referrers", label: "Referrers" },
    { id: "countries", label: "Countries" },
    { id: "browsers", label: "Browsers" },
    { id: "devices", label: "Devices" },
    { id: "source-types", label: "Source Types" },
    { id: "utm-sources", label: "UTM Sources" },
] as const;

type ExportReportId = (typeof REPORT_OPTIONS)[number]["id"];

const ALLOWED_REPORTS = new Set<string>(
    REPORT_OPTIONS.map((option) => option.id),
);

function isExportReportId(value: string): value is ExportReportId {
    return ALLOWED_REPORTS.has(value);
}

function safeFilenamePart(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]+/g, "_") || "site";
}

type CsvBuildResult = {
    headers: string[];
    rows: Array<Array<string | number | null | undefined>>;
    /** true when dimension export may have been capped at EXPORT_MAX_ROWS */
    truncated: boolean;
};

/** Fetch one extra row so X-Export-Truncated is true only when more data exists. */
const EXPORT_FETCH_LIMIT = EXPORT_MAX_ROWS + 1;

function capRows<T>(data: T[]): { rows: T[]; truncated: boolean } {
    const truncated = data.length > EXPORT_MAX_ROWS;
    return {
        rows: truncated ? data.slice(0, EXPORT_MAX_ROWS) : data,
        truncated,
    };
}

async function buildExportRows(
    analyticsEngine: AnalyticsEngineAPI,
    report: ExportReportId,
    site: string,
    interval: string,
    tz: string,
    filters: SearchFilters,
): Promise<CsvBuildResult> {
    switch (report) {
        case "overview": {
            const counts = await analyticsEngine.getCounts(
                site,
                interval,
                tz,
                filters,
            );
            return {
                headers: ["metric", "value"],
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
                EXPORT_FETCH_LIMIT,
            );
            const { rows, truncated } = capRows(data);
            return {
                headers: ["path", "visitors", "views"],
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
                EXPORT_FETCH_LIMIT,
            );
            const { rows, truncated } = capRows(data);
            return {
                headers: ["referrer", "visitors", "views"],
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
                EXPORT_FETCH_LIMIT,
            );
            const { rows, truncated } = capRows(data);
            return {
                headers: ["country", "visitors"],
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
                EXPORT_FETCH_LIMIT,
            );
            const { rows, truncated } = capRows(data);
            return {
                headers: ["browser", "visitors"],
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
                EXPORT_FETCH_LIMIT,
            );
            const { rows, truncated } = capRows(data);
            return {
                headers: ["deviceType", "visitors"],
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
                headers: ["sourceType", "visitors", "views"],
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
                EXPORT_FETCH_LIMIT,
            );
            const { rows, truncated } = capRows(data);
            return {
                headers: ["utmSource", "visitors"],
                rows: rows.map(([utmSource, visitors]) => [
                    utmSource,
                    visitors,
                ]),
                truncated,
            };
        }
        default: {
            // Exhaustiveness guard — should be unreachable after report validation.
            const _exhaustive: never = report;
            throw new Error(`Unsupported report: ${_exhaustive}`);
        }
    }
}

export async function loader({ context, request }: LoaderFunctionArgs) {
    const { analyticsEngine } = context;
    const urlForSite = new URL(request.url);
    const siteForAccess =
        urlForSite.searchParams.get("site") ||
        paramsFromUrl(request.url).site ||
        "";
    await assertCanViewSiteStats(
        request,
        context.cloudflare.env,
        siteForAccess === "@unknown" ? "" : siteForAccess,
    );

    const { interval = "7d", site = "" } = paramsFromUrl(request.url);
    const url = new URL(request.url);
    const tz = url.searchParams.get("timezone") || "UTC";
    const reportParam = url.searchParams.get("report") || "";
    const filters = getFiltersFromSearchParams(url.searchParams);

    if (!isExportReportId(reportParam)) {
        return new Response(
            "Invalid report. Allowed: overview, paths, referrers, countries, browsers, devices, source-types, utm-sources",
            {
                status: 400,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
            },
        );
    }

    if (!ALLOWED_INTERVALS.has(interval)) {
        return new Response(
            "Invalid interval. Allowed: today, yesterday, 1d, 7d, 30d, 90d",
            {
                status: 400,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
            },
        );
    }

    try {
        const { headers, rows, truncated } = await buildExportRows(
            analyticsEngine,
            reportParam,
            site,
            interval,
            tz,
            filters,
        );
        const csv = rowsToCsv(headers, rows);
        const safeSite = safeFilenamePart(site || "site");
        const filename = `qingstat-${safeSite}-${reportParam}-${interval}.csv`;

        return new Response(csv, {
            status: 200,
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "X-Export-Truncated": truncated ? "true" : "false",
                "X-Export-Row-Count": String(rows.length),
            },
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Analytics query failed";
        return new Response(`Export failed: ${message}`, {
            status: 502,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
    }
}

export function ExportCsvControl({
    siteId,
    interval,
    filters,
    timezone,
}: {
    siteId: string;
    interval: string;
    filters: SearchFilters;
    timezone: string;
}) {
    const [report, setReport] = useState<ExportReportId>("overview");

    const { href, filename } = useMemo(() => {
        const params = new URLSearchParams({
            site: siteId,
            interval,
            timezone,
            report,
        });
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== "") {
                params.set(key, String(value));
            }
        });
        const safeSite = safeFilenamePart(siteId || "site");
        return {
            href: `/resources/export-csv?${params.toString()}`,
            filename: `qingstat-${safeSite}-${report}-${interval}.csv`,
        };
    }, [siteId, interval, timezone, report, filters]);

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Select
                value={report}
                onValueChange={(value) => {
                    if (isExportReportId(value)) {
                        setReport(value);
                    }
                }}
            >
                <SelectTrigger className="w-[10.5rem] rounded-xl">
                    <SelectValue placeholder="Report" />
                </SelectTrigger>
                <SelectContent>
                    {REPORT_OPTIONS.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Button asChild variant="outline" className="rounded-xl" size="sm">
                <a
                    href={href}
                    download={filename}
                    title="Exports up to 1000 rows with current filters"
                >
                    Download CSV
                </a>
            </Button>
        </div>
    );
}
