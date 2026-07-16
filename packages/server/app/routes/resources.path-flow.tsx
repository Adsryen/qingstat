import { useEffect } from "react";
import { useFetcher } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

import { Card } from "~/components/ui/card";
import { assertCanViewSiteStats } from "~/lib/siteAccess";
import {
    computePathFlow,
    emptyPathFlowResult,
    OTHER_PATH,
    type PathFlowResult,
} from "~/lib/path-flow";
import type { SearchFilters } from "~/lib/types";
import {
    getDateTimeRange,
    getFiltersFromSearchParams,
    paramsFromUrl,
} from "~/lib/utils";

export async function loader({ request, context }: LoaderFunctionArgs) {
    const url = new URL(request.url);
    const site =
        url.searchParams.get("site") || paramsFromUrl(request.url).site || "";
    await assertCanViewSiteStats(
        request,
        context.cloudflare.env,
        site === "@unknown" ? "" : site,
    );

    const { interval = "7d" } = paramsFromUrl(request.url);
    const tz = url.searchParams.get("timezone") || "UTC";
    const filters = getFiltersFromSearchParams(url.searchParams);
    const db = context.cloudflare.env.DB;

    if (!db) {
        return {
            available: false as const,
            result: emptyPathFlowResult("db-unavailable"),
        };
    }

    try {
        const range = getDateTimeRange(interval, tz);
        const result = await computePathFlow(db, site, range, {
            path: filters.path,
        });
        return { available: true as const, result };
    } catch (err) {
        console.error("computePathFlow failed", err);
        return {
            available: false as const,
            result: emptyPathFlowResult("error"),
        };
    }
}

export const PathFlowCard = ({
    siteId,
    interval,
    filters,
    timezone,
}: {
    siteId: string;
    interval: string;
    filters?: SearchFilters;
    timezone: string;
}) => {
    const fetcher = useFetcher<typeof loader>();

    const pathFilter = filters?.path;

    useEffect(() => {
        const params = new URLSearchParams({ site: siteId, interval });
        if (timezone) params.set("timezone", timezone);
        if (pathFilter) params.set("path", pathFilter);
        fetcher.submit(params, {
            method: "get",
            action: "/resources/path-flow",
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteId, interval, timezone, pathFilter]);

    const data = fetcher.data;
    const loading = fetcher.state === "loading" || fetcher.state === "submitting";
    const result: PathFlowResult | undefined = data?.result;
    const edges = result?.edges ?? [];
    const maxVisits = edges.reduce((m, e) => Math.max(m, e.visits), 0);

    return (
        <Card
            className={
                loading
                    ? "p-4 rounded-[1.35rem] opacity-60 space-y-3"
                    : "p-4 rounded-[1.35rem] space-y-3"
            }
        >
            <div className="flex justify-between gap-2 items-center">
                <h3 className="text-sm font-semibold">Path Flow</h3>
                {result?.truncated ? (
                    <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                        Truncated
                    </span>
                ) : null}
            </div>

            {!data ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
            ) : edges.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No path transitions in this range
                    {pathFilter ? ` for filter path` : ""}.
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="text-left text-muted-foreground border-b border-border/50">
                                <th className="py-1.5 pr-2 font-medium">From</th>
                                <th className="py-1.5 pr-2 font-medium">To</th>
                                <th className="py-1.5 pr-2 font-medium text-right">
                                    Visits
                                </th>
                                <th className="py-1.5 font-medium w-[30%]"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {edges.map((edge) => {
                                const pct =
                                    maxVisits > 0
                                        ? Math.max(
                                              4,
                                              Math.round(
                                                  (edge.visits / maxVisits) * 100,
                                              ),
                                          )
                                        : 0;
                                return (
                                    <tr
                                        key={`${edge.from}\0${edge.to}`}
                                        className="border-b border-border/30 last:border-0"
                                    >
                                        <td className="py-1.5 pr-2 max-w-[10rem] truncate">
                                            <code
                                                className={
                                                    edge.from === OTHER_PATH
                                                        ? "text-muted-foreground"
                                                        : ""
                                                }
                                                title={edge.from}
                                            >
                                                {edge.from}
                                            </code>
                                        </td>
                                        <td className="py-1.5 pr-2 max-w-[10rem] truncate">
                                            <code
                                                className={
                                                    edge.to === OTHER_PATH
                                                        ? "text-muted-foreground"
                                                        : ""
                                                }
                                                title={edge.to}
                                            >
                                                {edge.to}
                                            </code>
                                        </td>
                                        <td className="py-1.5 pr-2 text-right tabular-nums shrink-0">
                                            {edge.visits}
                                        </td>
                                        <td className="py-1.5">
                                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-primary/70"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {result?.note ? (
                <p className="text-[10px] text-muted-foreground leading-snug">
                    {result.note}
                </p>
            ) : null}
        </Card>
    );
};
