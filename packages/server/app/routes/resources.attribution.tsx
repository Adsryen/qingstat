import { useFetcher } from "react-router";
import { useEffect } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { Card } from "~/components/ui/card";
import { assertCanViewSiteStats } from "~/lib/siteAccess";
import {
    listGoals,
    computeGoalCompletions,
    type Goal,
} from "~/lib/goals";
import {
    ATTRIBUTION_DIMENSIONS,
    ATTRIBUTION_DIMENSION_LABELS,
    ATTRIBUTION_MODEL_NOTE,
    ATTRIBUTION_UI_TOP_N,
    attributeGoalHits,
    hitsToPathCounts,
    isAttributionDimension,
    sumCompletions,
    type AttributionDimension,
    type AttributionRow,
} from "~/lib/attribution";
import { getFiltersFromSearchParams, paramsFromUrl } from "~/lib/utils";
import type { SearchFilters } from "~/lib/types";

type LoaderGoal = {
    goalId: string;
    name: string;
    type: string;
};

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
    const goalIdParam = url.searchParams.get("goalId") || "";
    const dimensionParam = url.searchParams.get("dimension") || "sourceType";
    const dimension: AttributionDimension = isAttributionDimension(
        dimensionParam,
    )
        ? dimensionParam
        : "sourceType";

    const empty = {
        available: false as const,
        goals: [] as LoaderGoal[],
        selectedGoalId: "" as string,
        dimension,
        rows: [] as AttributionRow[],
        totalCompletions: 0,
        displayedCompletions: 0,
        truncated: false,
        modelNote: ATTRIBUTION_MODEL_NOTE,
    };

    const db = context.cloudflare.env.DB;
    if (!db) {
        return empty;
    }

    const allGoals = (await listGoals(db, site)).filter((g) => g.enabled);
    const goals: LoaderGoal[] = allGoals.map((g) => ({
        goalId: g.goalId,
        name: g.name,
        type: g.goalType,
    }));

    if (allGoals.length === 0) {
        return {
            ...empty,
            available: true as const,
        };
    }

    const selected: Goal =
        allGoals.find((g) => g.goalId === goalIdParam) ?? allGoals[0];

    let rows: AttributionRow[] = [];
    let totalCompletions = 0;
    try {
        const mode = selected.goalType === "event" ? "event" : "pageview";
        const hits = await analyticsEngine.getGoalAttributionRawHits(
            site,
            interval,
            tz,
            filters,
            { mode, limit: 2000 },
        );
        const allRows = attributeGoalHits(selected, hits, dimension);
        // Untruncated dimension sum is the attribution total; path-count
        // helper is a consistency cross-check for the same hit set.
        const untruncatedSum = sumCompletions(allRows);
        totalCompletions =
            untruncatedSum > 0
                ? untruncatedSum
                : computeGoalCompletions(selected, hitsToPathCounts(hits));
        rows = allRows.slice(0, ATTRIBUTION_UI_TOP_N);
    } catch (err) {
        console.error(err);
    }

    const displayedCompletions = sumCompletions(rows);
    const truncated =
        totalCompletions > 0 && displayedCompletions < totalCompletions;

    return {
        available: true as const,
        goals,
        selectedGoalId: selected.goalId,
        dimension,
        rows,
        totalCompletions,
        displayedCompletions,
        truncated,
        modelNote: ATTRIBUTION_MODEL_NOTE,
    };
}

