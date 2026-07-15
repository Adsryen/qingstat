import { useFetcher } from "react-router";
import { useEffect } from "react";

import type { LoaderFunctionArgs } from "react-router";

import {
    getVisitorLoyaltySummary,
    loyaltyBucketsToTableRows,
    unavailableVisitorLoyaltySummary,
} from "~/lib/visitor-loyalty";
import type { SearchFilters } from "~/lib/types";
import {
    getDateTimeRange,
    getFiltersFromSearchParams,
    paramsFromUrl,
} from "~/lib/utils";
import { assertCanViewSiteStats } from "~/lib/siteAccess";
import TableCard from "~/components/TableCard";
import { Card } from "~/components/ui/card";

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
    const tz = url.searchParams.get("timezone") || "UTC";
    const filters = getFiltersFromSearchParams(url.searchParams);

    if (!context.cloudflare.env.DB) {
        return unavailableVisitorLoyaltySummary("db-unavailable");
    }

    try {
        return await getVisitorLoyaltySummary(
            context.cloudflare.env.DB,
            site,
            getDateTimeRange(interval, tz),
            filters,
        );
    } catch (err) {
        console.error("getVisitorLoyaltySummary failed", err);
        return unavailableVisitorLoyaltySummary("db-unavailable");
    }
}

export const VisitorLoyaltyCard = ({
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
        const params = new URLSearchParams({
            site: siteId,
            interval,
        });
        if (timezone) params.set("timezone", timezone);
        Object.entries(filters ?? {}).forEach(([key, value]) => {
            if (value !== undefined) params.set(key, String(value));
        });
        fetcher.submit(params, {
            method: "get",
            action: "/resources/visitor-loyalty",
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteId, interval, filters, timezone]);

    const data = fetcher.data;
    const loading = fetcher.state === "loading";
    const coverage =
        data?.identityCoverageRate != null
            ? `${(data.identityCoverageRate * 100).toFixed(0)}% visits identified (${data.identifiedVisits} visits / ${data.identifiedVisitors} visitors)`
            : "Identity coverage: n/a";

    return (
        <Card
            className={
                loading
                    ? "overflow-hidden rounded-[1.35rem] border-border/70 opacity-60 shadow-sm p-4 space-y-4"
                    : "overflow-hidden rounded-[1.35rem] border-border/70 shadow-sm p-4 space-y-4"
            }
        >
            <div>
                <h3 className="text-sm font-semibold tracking-tight">
                    Visitor loyalty
                </h3>
                <p className="text-xs text-muted-foreground mt-1">{coverage}</p>
                {data?.note ? (
                    <p className="text-xs text-muted-foreground mt-1 leading-snug">
                        {data.note}
                    </p>
                ) : null}
            </div>
            <div className="grid md:grid-cols-2 gap-4">
                <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                        Visits per visitor
                    </p>
                    <TableCard
                        countByProperty={loyaltyBucketsToTableRows(
                            data?.frequencyBuckets ?? [],
                        )}
                        columnHeaders={["Frequency", "Visitors"]}
                    />
                </div>
                <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                        Return gap
                    </p>
                    <TableCard
                        countByProperty={loyaltyBucketsToTableRows(
                            data?.returnGapBuckets ?? [],
                        )}
                        columnHeaders={["Gap", "Pairs"]}
                    />
                </div>
            </div>
        </Card>
    );
};
