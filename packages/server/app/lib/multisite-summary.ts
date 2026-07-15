import type { Site } from "~/lib/sites";

export type MultisiteMetricInput = {
    siteId: string;
    views: number;
    visitors: number;
    bounces: number;
    lastSeenAt: string | null;
};

export type MultisiteSummaryStatus =
    | "active"
    | "stale"
    | "waiting"
    | "disabled"
    | "metrics-unavailable";

export type MultisiteSummaryRow = {
    siteId: string;
    name: string;
    enabled: boolean;
    publicStats: boolean;
    recordIp: boolean;
    ipRetentionDays: number;
    allowedHosts: string | null;
    createdAt: string;
    updatedAt: string;
    inRegistry: boolean;
    views: number | null;
    visitors: number | null;
    bounces: number | null;
    bounceRate: number | null;
    lastSeenAt: string | null;
    status: MultisiteSummaryStatus;
    /** Short repair hint key suffix for i18n (optional). */
    healthHint?: "install" | "check-tracker" | "enable-site" | "metrics" | null;
};

export type BuildMultisiteSummaryInput = {
    registry: Site[];
    metrics: MultisiteMetricInput[];
    metricsUnavailable?: boolean;
    visibleSiteIds?: Set<string>;
    limit?: number;
    /** Clock override for tests. */
    now?: Date;
    /** Days without hits before active → stale. Default 7. */
    staleAfterDays?: number;
};

/** Install-health thresholds (testable, not config UI). */
export const INSTALL_HEALTH = {
    staleAfterDays: 7,
    metricsWindowDays: 90,
} as const;

const AE_ONLY_DEFAULTS = {
    enabled: true,
    publicStats: true,
    recordIp: true,
    ipRetentionDays: 60,
    allowedHosts: null,
    createdAt: "",
    updatedAt: "",
};

function calculateBounceRate(
    bounces: number | null,
    visitors: number | null,
): number | null {
    if (bounces === null || visitors === null || visitors <= 0) {
        return null;
    }
    return bounces / visitors;
}

/**
 * Parse AE lastSeen strings ("YYYY-MM-DD HH:mm:ss" or ISO) to epoch ms.
 * Returns null if unparsable — never fall back to registry updatedAt.
 */
export function parseLastSeenMs(value: string | null | undefined): number | null {
    if (!value) return null;
    const normalized = value.includes("T")
        ? value
        : value.replace(" ", "T") + (value.endsWith("Z") ? "" : "Z");
    const ms = Date.parse(normalized);
    return Number.isFinite(ms) ? ms : null;
}

export function statusFor(input: {
    enabled: boolean;
    metricsUnavailable: boolean;
    views: number | null;
    lastSeenAt: string | null;
    nowMs: number;
    staleAfterDays: number;
}): MultisiteSummaryStatus {
    if (!input.enabled) {
        return "disabled";
    }
    if (input.metricsUnavailable) {
        return "metrics-unavailable";
    }
    const lastMs = parseLastSeenMs(input.lastSeenAt);
    const hasHits = (input.views ?? 0) > 0 || lastMs !== null;
    if (!hasHits) {
        return "waiting";
    }
    if (lastMs !== null) {
        const ageMs = input.nowMs - lastMs;
        if (ageMs > input.staleAfterDays * 24 * 60 * 60 * 1000) {
            return "stale";
        }
    }
    return "active";
}

function healthHintFor(
    status: MultisiteSummaryStatus,
): MultisiteSummaryRow["healthHint"] {
    switch (status) {
        case "waiting":
            return "install";
        case "stale":
            return "check-tracker";
        case "disabled":
            return "enable-site";
        case "metrics-unavailable":
            return "metrics";
        default:
            return null;
    }
}

function statusSort(status: MultisiteSummaryStatus): number {
    switch (status) {
        case "active":
            return 0;
        case "stale":
            return 1;
        case "disabled":
            return 2;
        case "waiting":
            return 3;
        case "metrics-unavailable":
            return 4;
    }
}

export function buildMultisiteSummary({
    registry,
    metrics,
    metricsUnavailable = false,
    visibleSiteIds,
    limit,
    now = new Date(),
    staleAfterDays = INSTALL_HEALTH.staleAfterDays,
}: BuildMultisiteSummaryInput): MultisiteSummaryRow[] {
    const registryById = new Map(registry.map((site) => [site.siteId, site]));
    const metricsById = new Map(
        metrics
            .filter((row) => row.siteId)
            .map((row) => [row.siteId, row] as const),
    );
    const ids = new Set<string>([
        ...registry.map((site) => site.siteId),
        ...metrics.map((row) => row.siteId).filter(Boolean),
    ]);
    const nowMs = now.getTime();

    const rows = Array.from(ids)
        .filter((siteId) => !visibleSiteIds || visibleSiteIds.has(siteId))
        .map((siteId): MultisiteSummaryRow => {
            const site = registryById.get(siteId);
            const metric = metricsById.get(siteId);
            const base = site ?? {
                siteId,
                name: siteId,
                ...AE_ONLY_DEFAULTS,
            };
            const views = metricsUnavailable ? null : (metric?.views ?? 0);
            const visitors = metricsUnavailable ? null : (metric?.visitors ?? 0);
            const bounces = metricsUnavailable ? null : (metric?.bounces ?? 0);
            // lastSeen only from AE metrics — never registry updatedAt
            const lastSeenAt = metricsUnavailable
                ? null
                : (metric?.lastSeenAt ?? null);
            const status = statusFor({
                enabled: base.enabled,
                metricsUnavailable,
                views,
                lastSeenAt,
                nowMs,
                staleAfterDays,
            });

            return {
                siteId,
                name: base.name,
                enabled: base.enabled,
                publicStats: base.publicStats,
                recordIp: base.recordIp,
                ipRetentionDays: base.ipRetentionDays,
                allowedHosts: base.allowedHosts,
                createdAt: base.createdAt,
                updatedAt: base.updatedAt,
                inRegistry: Boolean(site),
                views,
                visitors,
                bounces,
                bounceRate: calculateBounceRate(bounces, visitors),
                lastSeenAt,
                status,
                healthHint: healthHintFor(status),
            };
        });

    rows.sort((a, b) => {
        const aHasData = (a.views ?? 0) > 0;
        const bHasData = (b.views ?? 0) > 0;
        if (aHasData !== bHasData) {
            return aHasData ? -1 : 1;
        }
        if (aHasData && bHasData && a.views !== b.views) {
            return (b.views ?? 0) - (a.views ?? 0);
        }
        const statusDelta = statusSort(a.status) - statusSort(b.status);
        if (statusDelta !== 0) {
            return statusDelta;
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    return typeof limit === "number" ? rows.slice(0, limit) : rows;
}
