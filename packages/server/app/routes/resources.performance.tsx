import { useFetcher } from "react-router";
import { useEffect } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { Card } from "~/components/ui/card";
import { getFiltersFromSearchParams, paramsFromUrl } from "~/lib/utils";
import type { SearchFilters } from "~/lib/types";
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
    const { interval = "7d", site } = paramsFromUrl(request.url);
    const url = new URL(request.url);
    const tz = url.searchParams.get("timezone") || "UTC";
    const filters = getFiltersFromSearchParams(url.searchParams);
    try {
        return await analyticsEngine.getPerformanceSummary(
            site,
            interval,
            tz,
            filters,
        );
    } catch (err) {
        console.error(err);
        return { samples: 0, avgTtfbMs: null, avgLcpMs: null };
    }
}

export const PerformanceCard = ({
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
    const fetcher = useFetcher<typeof loader>();
    useEffect(() => {
        const params = new URLSearchParams({ site: siteId, interval });
        if (timezone) params.set("timezone", timezone);
        Object.entries(filters ?? {}).forEach(([k, v]) => {
            if (v !== undefined) params.set(k, String(v));
        });
        fetcher.submit(params, {
            method: "get",
            action: "/resources/performance",
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteId, interval, filters, timezone]);

    const d = fetcher.data;
    const loading = fetcher.state === "loading";
    return (
        <Card
            className={
                loading
                    ? "p-4 rounded-[1.35rem] opacity-60 space-y-2"
                    : "p-4 rounded-[1.35rem] space-y-2"
            }
        >
            <h3 className="text-sm font-semibold">Performance (sampled)</h3>
            <p className="text-xs text-muted-foreground">
                ~10% pageviews · Navigation Timing · 50ms buckets
            </p>
            <div className="grid grid-cols-3 gap-3 pt-2">
                <div>
                    <p className="text-xs text-muted-foreground">Samples</p>
                    <p className="text-lg font-semibold">{d?.samples ?? "—"}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground">Avg TTFB</p>
                    <p className="text-lg font-semibold">
                        {d?.avgTtfbMs != null
                            ? `${Math.round(d.avgTtfbMs)} ms`
                            : "—"}
                    </p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground">Avg load</p>
                    <p className="text-lg font-semibold">
                        {d?.avgLcpMs != null
                            ? `${Math.round(d.avgLcpMs)} ms`
                            : "—"}
                    </p>
                </div>
            </div>
        </Card>
    );
};
