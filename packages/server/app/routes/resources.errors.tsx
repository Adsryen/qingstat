import { useFetcher } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import PaginatedTableCard from "~/components/PaginatedTableCard";
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
    const { interval = "7d", site, page = 1 } = paramsFromUrl(request.url);
    const url = new URL(request.url);
    const tz = url.searchParams.get("timezone") || "UTC";
    const filters = getFiltersFromSearchParams(url.searchParams);
    try {
        const rows = await analyticsEngine.getErrorSummary(
            site,
            interval,
            tz,
            filters,
            10,
        );
        return { countsByProperty: rows, page: Number(page) };
    } catch (err) {
        console.error(err);
        return { countsByProperty: [], page: Number(page) };
    }
}

export const ErrorsCard = ({
    siteId,
    interval,
    filters,
    timezone,
}: {
    siteId: string;
    interval: string;
    filters: SearchFilters;
    timezone: string;
    onFilterChange?: (filters: SearchFilters) => void;
}) => {
    return (
        <PaginatedTableCard
            siteId={siteId}
            interval={interval}
            columnHeaders={["Error", "Count"]}
            dataFetcher={useFetcher<typeof loader>()}
            loaderUrl="/resources/errors"
            filters={filters}
            timezone={timezone}
            labelFormatter={(label) =>
                (label || "(unknown)").replace(/^\/__error__\//, "")
            }
        />
    );
};