export const AttributionCard = ({
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

    const submit = (goalId?: string, dimension?: string) => {
        const params = new URLSearchParams({ site: siteId, interval });
        if (timezone) params.set("timezone", timezone);
        Object.entries(filters ?? {}).forEach(([k, v]) => {
            if (v !== undefined) params.set(k, String(v));
        });
        if (goalId) params.set("goalId", goalId);
        if (dimension) params.set("dimension", dimension);
        fetcher.submit(params, {
            method: "get",
            action: "/resources/attribution",
        });
    };

    useEffect(() => {
        submit();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteId, interval, filters, timezone]);

    const data = fetcher.data;
    const loading = fetcher.state === "loading";
    const selectedGoalId = data?.selectedGoalId || "";
    const dimension = data?.dimension || "sourceType";
    const total = data?.totalCompletions ?? 0;
    const rows = data?.rows ?? [];

    return (
        <Card
            className={
                loading
                    ? "p-4 rounded-[1.35rem] opacity-60 space-y-3"
                    : "p-4 rounded-[1.35rem] space-y-3"
            }
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Attribution</h3>
                <a
                    className="text-xs underline text-muted-foreground"
                    href={`/console/sites/${encodeURIComponent(siteId)}/goals`}
                >
                    Manage goals
                </a>
            </div>

            <p className="text-xs text-muted-foreground leading-snug">
                {data?.modelNote ?? ATTRIBUTION_MODEL_NOTE}
            </p>

            {!data?.available || !data.goals?.length ? (
                <p className="text-sm text-muted-foreground py-2">
                    No enabled goals. Create one in console → Goals.
                </p>
            ) : (
                <>
                    <div className="flex flex-wrap gap-2 items-center text-sm">
                        <label
                            htmlFor="attribution-goal"
                            className="text-xs text-muted-foreground shrink-0"
                        >
                            Goal
                        </label>
                        <select
                            id="attribution-goal"
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs max-w-[14rem]"
                            value={selectedGoalId}
                            onChange={(e) =>
                                submit(e.target.value, dimension)
                            }
                        >
                            {data.goals.map((g) => (
                                <option key={g.goalId} value={g.goalId}>
                                    {g.name} ({g.type})
                                </option>
                            ))}
                        </select>
                        <label
                            htmlFor="attribution-dimension"
                            className="text-xs text-muted-foreground shrink-0 ml-2"
                        >
                            Dimension
                        </label>
                        <select
                            id="attribution-dimension"
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs max-w-[12rem]"
                            value={dimension}
                            onChange={(e) =>
                                submit(selectedGoalId, e.target.value)
                            }
                        >
                            {ATTRIBUTION_DIMENSIONS.map((d) => (
                                <option key={d} value={d}>
                                    {ATTRIBUTION_DIMENSION_LABELS[d]}
                                </option>
                            ))}
                        </select>
                    </div>

                    {!rows.length ? (
                        <p className="text-sm text-muted-foreground py-2">
                            No completions for this goal in range.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs text-muted-foreground border-b border-border/60">
                                        <th className="py-1.5 font-medium">
                                            {
                                                ATTRIBUTION_DIMENSION_LABELS[
                                                    dimension
                                                ]
                                            }
                                        </th>
                                        <th className="py-1.5 font-medium text-right">
                                            Completions
                                        </th>
                                        <th className="py-1.5 font-medium text-right">
                                            Share
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/40">
                                    {rows.map((row) => {
                                        const share =
                                            total > 0
                                                ? row.completions / total
                                                : 0;
                                        return (
                                            <tr key={row.key}>
                                                <td className="py-1.5 truncate max-w-[16rem]">
                                                    {row.key}
                                                </td>
                                                <td className="py-1.5 tabular-nums text-right">
                                                    {row.completions}
                                                </td>
                                                <td className="py-1.5 tabular-nums text-right">
                                                    {(share * 100).toFixed(1)}%
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {data.truncated ? (
                                <p className="text-[10px] text-muted-foreground mt-2">
                                    Showing top {ATTRIBUTION_UI_TOP_N} · sum of
                                    rows ({data.displayedCompletions}) ≤ total
                                    completions ({total}).
                                </p>
                            ) : (
                                <p className="text-[10px] text-muted-foreground mt-2">
                                    Total completions: {total}
                                </p>
                            )}
                        </div>
                    )}
                </>
            )}
        </Card>
    );
};
