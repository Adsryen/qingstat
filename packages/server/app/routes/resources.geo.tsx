import { useEffect } from "react";
import { useFetcher } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { getFiltersFromSearchParams, paramsFromUrl } from "~/lib/utils";
import { SearchFilters } from "~/lib/types";
import { assertCanViewSiteStats } from "~/lib/siteAccess";
import { useLocale } from "~/i18n/LocaleContext";
import { ChartShell } from "~/components/analytics/ChartShell";
import { DataState } from "~/components/analytics/DataState";

type GeoPoint = {
    city: string;
    region: string;
    country: string;
    latitude: number;
    longitude: number;
    visitors: number;
};

export async function loader({ context, request }: LoaderFunctionArgs) {
    const { analyticsEngine } = context;
    const url = new URL(request.url);
    const siteForAccess =
        url.searchParams.get("site") || paramsFromUrl(request.url).site || "";
    await assertCanViewSiteStats(
        request,
        context.cloudflare.env,
        siteForAccess === "@unknown" ? "" : siteForAccess,
    );

    const { interval, site } = paramsFromUrl(request.url);
    const tz = url.searchParams.get("timezone") || "UTC";
    const filters = getFiltersFromSearchParams(url.searchParams);

    const points = await analyticsEngine.getGeoPoints(
        site,
        interval,
        tz,
        filters,
        100,
    );

    return { points };
}

function project(lat: number, lon: number, width: number, height: number) {
    // equirectangular projection for a lightweight scatter map
    const x = ((lon + 180) / 360) * width;
    const y = ((90 - lat) / 180) * height;
    return { x, y };
}

export const GeoMapCard = ({
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
    const dataFetcher = useFetcher<typeof loader>();
    const { t } = useLocale();
    const points: GeoPoint[] = dataFetcher.data?.points || [];

    useEffect(() => {
        const params = {
            site: siteId,
            interval,
            timezone,
            ...filters,
        };
        dataFetcher.submit(params, {
            method: "get",
            action: "/resources/geo",
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteId, interval, filters, timezone]);

    const width = 640;
    const height = 280;
    const maxVisitors = Math.max(1, ...points.map((p) => p.visitors));

    return (
        <ChartShell
            eyebrow={t("console.overview.geoEyebrow")}
            title={t("metrics.geoMap")}
            description={t("metrics.geoMapDesc")}
            loading={dataFetcher.state === "loading"}
            contentClassName="space-y-4"
        >
            <div className="w-full overflow-x-auto">
                <svg
                    viewBox={`0 0 ${width} ${height}`}
                    className="h-auto w-full rounded-2xl border border-border/70 bg-muted/25 shadow-inner"
                    role="img"
                    aria-label={t("metrics.geoMap")}
                >
                    <defs>
                        <radialGradient id="geoPulse" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="hsl(var(--live))" stopOpacity="0.76" />
                            <stop offset="100%" stopColor="hsl(var(--heat))" stopOpacity="0.18" />
                        </radialGradient>
                    </defs>
                    <rect x="0" y="0" width={width} height={height} fill="transparent" />
                    {[0.25, 0.5, 0.75].map((f) => (
                        <line
                            key={`h-${f}`}
                            x1={0}
                            x2={width}
                            y1={height * f}
                            y2={height * f}
                            stroke="currentColor"
                            strokeOpacity={0.08}
                        />
                    ))}
                    {[0.25, 0.5, 0.75].map((f) => (
                        <line
                            key={`v-${f}`}
                            y1={0}
                            y2={height}
                            x1={width * f}
                            x2={width * f}
                            stroke="currentColor"
                            strokeOpacity={0.08}
                        />
                    ))}
                    {points.map((p, i) => {
                        const { x, y } = project(p.latitude, p.longitude, width, height);
                        const r = 3 + Math.sqrt(p.visitors / maxVisitors) * 14;
                        const label = [p.city, p.region, p.country].filter(Boolean).join(", ");
                        return (
                            <g key={`${p.latitude}-${p.longitude}-${i}`}>
                                <circle
                                    cx={x}
                                    cy={y}
                                    r={r + 8}
                                    fill="url(#geoPulse)"
                                    opacity={0.18}
                                />
                                <circle
                                    cx={x}
                                    cy={y}
                                    r={r}
                                    fill="hsl(var(--live))"
                                    fillOpacity={0.58}
                                    stroke="hsl(var(--background))"
                                    strokeWidth={1.5}
                                >
                                    <title>{`${label || "(unknown)"} · ${p.visitors}`}</title>
                                </circle>
                            </g>
                        );
                    })}
                </svg>
            </div>

            {points.length === 0 ? (
                <DataState title={t("metrics.geoMapEmpty")} tone="live" />
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-border/70">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b bg-muted/35 text-muted-foreground">
                                <th className="py-2 pl-3 pr-2 font-medium">
                                    {t("metrics.city")}
                                </th>
                                <th className="py-2 pr-2 font-medium">
                                    {t("metrics.region")}
                                </th>
                                <th className="py-2 pr-2 font-medium">
                                    {t("metrics.country")}
                                </th>
                                <th className="py-2 pr-2 font-medium">
                                    Lat / Lon
                                </th>
                                <th className="py-2 pl-2 pr-3 text-right font-medium">
                                    {t("metrics.uv")}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {points.slice(0, 12).map((p, i) => (
                                <tr
                                    key={`${p.city}-${p.latitude}-${i}`}
                                    className="border-b border-border/50 last:border-0"
                                >
                                    <td className="py-2 pl-3 pr-2">{p.city || "—"}</td>
                                    <td className="py-2 pr-2">{p.region || "—"}</td>
                                    <td className="py-2 pr-2">{p.country || "—"}</td>
                                    <td className="py-2 pr-2 font-mono text-xs text-muted-foreground">
                                        {p.latitude.toFixed(2)}, {p.longitude.toFixed(2)}
                                    </td>
                                    <td className="py-2 pl-2 pr-3 text-right tabular-nums">
                                        {p.visitors}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </ChartShell>
    );
};
