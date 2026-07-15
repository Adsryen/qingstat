import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

import type { SearchFilters } from "./types";

dayjs.extend(utc);
dayjs.extend(timezone);

export type VisitorKind = "new" | "returning";

export type NewReturningTrendBucket = {
    bucket: string;
    newVisitors: number;
    returningVisitors: number;
};

export type NewReturningSummary = {
    available: boolean;
    reason: "db-unavailable" | null;
    coverageStartedAt: string | null;
    classifiedVisitors: number;
    newVisitors: number;
    returningVisitors: number;
    unclassifiedVisitors: number;
    newVisitorRate: number | null;
    returningVisitorRate: number | null;
    unsupportedFilters: string[];
    trend: NewReturningTrendBucket[];
};

export type NewReturningDateRange = {
    startDate: Date;
    endDate: Date;
};

export type NewReturningOptions = {
    intervalType: "DAY" | "HOUR";
    timezone: string;
    filters?: SearchFilters;
};

type VisitRow = {
    site_id: string;
    visit_id: string;
    visitor_id: string | null;
    first_seen_at: string;
    entry_path: string | null;
    entry_referrer: string | null;
    country: string | null;
    region: string | null;
    city: string | null;
};

type PageviewRow = {
    site_id: string;
    visit_id: string;
    occurred_at: string;
    path: string | null;
    referrer: string | null;
};

type CoverageRow = {
    coverage_started_at: string | null;
};

const UNSUPPORTED_FILTER_KEYS = [
    "sourceType",
    "deviceType",
    "deviceModel",
    "browserName",
    "browserVersion",
    "osName",
    "browserLanguage",
    "screenResolution",
    "botTraffic",
    "utmSource",
    "utmMedium",
    "utmCampaign",
    "utmTerm",
    "utmContent",
] as const;

function normalizeVisitorId(visitorId: string | null | undefined) {
    const normalized = visitorId?.trim();
    return normalized || null;
}

function isWithinRange(value: string, range: NewReturningDateRange) {
    return (
        value >= range.startDate.toISOString() &&
        value < range.endDate.toISOString()
    );
}

function getUnsupportedFilters(filters: SearchFilters) {
    return UNSUPPORTED_FILTER_KEYS.filter((key) => {
        const value = filters[key];
        return value !== undefined && value !== "";
    });
}

function visitMatchesDirectFilters(visit: VisitRow, filters: SearchFilters) {
    if (filters.country !== undefined && (visit.country || "") !== filters.country) {
        return false;
    }
    if (filters.region !== undefined && (visit.region || "") !== filters.region) {
        return false;
    }
    if (filters.city !== undefined && (visit.city || "") !== filters.city) {
        return false;
    }
    return true;
}

function visitMatchesPathOrReferrer(
    visit: VisitRow,
    pageviewsByVisit: Map<string, PageviewRow[]>,
    range: NewReturningDateRange,
    filters: SearchFilters,
) {
    const pageviews = pageviewsByVisit.get(visit.visit_id) || [];

    if (filters.path !== undefined) {
        const path = filters.path;
        const entryMatches = (visit.entry_path || "") === path;
        const pageviewMatches = pageviews.some(
            (pageview) =>
                isWithinRange(pageview.occurred_at, range) &&
                (pageview.path || "") === path,
        );
        if (!entryMatches && !pageviewMatches) return false;
    }

    if (filters.referrer !== undefined) {
        const referrer = filters.referrer;
        const entryMatches = (visit.entry_referrer || "") === referrer;
        const pageviewMatches = pageviews.some(
            (pageview) =>
                isWithinRange(pageview.occurred_at, range) &&
                (pageview.referrer || "") === referrer,
        );
        if (!entryMatches && !pageviewMatches) return false;
    }

    return true;
}

function buildPageviewsByVisit(pageviews: PageviewRow[]) {
    const byVisit = new Map<string, PageviewRow[]>();
    for (const pageview of pageviews) {
        const rows = byVisit.get(pageview.visit_id) || [];
        rows.push(pageview);
        byVisit.set(pageview.visit_id, rows);
    }
    return byVisit;
}

function bucketKeyFor(dateIso: string, intervalType: "DAY" | "HOUR", tz: string) {
    const unit = intervalType === "DAY" ? "day" : "hour";
    return dayjs(dateIso).tz(tz).startOf(unit).toDate().toISOString();
}

function buildEmptyTrend(
    range: NewReturningDateRange,
    intervalType: "DAY" | "HOUR",
    tz: string,
) {
    const unit = intervalType === "DAY" ? "day" : "hour";
    const trend: NewReturningTrendBucket[] = [];
    let cursor = dayjs(range.startDate).tz(tz).startOf(unit);
    const end = dayjs(range.endDate).tz(tz);

    while (cursor.isBefore(end)) {
        trend.push({
            bucket: cursor.toDate().toISOString(),
            newVisitors: 0,
            returningVisitors: 0,
        });
        cursor = cursor.add(1, unit);
    }

    return trend;
}

