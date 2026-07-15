import { useFetcher } from "react-router";

import type { LoaderFunctionArgs } from "react-router";

import PaginatedTableCard from "~/components/PaginatedTableCard";
import { getFiltersFromSearchParams, paramsFromUrl } from "~/lib/utils";
import { SearchFilters } from "~/lib/types";
import { assertCanViewSiteStats } from "~/lib/siteAccess";
import { SEARCH_TERM_NOT_PROVIDED } from "~/analytics/source-taxonomy";

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

    const result = await analyticsEngine.getSearchTermSummary(
        site,
        interval,
        tz,
        filters,
        Number(page),
    );

    return {
        countsByProperty: result.countsByProperty,
        coverage: result.coverage,
        page: Number(page),
    };
}

export const SearchTermsCard = ({
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
    const fetcher = useFetcher<typeof loader>();
    const coverage = fetcher.data?.coverage;
    const coverageLabel =
        coverage && coverage.termCoverageRate !== null
            ? `Keyword coverage: ${(coverage.termCoverageRate * 100).toFixed(0)}% (${coverage.visitorsWithTerm}/${coverage.visitorsTotal} search visitors)`
            : "Keyword coverage: n/a (HTTPS referrers often omit q=)";

    return (
        <div className="space-y-2">
            <p className="text-xs text-muted-foreground px-1">{coverageLabel}</p>
            <PaginatedTableCard
                siteId={siteId}
                interval={interval}
                columnHeaders={["Search Term", "Visitors", "Views"]}
                dataFetcher={fetcher}
                loaderUrl="/resources/search-terms"
                filters={filters}
                timezone={timezone}
                labelFormatter={(label) =>
                    label === SEARCH_TERM_NOT_PROVIDED
                        ? "(not provided)"
                        : label || "(unknown)"
                }
            />
        </div>
    );
};
