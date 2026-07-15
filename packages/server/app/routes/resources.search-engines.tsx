import { useFetcher } from "react-router";

import type { LoaderFunctionArgs } from "react-router";

import PaginatedTableCard from "~/components/PaginatedTableCard";
import { getFiltersFromSearchParams, paramsFromUrl } from "~/lib/utils";
import { SearchFilters } from "~/lib/types";
import { assertCanViewSiteStats } from "~/lib/siteAccess";
import {
    SEARCH_ENGINE_LABELS,
    type SearchEngineId,
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
        countsByProperty: await analyticsEngine.getSearchEngineSummary(
            site,
            interval,
            tz,
            filters,
        ),
        page: Number(page),
    };
}

export const SearchEngineCard = ({
    siteId,
    interval,
    filters,
    onFilterChange: _onFilterChange,
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
            columnHeaders={["Search Engine", "Visitors", "Views"]}
            dataFetcher={useFetcher<typeof loader>()}
            loaderUrl="/resources/search-engines"
            filters={filters}
            timezone={timezone}
            labelFormatter={(label) =>
                SEARCH_ENGINE_LABELS[label as SearchEngineId] || label
            }
        />
    );
};
