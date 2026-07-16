/**
 * Canvas heatmap spike — client-only renderer.
 * Not wired to production collect. Uses synthetic points only in demos.
 */

import { useEffect, useRef } from "react";

import {
    blurHeatGrid,
    bucketCoordinateHeat,
    intensityToRgba,
    type RankItem,
} from "~/lib/heatmap-aggregate";

export type HeatmapPoint = {
    xRatio: number;
    yRatio: number;
};

export type RenderHeatmapOptions = {
    /** intensity grid resolution before upscale (default ~1 cell / 8px) */
    cellSize?: number;
    /** blur radius in grid cells */
    blurRadius?: number;
    /** global alpha for heat layer */
    alpha?: number;
};

/**
 * Draw radial/grid heatmap into an existing 2d context.
 * Pure helper for tests and the React wrapper.
 */
export function renderHeatmapToCanvas(
    ctx: CanvasRenderingContext2D,
    points: HeatmapPoint[],
    width: number,
    height: number,
    options: RenderHeatmapOptions = {},
): { renderMs: number; pointCount: number; maxIntensity: number } {
    const start =
        typeof performance !== "undefined" ? performance.now() : Date.now();
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    const cellSize = Math.max(2, options.cellSize ?? 8);
    const gridW = Math.max(1, Math.ceil(w / cellSize));
    const gridH = Math.max(1, Math.ceil(h / cellSize));
    const blurRadius = options.blurRadius ?? 2;
    const alpha = options.alpha ?? 0.75;

    let grid = bucketCoordinateHeat(points, gridW, gridH);
    grid = blurHeatGrid(grid, blurRadius);

    ctx.clearRect(0, 0, w, h);

    // optional subtle base so empty areas are visible in dark mode demos
    ctx.fillStyle = "rgba(15, 23, 42, 0.04)";
    ctx.fillRect(0, 0, w, h);

    if (grid.max <= 0 || grid.pointCount === 0) {
        const end =
            typeof performance !== "undefined" ? performance.now() : Date.now();
        return {
            renderMs: end - start,
            pointCount: 0,
            maxIntensity: 0,
        };
    }

    // draw each cell as a soft radial blob for smoother edges
    const radius = cellSize * (1.6 + blurRadius * 0.25);
    for (let gy = 0; gy < grid.height; gy++) {
        for (let gx = 0; gx < grid.width; gx++) {
            const v = grid.cells[gy * grid.width + gx];
            if (v <= 0) continue;
            const t = v / grid.max;
            if (t < 0.02) continue;
            const [r, g, b] = intensityToRgba(t, 1);
            const cx = ((gx + 0.5) / grid.width) * w;
            const cy = ((gy + 0.5) / grid.height) * h;
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
            const a = alpha * Math.min(1, t * 1.2);
            grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
            grad.addColorStop(0.55, `rgba(${r},${g},${b},${a * 0.45})`);
            grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    const end =
        typeof performance !== "undefined" ? performance.now() : Date.now();
    return {
        renderMs: end - start,
        pointCount: grid.pointCount,
        maxIntensity: grid.max,
    };
}

export function CanvasHeatmapSpike({
    points,
    width = 640,
    height = 360,
    className,
    cellSize,
    blurRadius,
    onRendered,
}: {
    points: HeatmapPoint[];
    width?: number;
    height?: number;
    className?: string;
    cellSize?: number;
    blurRadius?: number;
    onRendered?: (info: {
        renderMs: number;
        pointCount: number;
        maxIntensity: number;
    }) => void;
}) {
    const ref = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        // handle devicePixelRatio for sharper output
        const dpr =
            typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const info = renderHeatmapToCanvas(ctx, points, width, height, {
            cellSize,
            blurRadius,
        });
        onRendered?.(info);
    }, [points, width, height, cellSize, blurRadius, onRendered]);

    return (
        <canvas
            ref={ref}
            className={className}
            width={width}
            height={height}
            role="img"
            aria-label="Click heatmap spike visualization"
        />
    );
}

export function HeatmapRankTable({
    title,
    items,
    emptyLabel = "No ranked items",
    className,
}: {
    title: string;
    items: RankItem[];
    emptyLabel?: string;
    className?: string;
}) {
    return (
        <div className={className}>
            <h3 className="mb-2 text-sm font-semibold tracking-tight text-foreground">
                {title}
            </h3>
            {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">{emptyLabel}</p>
            ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                                <th className="px-3 py-2 font-medium">#</th>
                                <th className="px-3 py-2 font-medium">Key</th>
                                <th className="px-3 py-2 font-medium text-right">
                                    Count
                                </th>
                                <th className="px-3 py-2 font-medium text-right">
                                    Share
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => (
                                <tr
                                    key={item.key}
                                    className="border-t border-border/70"
                                >
                                    <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                                        {idx + 1}
                                    </td>
                                    <td className="max-w-[16rem] truncate px-3 py-1.5 font-mono text-xs">
                                        {item.key}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">
                                        {item.count}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                                        {(item.share * 100).toFixed(1)}%
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
