import { useFetcher } from "react-router";
import { useEffect } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { Card } from "~/components/ui/card";
import { assertCanViewSiteStats } from "~/lib/siteAccess";
import { getDateTimeRange, paramsFromUrl } from "~/lib/utils";
import type { SearchFilters } from "~/lib/types";
import {
    computeFunnelResult,
    listFunnels,
    type FunnelResult,
} from "~/lib/funnels";

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
    const db = context.cloudflare.env.DB;
    if (!db) {
        return { available: false as const, results: [] as FunnelResult[] };
    }
    const funnels = (await listFunnels(db, site)).filter((f) => f.enabled);
    const range = getDateTimeRange(interval, tz);
    const results: FunnelResult[] = [];
    for (const funnel of funnels.slice(0, 5)) {
        try {
            results.push(await computeFunnelResult(db, funnel, range));
        } catch (err) {
            console.error(err);
        }
    }
    return { available: true as const, results };
}

export const FunnelsCard = ({
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
        fetcher.submit(params, {
            method: "get",
            action: "/resources/funnels",
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteId, interval, timezone, filters]);

    const data = fetcher.data;
    const loading = fetcher.state === "loading";

    return (
        <Card
            className={
                loading
                    ? "p-4 rounded-[1.35rem] opacity-60 space-y-3"
                    : "p-4 rounded-[1.35rem] space-y-3"
            }
        >
            <div className="flex justify-between gap-2 items-center">
                <h3 className="text-sm font-semibold">Funnels</h3>
                <a
                    className="text-xs underline text-muted-foreground"
                    href={`/console/sites/${encodeURIComponent(siteId)}/funnels`}
                >
                    Manage
                </a>
            </div>
            {!data?.results?.length ? (
                <p className="text-sm text-muted-foreground">
                    No enabled funnels. Create 2–5 steps in console.
                </p>
            ) : (
                data.results.map((fr) => (
                    <div key={fr.funnel.funnelId} className="space-y-1 border-t border-border/50 pt-2">
                        <div className="text-sm font-medium">{fr.funnel.name}</div>
                        <ol className="text-xs space-y-1">
                            {fr.steps.map((s) => (
                                <li
                                    key={s.index}
                                    className="flex justify-between gap-2"
                                >
                                    <span className="truncate">
                                        {s.index + 1}. {s.step.type}:{" "}
                                        <code>{s.step.value}</code>
                                    </span>
                                    <span className="tabular-nums shrink-0">
                                        {s.visitors}
                                        {s.conversionFromPrev != null
                                            ? ` · ${(s.conversionFromPrev * 100).toFixed(0)}%`
                                            : ""}
                                    </span>
                                </li>
                            ))}
                        </ol>
                        <p className="text-[10px] text-muted-foreground leading-snug">
                            {fr.note}
                        </p>
                    </div>
                ))
            )}
        </Card>
    );
};
