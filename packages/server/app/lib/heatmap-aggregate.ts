/**
 * Heatmap aggregation helpers for the click-heatmap spike.
 * Pure functions over synthetic (or future) point events.
 */

export type CoordinateLike = {
    xRatio: number;
    yRatio: number;
    pageVersion?: string;
    elementKey?: string;
    actionUrl?: string;
};

export type RankItem = {
    key: string;
    count: number;
    share: number;
};

export type HeatGrid = {
    width: number;
    height: number;
    /** row-major intensity, non-negative */
    cells: Float64Array;
    max: number;
    pointCount: number;
};

function clamp01(n: number): number {
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}

/**
 * Bucket normalized coordinates into a grid intensity map.
 * Points at edges map into the last cell (inclusive 1.0).
 */
export function bucketCoordinateHeat(
    points: CoordinateLike[],
    gridW: number,
    gridH: number,
): HeatGrid {
    const width = Math.max(1, Math.floor(gridW));
    const height = Math.max(1, Math.floor(gridH));
    const cells = new Float64Array(width * height);
    let max = 0;
    let pointCount = 0;

    for (const p of points) {
        const xr = clamp01(p.xRatio);
        const yr = clamp01(p.yRatio);
        const x = Math.min(width - 1, Math.floor(xr * width));
        const y = Math.min(height - 1, Math.floor(yr * height));
        const idx = y * width + x;
        const next = cells[idx] + 1;
        cells[idx] = next;
        if (next > max) max = next;
        pointCount += 1;
    }

    return { width, height, cells, max, pointCount };
}

/**
 * Apply a simple disk blur on the intensity grid (in-place copy).
 * Useful before canvas colorization.
 */
export function blurHeatGrid(grid: HeatGrid, radius = 1): HeatGrid {
    const r = Math.max(0, Math.floor(radius));
    if (r === 0) {
        return {
            ...grid,
            cells: new Float64Array(grid.cells),
        };
    }
    const { width, height, cells } = grid;
    const out = new Float64Array(cells.length);
    let max = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;
            let n = 0;
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (dx * dx + dy * dy > r * r) continue;
                    const xx = x + dx;
                    const yy = y + dy;
                    if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
                    sum += cells[yy * width + xx];
                    n += 1;
                }
            }
            const v = n > 0 ? sum / n : 0;
            out[y * width + x] = v;
            if (v > max) max = v;
        }
    }
    return {
        width,
        height,
        cells: out,
        max,
        pointCount: grid.pointCount,
    };
}

function rankByKey(
    keys: Array<string | undefined | null>,
    topN = 20,
): RankItem[] {
    const counts = new Map<string, number>();
    let total = 0;
    for (const k of keys) {
        if (!k) continue;
        total += 1;
        counts.set(k, (counts.get(k) || 0) + 1);
    }
    const items = [...counts.entries()]
        .map(([key, count]) => ({
            key,
            count,
            share: total > 0 ? count / total : 0,
        }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    return items.slice(0, Math.max(0, topN));
}

export function rankElements(
    events: Array<{ elementKey?: string | null }>,
    topN = 20,
): RankItem[] {
    return rankByKey(
        events.map((e) => e.elementKey),
        topN,
    );
}

export function rankLinks(
    events: Array<{ actionUrl?: string | null }>,
    topN = 20,
): RankItem[] {
    return rankByKey(
        events.map((e) => e.actionUrl),
        topN,
    );
}

export function splitByPageVersion<T extends { pageVersion?: string }>(
    points: T[],
): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const p of points) {
        const v = p.pageVersion || "unknown";
        const list = map.get(v);
        if (list) list.push(p);
        else map.set(v, [p]);
    }
    return map;
}

/**
 * Map intensity 0..1 to cool→hot RGB (blue → cyan → green → yellow → red).
 */
export function intensityToRgba(
    t: number,
    alpha = 0.85,
): [number, number, number, number] {
    const x = clamp01(t);
    // 4-stop gradient
    const stops: Array<[number, number, number]> = [
        [0, 0, 255],
        [0, 255, 255],
        [0, 255, 0],
        [255, 255, 0],
        [255, 0, 0],
    ];
    const scaled = x * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(scaled));
    const f = scaled - i;
    const a = stops[i];
    const b = stops[i + 1];
    return [
        Math.round(a[0] + (b[0] - a[0]) * f),
        Math.round(a[1] + (b[1] - a[1]) * f),
        Math.round(a[2] + (b[2] - a[2]) * f),
        alpha,
    ];
}
