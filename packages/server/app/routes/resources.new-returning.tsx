import { useEffect } from "react";
import { useFetcher } from "react-router";

import type { LoaderFunctionArgs } from "react-router";

import { ChartShell } from "~/components/analytics/ChartShell";
import { MetricTile } from "~/components/analytics/MetricTile";
import { useLocale } from "~/i18n/LocaleContext";
import {
    getNewReturningSummary,
    unavailableNewReturningSummary,
} from "~/lib/new-return";
import type { SearchFilters } from "~/lib/types";
import {
    getDateTimeRange,
    getFiltersFromSearchParams,
    getIntervalType,
    paramsFromUrl,
} from "~/lib/utils";
import { assertCanViewSiteStats } from "~/lib/siteAccess";

export async function loader({ context, request }: LoaderFunctionArgs) {
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

    const { interval = "7d", site } = paramsFromUrl(request.url);
    const url = new URL(request.url);
    const timezone = url.searchParams.get("timezone") || "UTC";
    const filters = getFiltersFromSearchParams(url.searchParams);
    const summary = context.cloudflare.env.DB
        ? await getNewReturningSummary(
              context.cloudflare.env.DB,
              site,
              getDateTimeRange(interval, timezone),
              {
                  intervalType: getIntervalType(interval),
                  timezone,
                  filters,
              },
          )
        : unavailableNewReturningSummary();

    return { summary };
}

function formatRate(rate: number | null | undefined) {
    if (rate === null || rate === undefined) return "—";
    return `${Math.round(rate * 100)}%`;
}

function formatCount(value: number | undefined) {
    return value === undefined ? "—" : Intl.NumberFormat("zh-CN").format(value);
}

export const NewReturningCard = ({
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
    const summary = dataFetcher.data?.summary;

    useEffect(() => {
        const params = new URLSearchParams({
            site: siteId,
            interval,
            timezone,
        });

        Object.entries(filters ?? {}).forEach(([key, value]) => {
            if (value !== undefined) {
                params.set(key, value);
            }
        });

        dataFetcher.submit(params, {
            method: "get",
            action: "/resources/new-returning",
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteId, interval, filters, timezone]);

    const loading = dataFetcher.state !== "idle" && !dataFetcher.data;
    const unsupportedFilters = summary?.unsupportedFilters ?? [];
    const coverageHint = summary?.available
        ? summary.coverageStartedAt
            ? `${t("console.overview.newReturningCoverageStart")}${summary.coverageStartedAt}`
            : t("console.overview.newReturningNoCoverage")
        : t("console.overview.newReturningDbUnavailable");
    const unsupportedHint = unsupportedFilters.length
        ? `${t("console.overview.newReturningUnsupportedPrefix")}${unsupportedFilters.join(", ")}`
        : t("console.overview.newReturningDisclosure");

    return (
        <ChartShell
            eyebrow={t("console.overview.visitorMixEyebrow")}
            title={t("console.overview.newReturningTitle")}
            description={t("console.overview.newReturningDesc")}
            loading={dataFetcher.state !== "idle"}
            contentClassName="p-4 sm:p-5"
        >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricTile
                    label={t("console.overview.newVisitors")}
                    value={formatCount(summary?.newVisitors)}
                    hint={`${t("console.overview.newReturningNewRate")} ${formatRate(summary?.newVisitorRate)}`}
                    tone="live"
                    loading={loading}
                />
                <MetricTile
                    label={t("console.overview.returningVisitors")}
                    value={formatCount(summary?.returningVisitors)}
                    hint={`${t("console.overview.newReturningReturningRate")} ${formatRate(summary?.returningVisitorRate)}`}
                    tone="primary"
                    loading={loading}
                />
                <MetricTile
                    label={t("console.overview.classifiedUv")}
                    value={formatCount(summary?.classifiedVisitors)}
                    hint={t("console.overview.newReturningClassifiedHint")}
                    tone="success"
                    loading={loading}
                />
                <MetricTile
                    label={t("console.overview.unclassifiedVisitors")}
                    value={formatCount(summary?.unclassifiedVisitors)}
                    hint={t("console.overview.newReturningUnclassifiedHint")}
                    tone="default"
                    loading={loading}
                />
            </div>
            <div className="mt-4 rounded-xl border border-dashed border-border/70 bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
                <p>{coverageHint}</p>
                <p>{unsupportedHint}</p>
            </div>
            <span className="sr-only">{t("metrics.uv")}</span>
        </ChartShell>
    );
};
