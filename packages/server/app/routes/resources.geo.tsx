import { useEffect } from "react";
import { useFetcher } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { getFiltersFromSearchParams, paramsFromUrl } from "~/lib/utils";
import { SearchFilters } from "~/lib/types";
import { assertCanViewSiteStats } from "~/lib/siteAccess";
import { useLocale } from "~/i18n/LocaleContext";

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
        <Card
            className={
                dataFetcher.state === "loading"
                    ? "opacity-60 rounded-2xl"
                    : "rounded-2xl"
            }
        >
            <CardHeader className="pb-2">
                <CardTitle className="text-base">
                    {t("metrics.geoMap")}
                </CardTitle>
                <CardDescription>{t("metrics.geoMapDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="w-full overflow-x-auto">
                    <svg
                        viewBox={`0 0 ${width} ${height}`}
                        className="w-full h-auto rounded-xl border border-border bg-muted/30"
                        role="img"
                        aria-label={t("metrics.geoMap")}
                    >
                        <rect
                            x="0"
                            y="0"
                            width={width}
                            height={height}
                            fill="transparent"
                        />
                        {/* simple graticule */}
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
                            const { x, y } = project(
                                p.latitude,
                                p.longitude,
                                width,
                                height,
                            );
                            const r =
                                3 +
                                Math.sqrt(p.visitors / maxVisitors) * 14;
                            const label = [p.city, p.region, p.country]
                                .filter(Boolean)
                                .join(", ");
                            return (
                                <g key={`${p.latitude}-${p.longitude}-${i}`}>
                                    <circle
                                        cx={x}
                                        cy={y}
                                        r={r}
                                        fill="hsl(var(--primary))"
                                        fillOpacity={0.55}
                                        stroke="hsl(var(--primary))"
                                        strokeOpacity={0.9}
                                    >
                                        <title>
                                            {`${label || "(unknown)"} · ${p.visitors}`}
                                        </title>
                                    </circle>
                                </g>
                            );
                        })}
                    </svg>
                </div>

                {points.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        {t("metrics.geoMapEmpty")}
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead>
                                <tr className="border-b text-muted-foreground">
                                    <th className="py-1.5 pr-2 font-medium">
                                        {t("metrics.city")}
                                    </th>
                                    <th className="py-1.5 pr-2 font-medium">
                                        {t("metrics.region")}
                                    </th>
                                    <th className="py-1.5 pr-2 font-medium">
                                        {t("metrics.country")}
                                    </th>
                                    <th className="py-1.5 pr-2 font-medium">
                                        Lat / Lon
                                    </th>
                                    <th className="py-1.5 font-medium text-right">
                                        {t("metrics.uv")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {points.slice(0, 12).map((p, i) => (
                                    <tr
                                        key={`${p.city}-${p.latitude}-${i}`}
                                        className="border-b border-border/50"
                                    >
                                        <td className="py-1.5 pr-2">
                                            {p.city || "—"}
                                        </td>
                                        <td className="py-1.5 pr-2">
                                            {p.region || "—"}
                                        </td>
                                        <td className="py-1.5 pr-2">
                                            {p.country || "—"}
                                        </td>
                                        <td className="py-1.5 pr-2 font-mono text-xs text-muted-foreground">
                                            {p.latitude.toFixed(2)},{" "}
                                            {p.longitude.toFixed(2)}
                                        </td>
                                        <td className="py-1.5 text-right">
                                            {p.visitors}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