function calculateRate(value: number, denominator: number) {
    return denominator > 0 ? value / denominator : null;
}

export async function getNewReturningSummary(
    db: D1Database,
    siteId: string,
    range: NewReturningDateRange,
    options: NewReturningOptions,
): Promise<NewReturningSummary> {
    const filters = options.filters || {};
    const unsupportedFilters = getUnsupportedFilters(filters);

    const coverage = await db
        .prepare(
            `SELECT MIN(first_seen_at) AS coverage_started_at
             FROM visits
             WHERE site_id = ?`,
        )
        .bind(siteId)
        .first<CoverageRow>();

    const visitsResult = await db
        .prepare(
            `SELECT site_id, visit_id, visitor_id, first_seen_at,
                    entry_path, entry_referrer, country, region, city
             FROM visits
             WHERE site_id = ?`,
        )
        .bind(siteId)
        .all<VisitRow>();

    const pageviewsResult =
        filters.path !== undefined || filters.referrer !== undefined
            ? await db
                  .prepare(
                      `SELECT site_id, visit_id, occurred_at, path, referrer
                       FROM pageviews
                       WHERE site_id = ?
                         AND occurred_at >= ?
                         AND occurred_at < ?`,
                  )
                  .bind(
                      siteId,
                      range.startDate.toISOString(),
                      range.endDate.toISOString(),
                  )
                  .all<PageviewRow>()
            : { results: [] as PageviewRow[] };

    const allVisits = visitsResult.results ?? [];
    const pageviewsByVisit = buildPageviewsByVisit(pageviewsResult.results ?? []);
    const firstVisitByVisitor = new Map<string, string>();

    for (const visit of allVisits) {
        const visitorId = normalizeVisitorId(visit.visitor_id);
        if (!visitorId) continue;
        const current = firstVisitByVisitor.get(visitorId);
        if (!current || visit.first_seen_at < current) {
            firstVisitByVisitor.set(visitorId, visit.first_seen_at);
        }
    }

    const windowVisits = allVisits.filter(
        (visit) =>
            isWithinRange(visit.first_seen_at, range) &&
            visitMatchesDirectFilters(visit, filters) &&
            visitMatchesPathOrReferrer(visit, pageviewsByVisit, range, filters),
    );

    const unclassifiedVisitIds = new Set<string>();
    const classifiedVisitors = new Map<string, VisitorKind>();

    for (const visit of windowVisits) {
        const visitorId = normalizeVisitorId(visit.visitor_id);
        if (!visitorId) {
            unclassifiedVisitIds.add(visit.visit_id);
            continue;
        }
        if (classifiedVisitors.has(visitorId)) continue;

        const firstVisitAt = firstVisitByVisitor.get(visitorId);
        classifiedVisitors.set(
            visitorId,
            firstVisitAt && firstVisitAt < range.startDate.toISOString()
                ? "returning"
                : "new",
        );
    }

    let newVisitors = 0;
    let returningVisitors = 0;
    for (const kind of classifiedVisitors.values()) {
        if (kind === "new") newVisitors += 1;
        else returningVisitors += 1;
    }

    const trend = buildEmptyTrend(
        range,
        options.intervalType,
        options.timezone,
    );
    const trendByBucket = new Map(trend.map((bucket) => [bucket.bucket, bucket]));
    const seenByBucket = new Map<string, Set<string>>();

    for (const visit of windowVisits) {
        const visitorId = normalizeVisitorId(visit.visitor_id);
        if (!visitorId) continue;
        const kind = classifiedVisitors.get(visitorId);
        if (!kind) continue;

        const bucket = bucketKeyFor(
            visit.first_seen_at,
            options.intervalType,
            options.timezone,
        );
        const seenKey = `${bucket}\u0000${kind}`;
        const seen = seenByBucket.get(seenKey) || new Set<string>();
        if (seen.has(visitorId)) continue;
        seen.add(visitorId);
        seenByBucket.set(seenKey, seen);

        const trendBucket = trendByBucket.get(bucket);
        if (!trendBucket) continue;
        if (kind === "new") trendBucket.newVisitors += 1;
        else trendBucket.returningVisitors += 1;
    }

    const classifiedCount = newVisitors + returningVisitors;

    return {
        available: true,
        reason: null,
        coverageStartedAt: coverage?.coverage_started_at ?? null,
        classifiedVisitors: classifiedCount,
        newVisitors,
        returningVisitors,
        unclassifiedVisitors: unclassifiedVisitIds.size,
        newVisitorRate: calculateRate(newVisitors, classifiedCount),
        returningVisitorRate: calculateRate(returningVisitors, classifiedCount),
        unsupportedFilters,
        trend,
    };
}

export function unavailableNewReturningSummary(): NewReturningSummary {
    return {
        available: false,
        reason: "db-unavailable",
        coverageStartedAt: null,
        classifiedVisitors: 0,
        newVisitors: 0,
        returningVisitors: 0,
        unclassifiedVisitors: 0,
        newVisitorRate: null,
        returningVisitorRate: null,
        unsupportedFilters: [],
        trend: [],
    };
}
