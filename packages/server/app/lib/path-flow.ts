/**
 * Path flow: visit step-transition edges from D1 pageviews.
 * Cost-bounded (scan / visits / steps / top nodes & edges). Not AE.
 */

export const UNKNOWN_PATH = "(unknown)";
export const OTHER_PATH = "(other)";
export const MAX_PAGEVIEW_SCAN = 5000;
export const MAX_VISITS = 2000;
/** Max pages considered per visit → up to MAX_STEPS - 1 edges. */
export const MAX_STEPS = 5;
export const TOP_NODES = 12;
export const TOP_EDGES = 40;

export type PathFlowEdge = {
    from: string;
    to: string;
    visits: number;
};

export type PathFlowNode = {
    path: string;
    visits: number;
};

export type PathFlowResult = {
    edges: PathFlowEdge[];
    nodes: PathFlowNode[];
    otherLabel: string;
    scannedVisits: number;
    scannedPageviews: number;
    truncated: boolean;
    note: string;
};

export type PathFlowSequence = {
    visitId: string;
    paths: string[];
};

export type AggregatePathFlowOptions = {
    maxSteps?: number;
    topNodes?: number;
    topEdges?: number;
    scannedVisits?: number;
    scannedPageviews?: number;
    truncated?: boolean;
};

export function normalizePath(path: string | null | undefined): string {
    return path?.trim() || UNKNOWN_PATH;
}

/** Drop consecutive duplicate paths (SPA re-reports). */
export function collapseConsecutive(paths: string[]): string[] {
    if (paths.length === 0) return [];
    const out: string[] = [paths[0]];
    for (let i = 1; i < paths.length; i++) {
        if (paths[i] !== out[out.length - 1]) {
            out.push(paths[i]);
        }
    }
    return out;
}

/**
 * Emit adjacent edges from a (preferably collapsed) path sequence.
 * Considers only the first `maxSteps` pages → at most maxSteps-1 edges.
 */
export function edgesFromSequence(
    paths: string[],
    maxSteps: number = MAX_STEPS,
): Array<{ from: string; to: string }> {
    if (paths.length < 2 || maxSteps < 2) return [];
    const limited = paths.slice(0, maxSteps);
    const edges: Array<{ from: string; to: string }> = [];
    for (let i = 0; i < limited.length - 1; i++) {
        edges.push({ from: limited[i], to: limited[i + 1] });
    }
    return edges;
}

function edgeKey(from: string, to: string): string {
    return `${from}\0${to}`;
}

function buildNote(opts: {
    maxSteps: number;
    topNodes: number;
    topEdges: number;
    scannedVisits: number;
    scannedPageviews: number;
    truncated: boolean;
}): string {
    const base =
        `Path transitions from D1 pageviews (visit_id). ` +
        `Caps: ≤${MAX_PAGEVIEW_SCAN} pageviews, ≤${MAX_VISITS} visits, ` +
        `≤${opts.maxSteps} steps/visit, top ${opts.topNodes} nodes / ${opts.topEdges} edges. ` +
        `Non-top nodes → ${OTHER_PATH}. Consecutive duplicate paths collapsed.`;
    const stats = ` Scanned ${opts.scannedPageviews} pageviews · ${opts.scannedVisits} visits.`;
    const trunc = opts.truncated ? " Sample truncated by cost caps." : "";
    return base + stats + trunc;
}

