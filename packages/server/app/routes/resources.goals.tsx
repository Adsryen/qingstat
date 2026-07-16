import { useFetcher } from "react-router";
import { useEffect } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { Card } from "~/components/ui/card";
import { requireAuth } from "~/lib/auth";
import { listGoals, computeGoalCompletions } from "~/lib/goals";
import { getFiltersFromSearchParams, paramsFromUrl } from "~/lib/utils";
import type { SearchFilters } from "~/lib/types";
import { assertCanViewSiteStats } from "~/lib/siteAccess";

export async function loader({ request, context }: LoaderFunctionArgs) {
    const { analyticsEngine } = context;
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
        return { available: false as const, rows: [] as Array<{
            name: string;
            type: string;
            completions: number;
            views: number | null;
            rate: number | null;
        }> };
    }

    const goals = (await listGoals(db, site)).filter((g) => g.enabled);
    if (goals.length === 0) {
        return { available: true as const, rows: [] };
    }

    // Path counts for URL goals; event paths for event goals
    let pathCounts: [string, number][] = [];
    let eventCounts: [string, number][] = [];
    let views: number | null = null;
    try {
        const stats = await analyticsEngine.getCounts(site, interval, tz, filters);
        views = stats.views;
        const allPaths = await analyticsEngine.getCountByPath(
            site,
            interval,
            tz,
            filters,
            1,
        );
        pathCounts = allPaths.map((row) => {
            const path = String(row[0]);
            const viewCount = row.length > 2 ? Number(row[2]) : Number(row[1]);
            return [path, viewCount] as [string, number];
        });
    } catch {
        // leave empty
    }
    try {
        const events = await analyticsEngine.getCustomEventSummary(
            site,
            interval,
            tz,
            filters,
            100,
        );
        eventCounts = events.map(([name, count]) => [
            `/__event__/${name}`,
            count,
        ]);
    } catch {
        // ignore
    }

    const rows = goals.map((goal) => {
        const source =
            goal.goalType === "event" ? eventCounts : pathCounts;
        const completions = computeGoalCompletions(goal, source);
        const rate =
            views != null && views > 0 ? completions / views : null;
        return {
            name: goal.name,
            type: goal.goalType,
            completions,
            views,
            rate,
        };
    });

    return { available: true as const, rows };
}

export const GoalsCard = ({
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
            action: "/resources/goals",
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteId, interval, filters, timezone]);

    const data = fetcher.data;
    const loading = fetcher.state === "loading";

    return (
        <Card
            className={
                loading
                    ? "p-4 rounded-[1.35rem] opacity-60 space-y-2"
                    : "p-4 rounded-[1.35rem] space-y-2"
            }
        >
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Conversion goals</h3>
                <a
                    className="text-xs underline text-muted-foreground"
                    href={`/console/sites/${encodeURIComponent(siteId)}/goals`}
                >
                    Manage
                </a>
            </div>
            <p className="text-xs text-muted-foreground">
                Completions / page views in range. URL goals match paths; event
                goals match trackEvent names.
            </p>
            {!data?.rows?.length ? (
                <p className="text-sm text-muted-foreground py-2">
                    No enabled goals. Create one in console → Goals.
                </p>
            ) : (
                <ul className="divide-y divide-border/60 text-sm">
                    {data.rows.map((row) => (
                        <li
                            key={row.name}
                            className="py-2 flex justify-between gap-3"
                        >
                            <span className="truncate">
                                {row.name}{" "}
                                <span className="text-xs text-muted-foreground">
                                    ({row.type})
                                </span>
                            </span>
                            <span className="tabular-nums shrink-0">
                                {row.completions}
                                {row.rate != null
                                    ? ` · ${(row.rate * 100).toFixed(1)}%`
                                    : ""}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
};
