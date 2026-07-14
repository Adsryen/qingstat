import type { LoaderFunctionArgs } from "react-router";
import {
    getFiltersFromSearchParams,
    paramsFromUrl,
    getIntervalType,
    getDateTimeRange,
} from "~/lib/utils";
import { useEffect } from "react";
import { useFetcher } from "react-router";
import TimeSeriesChart from "~/components/TimeSeriesChart";
import { SearchFilters } from "~/lib/types";
import type { ViewsGroupedByInterval } from "~/analytics/query";
import { assertCanViewSiteStats } from "~/lib/siteAccess";
import { ChartShell } from "~/components/analytics/ChartShell";
import { useLocale } from "~/i18n/LocaleContext";

export async function loader({
    context,
    request,
}: LoaderFunctionArgs) {

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
    const { interval, site } = paramsFromUrl(request.url);
    const url = new URL(request.url);
    const tz = url.searchParams.get("timezone") || "UTC";
    const filters = getFiltersFromSearchParams(url.searchParams);

    const intervalType = getIntervalType(interval);
    const { startDate, endDate } = getDateTimeRange(interval, tz);

    const viewsGroupedByInterval: ViewsGroupedByInterval =
        await analyticsEngine.getViewsGroupedByInterval(
            site,
            intervalType,
            startDate,
            endDate,
            tz,
            filters,
        );

    const chartData: {
        date: string;
        views: number;
        visitors: number;
        bounceRate: number;
    }[] = [];
    viewsGroupedByInterval.forEach((row) => {
        const { views, visitors, bounces } = row[1];

        chartData.push({
            date: row[0],
            views,
            visitors,
            bounceRate: Math.floor(
                (visitors > 0 ? bounces / visitors : 0) * 100,
            ),
        });
    });

    return {
        chartData: chartData,
        intervalType: intervalType,
    };
}

export const TimeSeriesCard = ({
    siteId,
    interval,
    filters,
    timezone,
}: {
    siteId: string;
    interval: string;
    filters: SearchFilters;
    timezone: string;
}) => {
    const dataFetcher = useFetcher<typeof loader>();
    const { chartData, intervalType } = dataFetcher.data || {};

    useEffect(() => {
        const params = {
            site: siteId,
            interval,
            timezone,
            ...filters,
        };

        dataFetcher.submit(params, {
            method: "get",
            action: `/resources/timeseries`,
        });
        // NOTE: dataFetcher is intentionally omitted from the useEffect dependency array
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteId, interval, filters, timezone]);

    const { t } = useLocale();

    return (
        <ChartShell
            eyebrow={t("console.overview.trendEyebrow")}
            title={t("console.overview.trendTitle")}
            description={t("console.overview.trendDesc")}
            loading={dataFetcher.state !== "idle"}
            contentClassName="overflow-hidden p-0"
        >
            <div className="h-80 px-1 py-5 pr-8 sm:px-3 sm:pr-10">
                {chartData && (
                    <TimeSeriesChart
                        data={chartData}
                        intervalType={intervalType}
                    />
                )}
            </div>
        </ChartShell>
    );
};