export function aggregatePathFlow(
    sequences: PathFlowSequence[],
    opts: AggregatePathFlowOptions = {},
): PathFlowResult {
    const maxSteps = opts.maxSteps ?? MAX_STEPS;
    const topNodes = opts.topNodes ?? TOP_NODES;
    const topEdges = opts.topEdges ?? TOP_EDGES;
    const scannedVisits = opts.scannedVisits ?? sequences.length;
    const scannedPageviews =
        opts.scannedPageviews ??
        sequences.reduce((sum, s) => sum + s.paths.length, 0);
    const truncated = opts.truncated ?? false;

    // 1) Emit raw edges per visit (collapse → maxSteps → hops)
    const rawEdgeCounts = new Map<string, { from: string; to: string; visits: number }>();

    for (const seq of sequences) {
        const normalized = seq.paths.map(normalizePath);
        const collapsed = collapseConsecutive(normalized);
        const edges = edgesFromSequence(collapsed, maxSteps);
        for (const e of edges) {
            const key = edgeKey(e.from, e.to);
            const existing = rawEdgeCounts.get(key);
            if (existing) {
                existing.visits += 1;
            } else {
                rawEdgeCounts.set(key, { from: e.from, to: e.to, visits: 1 });
            }
        }
    }

    // 2) Node frequency = sum of edge visits where node is from or to
    const nodeFreq = new Map<string, number>();
    for (const e of rawEdgeCounts.values()) {
        nodeFreq.set(e.from, (nodeFreq.get(e.from) || 0) + e.visits);
        nodeFreq.set(e.to, (nodeFreq.get(e.to) || 0) + e.visits);
    }

    // 3) Keep top N nodes; remap rest → (other)
    const rankedNodes = Array.from(nodeFreq.entries()).sort((a, b) => {
        const delta = b[1] - a[1];
        if (delta !== 0) return delta;
        return a[0].localeCompare(b[0]);
    });
    const keep = new Set(rankedNodes.slice(0, topNodes).map(([path]) => path));
    // Always keep special labels if they already appear among top; otherwise they map to other if not top.
    // (other) itself is the sink label — never remap away from OTHER_PATH if already present as a real path? unlikely.

    const remap = (path: string): string =>
        keep.has(path) ? path : OTHER_PATH;

    // 4) Re-aggregate edges with remapped endpoints (keep Other→Other)
    const remapped = new Map<string, { from: string; to: string; visits: number }>();
    for (const e of rawEdgeCounts.values()) {
        const from = remap(e.from);
        const to = remap(e.to);
        const key = edgeKey(from, to);
        const existing = remapped.get(key);
        if (existing) {
            existing.visits += e.visits;
        } else {
            remapped.set(key, { from, to, visits: e.visits });
        }
    }

    const edges = Array.from(remapped.values())
        .sort((a, b) => {
            const delta = b.visits - a.visits;
            if (delta !== 0) return delta;
            const fromCmp = a.from.localeCompare(b.from);
            if (fromCmp !== 0) return fromCmp;
            return a.to.localeCompare(b.to);
        })
        .slice(0, topEdges);

    // Nodes that appear in final edges (frequency from remapped edge endpoints)
    const finalNodeFreq = new Map<string, number>();
    for (const e of edges) {
        finalNodeFreq.set(e.from, (finalNodeFreq.get(e.from) || 0) + e.visits);
        finalNodeFreq.set(e.to, (finalNodeFreq.get(e.to) || 0) + e.visits);
    }
    const nodes: PathFlowNode[] = Array.from(finalNodeFreq.entries())
        .map(([path, visits]) => ({ path, visits }))
        .sort((a, b) => {
            const delta = b.visits - a.visits;
            if (delta !== 0) return delta;
            return a.path.localeCompare(b.path);
        });

    return {
        edges,
        nodes,
        otherLabel: OTHER_PATH,
        scannedVisits,
        scannedPageviews,
        truncated,
        note: buildNote({
            maxSteps,
            topNodes,
            topEdges,
            scannedVisits,
            scannedPageviews,
            truncated,
        }),
    };
}

export type PathFlowDateRange = {
    startDate: Date;
    endDate: Date;
};

/**
 * Load pageviews from D1, group by visit_id, aggregate path-flow edges.
 */
export async function computePathFlow(
    db: D1Database,
    siteId: string,
    range: PathFlowDateRange,
    filters?: { path?: string },
): Promise<PathFlowResult> {
    const start = range.startDate.toISOString();
    const end = range.endDate.toISOString();

    const result = await db
        .prepare(
            `SELECT p.visit_id as visit_id,
                    p.path as path,
                    p.occurred_at as occurred_at
             FROM pageviews p
             WHERE p.site_id = ?
               AND p.occurred_at >= ?
               AND p.occurred_at < ?
             ORDER BY p.occurred_at ASC
             LIMIT ?`,
        )
        .bind(siteId, start, end, MAX_PAGEVIEW_SCAN)
        .all<{
            visit_id: string;
            path: string | null;
            occurred_at: string;
        }>();

    const rows = result.results ?? [];
    const scannedPageviews = rows.length;
    const hitPageviewCap = scannedPageviews >= MAX_PAGEVIEW_SCAN;

    // Group by visit_id preserving first-seen order (rows already ASC by occurred_at)
    const visitOrder: string[] = [];
    const byVisit = new Map<string, string[]>();
    for (const row of rows) {
        const visitId = row.visit_id;
        if (!visitId) continue;
        if (!byVisit.has(visitId)) {
            visitOrder.push(visitId);
            byVisit.set(visitId, []);
        }
        byVisit.get(visitId)!.push(normalizePath(row.path));
    }

    const hitVisitCap = visitOrder.length > MAX_VISITS;
    const limitedVisitIds = hitVisitCap
        ? visitOrder.slice(0, MAX_VISITS)
        : visitOrder;

    let sequences: PathFlowSequence[] = limitedVisitIds.map((visitId) => ({
        visitId,
        paths: byVisit.get(visitId) || [],
    }));

    // Optional path filter: only visits that contain the path (after normalize)
    if (filters?.path) {
        const target = normalizePath(filters.path);
        sequences = sequences.filter((seq) =>
            seq.paths.some((p) => normalizePath(p) === target),
        );
    }

    return aggregatePathFlow(sequences, {
        scannedVisits: sequences.length,
        scannedPageviews,
        truncated: hitPageviewCap || hitVisitCap,
    });
}

export function emptyPathFlowResult(
    reason: "db-unavailable" | "error" = "db-unavailable",
): PathFlowResult {
    return {
        edges: [],
        nodes: [],
        otherLabel: OTHER_PATH,
        scannedVisits: 0,
        scannedPageviews: 0,
        truncated: false,
        note:
            reason === "db-unavailable"
                ? "Path flow unavailable (no D1 database)."
                : "Path flow query failed.",
    };
}
