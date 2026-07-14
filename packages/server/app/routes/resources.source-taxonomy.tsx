import { useFetcher } from "react-router";

import type { LoaderFunctionArgs } from "react-router";

import PaginatedTableCard from "~/components/PaginatedTableCard";

import { getFiltersFromSearchParams, paramsFromUrl } from "~/lib/utils";
import { SearchFilters } from "~/lib/types";
import { assertCanViewSiteStats } from "~/lib/siteAccess";
import {
    TRAFFIC_SOURCE_LABELS,
    type TrafficSourceType,
} from "~/analytics/source-taxonomy";

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

    const { interval, site, page = 1 } = paramsFromUrl(request.url);
    const url = new URL(request.url);
    const tz = url.searchParams.get("timezone") || "UTC";
    const filters = getFiltersFromSearchParams(url.searchParams);

    return {
        countsByProperty: await analyticsEngine.getTrafficSourceSummary(
            site,
            interval,
            tz,
            filters,
        ),
        page: Number(page),
    };
}

export const SourceTaxonomyCard = ({
    siteId,
    interval,
    filters,
    onFilterChange,
    timezone,
}: {
    siteId: string;
    interval: string;
    filters: SearchFilters;
    onFilterChange: (filters: SearchFilters) => void;
    timezone: string;
}) => {
    return (
        <PaginatedTableCard
            siteId={siteId}
            interval={interval}
            columnHeaders={["Source Type", "Visitors", "Views"]}
            dataFetcher={useFetcher<typeof loader>()}
            loaderUrl="/resources/source-taxonomy"
            filters={filters}
            onClick={(sourceType) =>
                onFilterChange({
                    ...filters,
                    sourceType: sourceType as TrafficSourceType,
                })
            }
            timezone={timezone}
            labelFormatter={(label) =>
                TRAFFIC_SOURCE_LABELS[label as TrafficSourceType] || label
            }
        />
    );
};
