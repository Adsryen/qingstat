/**
 * Optional requireAuth prototype page for the heatmap spike.
 * Not linked from main nav. Synthetic fixtures only.
 */

import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { useMemo, useState } from "react";

import {
    FIXTURE_1K,
    FIXTURE_10K,
    generateSyntheticClicks,
} from "~/components/analytics/heatmap/__fixtures__/clicks";
import {
    CanvasHeatmapSpike,
    HeatmapRankTable,
} from "~/components/analytics/heatmap/CanvasHeatmapSpike";
import {
    rankElements,
    rankLinks,
    splitByPageVersion,
} from "~/lib/heatmap-aggregate";
import { requireAuth } from "~/lib/auth";

export const meta: MetaFunction = () => {
    return [{ title: "Heatmap Spike · 轻统计" }];
};

export async function loader({ request, context }: LoaderFunctionArgs) {
    await requireAuth(request, context.cloudflare.env);
    return {
        note: "Spike prototype — synthetic data only. No production click collect.",
    };
}

type SizeKey = "1k" | "10k" | "mixed";

export default function ConsoleHeatmapSpike() {
    const { note } = useLoaderData<typeof loader>();
    const [size, setSize] = useState<SizeKey>("1k");
    const [renderMs, setRenderMs] = useState<number | null>(null);

    const points = useMemo(() => {
        if (size === "1k") return FIXTURE_1K;
        if (size === "10k") return FIXTURE_10K;
        // mixed versions for split demo
        return [
            ...generateSyntheticClicks({
                count: 800,
                seed: 10,
                pageVersion: "v1",
            }),
            ...generateSyntheticClicks({
                count: 400,
                seed: 11,
                pageVersion: "v2",
                deviceBucket: "mobile",
            }),
        ];
    }, [size]);

    const elementRanks = useMemo(() => rankElements(points, 10), [points]);
    const linkRanks = useMemo(() => rankLinks(points, 10), [points]);
    const versions = useMemo(() => {
        const map = splitByPageVersion(points);
        return [...map.entries()].map(([version, list]) => ({
            version,
            count: list.length,
        }));
    }, [points]);

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <header className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Spike · not production
                </p>
                <h1 className="text-2xl font-semibold tracking-tight">
                    Click Heatmap Spike
                </h1>
                <p className="max-w-3xl text-sm text-muted-foreground">{note}</p>
            </header>

            <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm text-muted-foreground">
                    Fixture size
                    <select
                        className="ml-2 rounded-md border border-border bg-background px-2 py-1 text-sm"
                        value={size}
                        onChange={(e) => setSize(e.target.value as SizeKey)}
                    >
                        <option value="1k">1k points (v1)</option>
                        <option value="10k">10k points (v1)</option>
                        <option value="mixed">1.2k mixed versions</option>
                    </select>
                </label>
                <span className="text-xs text-muted-foreground">
                    points: {points.length}
                    {renderMs != null
                        ? ` · last render ${renderMs.toFixed(1)}ms`
                        : ""}
                </span>
            </div>

            <section className="overflow-hidden rounded-xl border border-border bg-card p-3">
                <CanvasHeatmapSpike
                    points={points}
                    width={720}
                    height={400}
                    className="mx-auto block max-w-full rounded-md bg-slate-950/5 dark:bg-slate-50/5"
                    onRendered={(info) => setRenderMs(info.renderMs)}
                />
            </section>

            <section className="grid gap-6 md:grid-cols-2">
                <HeatmapRankTable
                    title="Element rank (synthetic keys)"
                    items={elementRanks}
                />
                <HeatmapRankTable
                    title="Link rank (path-only)"
                    items={linkRanks}
                />
            </section>

            <section className="rounded-xl border border-border p-4 text-sm">
                <h2 className="mb-2 font-semibold">Page version buckets</h2>
                <ul className="list-inside list-disc text-muted-foreground">
                    {versions.map((v) => (
                        <li key={v.version}>
                            {v.version}: {v.count} points
                        </li>
                    ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                    Coordinate heatmaps must not auto-merge across page_version.
                    Background preview / iframe embedding is intentionally not
                    enabled here (CSP / privacy). See research report for
                    go/no-go.
                </p>
            </section>
        </div>
    );
}
