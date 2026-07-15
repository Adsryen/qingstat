import type { SearchFilters } from "./types";

/** Fixed visit-frequency buckets (visits per visitor in range). */
export const VISIT_FREQUENCY_BUCKETS = [
    "1",
    "2",
    "3-5",
    "6-10",
    "11+",
] as const;

/** Fixed return-gap buckets between consecutive visits. */
export const RETURN_GAP_BUCKETS = [
    "<1d",
    "1-7d",
    "7-30d",
    "30d+",
] as const;

export type LoyaltyBucket = { bucket: string; visitors: number };

export type VisitorLoyaltySummary = {
    available: boolean;
    reason: "db-unavailable" | "no-identity" | null;
    /** Visitors with a non-empty visitor_id in range */
    identifiedVisitors: number;
    /** Visits in range with visitor_id */
    identifiedVisits: number;
    /** Share of visits in range that have visitor_id */
    identityCoverageRate: number | null;
    frequencyBuckets: LoyaltyBucket[];
    returnGapBuckets: LoyaltyBucket[];
    note: string;
};

export type LoyaltyDateRange = {
    startDate: Date;
    endDate: Date;
};

type VisitRow = {
    visit_id: string;
    visitor_id: string | null;
    first_seen_at: string;
};

const PRODUCT_NOTE =
    "Based on anonymous visitor_id (localStorage). Clearing storage or switching devices resets identity; coverage is shown above.";

export function frequencyBucket(visitCount: number): (typeof VISIT_FREQUENCY_BUCKETS)[number] {
    if (visitCount <= 1) return "1";
    if (visitCount === 2) return "2";
    if (visitCount <= 5) return "3-5";
    if (visitCount <= 10) return "6-10";
    return "11+";
}

/** Gap in days between two visit timestamps (later - earlier). */
export function returnGapBucket(gapMs: number): (typeof RETURN_GAP_BUCKETS)[number] {
    const days = gapMs / (24 * 60 * 60 * 1000);
    if (days < 1) return "<1d";
    if (days < 7) return "1-7d";
    if (days < 30) return "7-30d";
    return "30d+";
}

function emptyBuckets(labels: readonly string[]): LoyaltyBucket[] {
    return labels.map((bucket) => ({ bucket, visitors: 0 }));
}

function increment(buckets: LoyaltyBucket[], bucket: string, n = 1) {
    const row = buckets.find((b) => b.bucket === bucket);
    if (row) row.visitors += n;
}

/**
 * Pure aggregation over visit rows (testable without D1).
 * Only rows with non-empty visitor_id contribute to frequency/gap.
 */
export function aggregateVisitorLoyalty(
    visits: VisitRow[],
    totalVisitsInRange: number,
): VisitorLoyaltySummary {
    const frequencyBuckets = emptyBuckets(VISIT_FREQUENCY_BUCKETS);
    const returnGapBuckets = emptyBuckets(RETURN_GAP_BUCKETS);

    const byVisitor = new Map<string, string[]>();
    for (const visit of visits) {
        const vid = visit.visitor_id?.trim();
        if (!vid) continue;
        const list = byVisitor.get(vid) || [];
        list.push(visit.first_seen_at);
        byVisitor.set(vid, list);
    }

    let identifiedVisits = 0;
    for (const times of byVisitor.values()) {
        identifiedVisits += times.length;
        increment(frequencyBuckets, frequencyBucket(times.length));

        if (times.length < 2) continue;
        const sorted = [...times].sort();
        // Count each consecutive gap once per visitor-pair of visits
        for (let i = 1; i < sorted.length; i++) {
            const earlier = Date.parse(sorted[i - 1]);
            const later = Date.parse(sorted[i]);
            if (!Number.isFinite(earlier) || !Number.isFinite(later) || later < earlier) {
                continue;
            }
            increment(returnGapBuckets, returnGapBucket(later - earlier));
        }
    }

    const identifiedVisitors = byVisitor.size;
    const identityCoverageRate =
        totalVisitsInRange > 0 ? identifiedVisits / totalVisitsInRange : null;

    return {
        available: true,
        reason: identifiedVisitors === 0 ? "no-identity" : null,
        identifiedVisitors,
        identifiedVisits,
        identityCoverageRate,
        frequencyBuckets,
        returnGapBuckets,
        note: PRODUCT_NOTE,
    };
}

export async function getVisitorLoyaltySummary(
    db: D1Database,
    siteId: string,
    range: LoyaltyDateRange,
    _filters: SearchFilters = {},
): Promise<VisitorLoyaltySummary> {
    const start = range.startDate.toISOString();
    const end = range.endDate.toISOString();

    // Total visits in range (for coverage) — includes missing visitor_id
    const totalRow = await db
        .prepare(
            `SELECT COUNT(*) AS n
             FROM visits
             WHERE site_id = ?
               AND first_seen_at >= ?
               AND first_seen_at < ?`,
        )
        .bind(siteId, start, end)
        .first<{ n: number | string }>();

    const totalVisitsInRange = Number(totalRow?.n) || 0;

    const result = await db
        .prepare(
            `SELECT visit_id, visitor_id, first_seen_at
             FROM visits
             WHERE site_id = ?
               AND first_seen_at >= ?
               AND first_seen_at < ?
             ORDER BY first_seen_at ASC`,
        )
        .bind(siteId, start, end)
        .all<VisitRow>();

    const visits = result.results ?? [];
    return aggregateVisitorLoyalty(visits, totalVisitsInRange);
}

export function unavailableVisitorLoyaltySummary(
    reason: "db-unavailable" = "db-unavailable",
): VisitorLoyaltySummary {
    return {
        available: false,
        reason,
        identifiedVisitors: 0,
        identifiedVisits: 0,
        identityCoverageRate: null,
        frequencyBuckets: emptyBuckets(VISIT_FREQUENCY_BUCKETS),
        returnGapBuckets: emptyBuckets(RETURN_GAP_BUCKETS),
        note: PRODUCT_NOTE,
    };
}

/** Format buckets as TableCard rows: [label, count] */
export function loyaltyBucketsToTableRows(
    buckets: LoyaltyBucket[],
): [string, number][] {
    return buckets.map((b) => [b.bucket, b.visitors]);
}
