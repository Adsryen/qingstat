import type { LoaderFunctionArgs } from "react-router";
import {
    getDateTimeRange,
    getFiltersFromSearchParams,
    paramsFromUrl,
} from "~/lib/utils";
import { useEffect } from "react";
import { useFetcher } from "react-router";
import { SearchFilters } from "~/lib/types";
import { useLocale } from "~/i18n/LocaleContext";
import { ChartShell } from "~/components/analytics/ChartShell";
import { MetricTile } from "~/components/analytics/MetricTile";
import { assertCanViewSiteStats } from "~/lib/siteAccess";

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
    const { interval, site } = paramsFromUrl(request.url);
    const url = new URL(request.url);
    const tz = url.searchParams.get("timezone") || "UTC";
    const filters = getFiltersFromSearchParams(url.searchParams);

    // intentionally parallelize queries by deferring await
    const earliestEvents = analyticsEngine.getEarliestEvents(site);
    const counts = await analyticsEngine.getCounts(site, interval, tz, filters);

    const { earliestEvent, earliestBounce } = await earliestEvents;
    const { startDate } = getDateTimeRange(interval, tz);

    // FOR BACKWARDS COMPAT, ONLY SHOW BOUNCE RATE IF WE HAVE DATE FOR THE ENTIRE QUERY PERIOD
    const hasSufficientBounceData =
        earliestBounce !== null &&
        earliestEvent !== null &&
        (earliestEvent.getTime() == earliestBounce.getTime() ||
            earliestBounce < startDate);

    const bounceRate =
        counts.visitors > 0 ? counts.bounces / counts.visitors : undefined;

    return {
        views: counts.views,
        visitors: counts.visitors,
        bounceRate: bounceRate,
        hasSufficientBounceData,
    };
}

export const StatsCard = ({
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
    const { t } = useLocale();

    const { views, visitors, bounceRate, hasSufficientBounceData } =
        dataFetcher.data || {};
    const countFormatter = Intl.NumberFormat("zh-CN", { notation: "compact" });

    useEffect(() => {
        const params = {
            site: siteId,
            interval,
            timezone,
            ...filters,
        };

        dataFetcher.submit(params, {
            method: "get",
            action: `/resources/stats`,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteId, interval, filters, timezone]);

    const loading = dataFetcher.state !== "idle" && !dataFetcher.data;

    return (
        <ChartShell
            eyebrow={t("console.overview.last7d")}
            title={t("console.overview.metricsSnapshot")}
            description={t("console.overview.metricsSnapshotDesc")}
            loading={dataFetcher.state !== "idle"}
            contentClassName="p-4 sm:p-5"
        >
            <div className="grid gap-3 md:grid-cols-3">
                <MetricTile
                    label={t("metrics.uv")}
                    value={visitors ? countFormatter.format(visitors) : "—"}
                    hint={t("console.overview.uniqueVisitorsHint")}
                    tone="live"
                    loading={loading}
                />
                <MetricTile
                    label={t("metrics.pv")}
                    value={views ? countFormatter.format(views) : "—"}
                    hint={t("console.overview.pageviewsHint")}
                    tone="primary"
                    loading={loading}
                />
                <MetricTile
                    label={t("metrics.bounce")}
                    value={
                        hasSufficientBounceData
                            ? bounceRate !== undefined
                                ? `${Math.round(bounceRate * 100)}%`
                                : "—"
                            : "n/a"
                    }
                    hint={t("console.overview.bounceHint")}
                    tone="heat"
                    loading={loading}
                />
            </div>
        </ChartShell>
    );
};
