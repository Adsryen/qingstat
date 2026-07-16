/**
 * Conversion attribution (last-touch on conversion hit).
 *
 * Model is fixed — no first/linear/position, no session campaign state.
 * Window = report interval only (not a separate lookback config).
 * Direct = no UTM and empty referrer on the conversion hit itself.
 */

import {
    classifyTrafficSource,
    TRAFFIC_SOURCE_LABELS,
    type TrafficSourceType,
} from "~/analytics/source-taxonomy";
import {
    eventMatchesGoal,
    eventNameFromPath,
    pathMatchesGoal,
    type Goal,
} from "~/lib/goals";

/** Fixed model id for UI + API notes. */
export const ATTRIBUTION_MODEL = "last-touch-conversion-hit" as const;

/** Window is always the report interval (not a separate lookback). */
export const ATTRIBUTION_WINDOW = "report-interval" as const;

/**
 * Direct policy for last-touch conversion-hit model:
 * empty UTM + empty referrer on the conversion hit → direct.
 * Invalid referrer URL is classified as "other" by source taxonomy.
 * No session overwrite — Direct never "covers" an earlier non-direct source
 * because we do not store session campaign state.
 */
export const ATTRIBUTION_DIRECT_POLICY =
    "empty-utm-and-empty-referrer-on-conversion-hit" as const;

export const ATTRIBUTION_MODEL_NOTE =
    "Attribution model: last-touch on the conversion hit (dimensions on the AE row that matches the goal). Window = report interval. Direct = no UTM and no referrer on that hit. No first-touch / linear / session campaign overwrite.";

export type AttributionDimension =
    | "sourceType"
    | "referrer"
    | "utmSource"
    | "deviceType"
    | "country"
    | "path";

export const ATTRIBUTION_DIMENSIONS: AttributionDimension[] = [
    "sourceType",
    "referrer",
    "utmSource",
    "deviceType",
    "country",
    "path",
];

export const ATTRIBUTION_DIMENSION_LABELS: Record<AttributionDimension, string> =
    {
        sourceType: "Source type",
        referrer: "Referrer",
        utmSource: "UTM Source",
        deviceType: "Device",
        country: "Country",
        path: "Path",
    };

export type AttributionRawHit = {
    path: string;
    referrer: string;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    utmTerm: string;
    utmContent: string;
    deviceType: string;
    country: string;
    count: number;
};

export type AttributionRow = {
    key: string;
    completions: number;
};

export const DIRECT_LABEL = "(direct)";
export const UNKNOWN_LABEL = "(unknown)";

/** Default UI top-N per dimension. */
export const ATTRIBUTION_UI_TOP_N = 10;

export function isAttributionDimension(
    value: string | null | undefined,
): value is AttributionDimension {
    return (
        value === "sourceType" ||
        value === "referrer" ||
        value === "utmSource" ||
        value === "deviceType" ||
        value === "country" ||
        value === "path"
    );
}

export function hitMatchesGoal(goal: Goal, hit: AttributionRawHit): boolean {
    if (goal.goalType === "url") {
        return pathMatchesGoal(hit.path, goal.matchValue, goal.matchMode);
    }
    const eventName = eventNameFromPath(hit.path) ?? hit.path;
    return eventMatchesGoal(eventName, goal.matchValue);
}

/**
 * Custom events store props JSON in utmContent (blob15). That must not
 * participate in UTM / source classification or every event looks like a campaign.
 */
function isEventHit(hit: AttributionRawHit): boolean {
    return (hit.path || "").startsWith("/__event__/");
}

function utmFieldsForClassification(hit: AttributionRawHit) {
    const ignoreContent = isEventHit(hit);
    return {
        utmSource: hit.utmSource,
        utmMedium: hit.utmMedium,
        utmCampaign: hit.utmCampaign,
        utmTerm: hit.utmTerm,
        utmContent: ignoreContent ? "" : hit.utmContent,
    };
}

function hasAnyUtm(hit: AttributionRawHit): boolean {
    const utm = utmFieldsForClassification(hit);
    return Boolean(
        (utm.utmSource || "").trim() ||
            (utm.utmMedium || "").trim() ||
            (utm.utmCampaign || "").trim() ||
            (utm.utmTerm || "").trim() ||
            (utm.utmContent || "").trim(),
    );
}

/**
 * Label for a raw dimension value.
 * - referrer empty → (direct)
 * - other empty dims → (unknown)
 * - sourceType uses classifyTrafficSource labels
 */
export function dimensionKeyForHit(
    hit: AttributionRawHit,
    dimension: AttributionDimension,
): string {
    switch (dimension) {
        case "sourceType": {
            const utm = utmFieldsForClassification(hit);
            const type: TrafficSourceType = classifyTrafficSource({
                referrer: hit.referrer,
                ...utm,
            });
            return TRAFFIC_SOURCE_LABELS[type] ?? type;
        }
        case "referrer": {
            const r = (hit.referrer || "").trim();
            if (!r) {
                // Align with Direct policy: empty referrer (+ no UTM in practice)
                // displays as (direct). Invalid non-empty URLs stay as raw value;
                // sourceType path maps them to "other".
                return DIRECT_LABEL;
            }
            return r;
        }
        case "utmSource": {
            const v = (hit.utmSource || "").trim();
            if (!v) {
                // No UTM source + no referrer → direct; else unknown source
                if (!hasAnyUtm(hit) && !(hit.referrer || "").trim()) {
                    return DIRECT_LABEL;
                }
                return UNKNOWN_LABEL;
            }
            return v;
        }
        case "deviceType": {
            const v = (hit.deviceType || "").trim();
            return v || UNKNOWN_LABEL;
        }
        case "country": {
            const v = (hit.country || "").trim();
            return v || UNKNOWN_LABEL;
        }
        case "path": {
            const v = (hit.path || "").trim();
            return v || UNKNOWN_LABEL;
        }
        default:
            return UNKNOWN_LABEL;
    }
}

/**
 * Aggregate matching hits by dimension key.
 * Returns rows sorted by completions desc.
 */
export function attributeGoalHits(
    goal: Goal,
    hits: AttributionRawHit[],
    dimension: AttributionDimension,
    topN?: number,
): AttributionRow[] {
    const map = new Map<string, number>();
    for (const hit of hits) {
        if (!hitMatchesGoal(goal, hit)) continue;
        const key = dimensionKeyForHit(hit, dimension);
        const count = Number(hit.count) || 0;
        map.set(key, (map.get(key) ?? 0) + count);
    }
    let rows = Array.from(map.entries())
        .map(([key, completions]) => ({ key, completions }))
        .sort((a, b) => b.completions - a.completions || a.key.localeCompare(b.key));
    if (typeof topN === "number" && topN > 0) {
        rows = rows.slice(0, topN);
    }
    return rows;
}

export function sumCompletions(rows: AttributionRow[]): number {
    return rows.reduce((acc, row) => acc + (Number(row.completions) || 0), 0);
}

/**
 * Convert attribution raw hits into [path, count][] for computeGoalCompletions.
 */
export function hitsToPathCounts(
    hits: AttributionRawHit[],
): [string, number][] {
    const map = new Map<string, number>();
    for (const hit of hits) {
        const path = hit.path || "";
        map.set(path, (map.get(path) ?? 0) + (Number(hit.count) || 0));
    }
    return Array.from(map.entries());
}
