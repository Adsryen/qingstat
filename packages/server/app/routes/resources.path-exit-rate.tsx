import { useFetcher } from "react-router";

import type { LoaderFunctionArgs } from "react-router";

import PaginatedTableCard from "~/components/PaginatedTableCard";
import {
    getPathExitRateSummary,
    unavailablePathExitRateSummary,
    UNKNOWN_PATH_LABEL,
} from "~/lib/entry-exit";
import type { SearchFilters } from "~/lib/types";
import {
    getDateTimeRange,
    getFiltersFromSearchParams,
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

    const { interval = "7d", site, page = 1 } = paramsFromUrl(request.url);
    const url = new URL(request.url);
    const tz = url.searchParams.get("timezone") || "UTC";
    const filters = getFiltersFromSearchParams(url.searchParams);

    let summary = unavailablePathExitRateSummary();
    if (context.cloudflare.env.DB) {
        try {
            summary = await getPathExitRateSummary(
                context.cloudflare.env.DB,
                site,
                getDateTimeRange(interval, tz),
                filters,
            );
        } catch (err) {
            console.error("getPathExitRateSummary failed", err);
            summary = unavailablePathExitRateSummary();
        }
    }

    return {
        countsByProperty: summary.countsByProperty,
        coverage: { available: summary.available, reason: summary.reason },
        page: Number(page),
    };
}

/**
 * Path exit rate: sessions that viewed the path vs sessions that exited on it.
 * Not bounce rate (visit-level single-page metric).
 */
export const PathExitRateCard = ({
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
            columnHeaders={["Path", "Sessions", "Exit Rate"]}
            dataFetcher={useFetcher<typeof loader>()}
            filters={filters}
            loaderUrl="/resources/path-exit-rate"
            onClick={(path) => {
                if (path !== UNKNOWN_PATH_LABEL) {
                    onFilterChange({ ...filters, path });
                }
            }}
            timezone={timezone}
            labelFormatter={(label) => label || UNKNOWN_PATH_LABEL}
        />
    );
};
