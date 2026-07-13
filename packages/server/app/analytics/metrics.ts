export const CORE_METRIC_CODES = [
    "pageViews",
    "visitors",
    "visits",
    "uniqueIps",
    "onlineVisits",
    "activeVisits5m",
    "activeVisits30m",
] as const;

export type MetricCode = (typeof CORE_METRIC_CODES)[number];

export type MetricSource = "ae" | "d1" | "presence" | "r2" | "legacy";

export type MetricExactness = "exact" | "estimated" | "legacy";

export type IdentityScope = "persistent" | "mixed" | "page";

export interface MetricCoverage {
    source: MetricSource;
    exactness: MetricExactness;
    coverageStartedAt: string | null;
    coverageEndedAt: string | null;
    sampled: boolean;
    identityScope?: IdentityScope;
}

export interface MetricDefinition {
    code: MetricCode;
    label: {
        zh: string;
        en: string;
    };
    definition: string;
    numerator: string;
    denominator: string | null;
    dedupeKey: string;
    timeBoundary: string;
    timezone: "site" | "request" | "utc";
    primarySource: Extract<MetricSource, "ae" | "d1" | "presence">;
    refreshCadence: string;
    window: string;
    emptyValue: 0 | null;
    coverage: MetricCoverage;
    uiDisclosure: string;
    legacyAeColumn?: never;
}

export interface LegacyMetricDefinition {
    code: "legacyDailyVisitors" | "legacyNewSessionColumn";
    label: {
        zh: string;
        en: string;
    };
    aeColumn: "newVisitor" | "newSession";
    replacement: MetricCode | null;
    coverage: MetricCoverage;
    warning: string;
}

export type MetricUnavailableReason =
    | "ip-not-recorded"
    | "detail-expired"
    | "not-covered-yet";

export type MetricAvailability =
    | {
          available: true;
          reason: null;
      }
    | {
          available: false;
          reason: MetricUnavailableReason;
      };

export interface MetricAvailabilityOptions {
    recordIp: boolean;
    detailExpired?: boolean;
    covered?: boolean;
}

function metricCoverage(
    source: MetricCoverage["source"],
    exactness: MetricCoverage["exactness"],
    identityScope?: IdentityScope,
): MetricCoverage {
    return {
        source,
        exactness,
        coverageStartedAt: null,
        coverageEndedAt: null,
        sampled: false,
        ...(identityScope ? { identityScope } : {}),
    };
}

export const METRIC_DEFINITIONS: MetricDefinition[] = [
    {
        code: "pageViews",
        label: { zh: "????PV?", en: "Page views" },
        definition: "????????? SPA ????? 1?",
        numerator: "?? pageview ???",
        denominator: null,
        dedupeKey: "pageview",
        timeBoundary: "??????????????",
        timezone: "site",
        primarySource: "ae",
        refreshCadence: "AE ??????????? Cloudflare ?????",
        window: "selected-range",
        emptyValue: 0,
        coverage: metricCoverage("ae", "estimated", "page"),
        uiDisclosure: "AE ??????? _sample_interval ??????",
    },
    {
        code: "visitors",
        label: { zh: "????UV?", en: "Visitors" },
        definition: "???????? visitor_id ?????????",
        numerator: "?? visitor_id ?",
        denominator: null,
        dedupeKey: "visitor_id",
        timeBoundary: "visitor_id ??? visit ????????????",
        timezone: "site",
        primarySource: "d1",
        refreshCadence: "? visit/pageview ???????",
        window: "selected-range",
        emptyValue: 0,
        coverage: metricCoverage("d1", "exact", "persistent"),
        uiDisclosure: "?????????????? UV?? newVisitor ? legacy ???",
    },
    {
        code: "visits",
        label: { zh: "????", en: "Visits" },
        definition: "30 ????????? visit_id??????????????????????",
        numerator: "?? visit_id ?",
        denominator: null,
        dedupeKey: "visit_id",
        timeBoundary: "visit started_at ? last_seen_at ???????????",
        timezone: "site",
        primarySource: "d1",
        refreshCadence: "? visit/pageview ???????",
        window: "30m-inactivity-session",
        emptyValue: 0,
        coverage: metricCoverage("d1", "exact", "persistent"),
        uiDisclosure: "????? visit?UI ?????/??????? session_id?",
    },
    {
        code: "uniqueIps",
        label: { zh: "IP ?", en: "Unique IPs" },
        definition: "????????????? IP ???? ip_hmac ???",
        numerator: "?? ip_hmac ?",
        denominator: null,
        dedupeKey: "ip_hmac",
        timeBoundary: "visit/ip ??????????????",
        timezone: "site",
        primarySource: "d1",
        refreshCadence: "???? IP ??????????????",
        window: "selected-range",
        emptyValue: null,
        coverage: metricCoverage("d1", "exact", "persistent"),
        uiDisclosure: "record_ip=0 ?????????????? PV/visit/?????",
    },
    {
        code: "onlineVisits",
        label: { zh: "????", en: "Online visits" },
        definition: "Presence ????? 60 ??????? visit_id ????",
        numerator: "Presence ?? visit_id ?",
        denominator: null,
        dedupeKey: "visit_id",
        timeBoundary: "??????? 60 ??????",
        timezone: "request",
        primarySource: "presence",
        refreshCadence: "Presence Durable Object ????????",
        window: "60s-presence-grace",
        emptyValue: 0,
        coverage: metricCoverage("presence", "exact", "persistent"),
        uiDisclosure: "??????? Presence????? 5/30 ???????",
    },
    {
        code: "activeVisits5m",
        label: { zh: "? 5 ????", en: "Active visits in 5 minutes" },
        definition: "?? 5 ????? PV ???? visit_id ????",
        numerator: "last_seen_at ? 5 ???????? visit_id ?",
        denominator: null,
        dedupeKey: "visit_id",
        timeBoundary: "????????? 5 ???",
        timezone: "utc",
        primarySource: "d1",
        refreshCadence: "? visits.last_seen_at ???",
        window: "5m-last-seen",
        emptyValue: 0,
        coverage: metricCoverage("d1", "exact", "persistent"),
        uiDisclosure: "??????????????????",
    },
    {
        code: "activeVisits30m",
        label: { zh: "? 30 ????", en: "Active visits in 30 minutes" },
        definition: "?? 30 ????? PV ???? visit_id ????",
        numerator: "last_seen_at ? 30 ???????? visit_id ?",
        denominator: null,
        dedupeKey: "visit_id",
        timeBoundary: "????????? 30 ???",
        timezone: "utc",
        primarySource: "d1",
        refreshCadence: "? visits.last_seen_at ???",
        window: "30m-last-seen",
        emptyValue: 0,
        coverage: metricCoverage("d1", "exact", "persistent"),
        uiDisclosure: "??????????????????",
    },
];

export const LEGACY_METRIC_DEFINITIONS: LegacyMetricDefinition[] = [
    {
        code: "legacyDailyVisitors",
        label: { zh: "???????", en: "Legacy daily visitors" },
        aeColumn: "newVisitor",
        replacement: "visitors",
        coverage: metricCoverage("legacy", "legacy", "page"),
        warning: "newVisitor ???????/If-Modified-Since ??????????? visitor_id UV?",
    },
    {
        code: "legacyNewSessionColumn",
        label: { zh: "? newSession ??", en: "Legacy newSession column" },
        aeColumn: "newSession",
        replacement: null,
        coverage: metricCoverage("legacy", "legacy"),
        warning: "newSession ??? dead column???????????",
    },
];

export function getMetricDefinition(code: MetricCode): MetricDefinition {
    const definition = METRIC_DEFINITIONS.find((metric) => metric.code === code);
    if (!definition) {
        throw new Error(`Unknown metric code: ${code}`);
    }
    return definition;
}

export function getMetricValueAvailability(
    code: MetricCode,
    options: MetricAvailabilityOptions,
): MetricAvailability {
    if (options.covered === false) {
        return { available: false, reason: "not-covered-yet" };
    }

    if (code === "uniqueIps" && !options.recordIp) {
        return { available: false, reason: "ip-not-recorded" };
    }

    if (code === "uniqueIps" && options.detailExpired) {
        return { available: false, reason: "detail-expired" };
    }

    return { available: true, reason: null };
}

export type AnalyticsNavigationGroupId =
    | "overview"
    | "realtime"
    | "sources"
    | "visitors"
    | "content"
    | "conversions"
    | "management";

export interface AnalyticsNavigationItem {
    id: string;
    label: {
        zh: string;
        en: string;
    };
    taskIds: string[];
}

export interface AnalyticsNavigationGroup {
    id: AnalyticsNavigationGroupId;
    label: {
        zh: string;
        en: string;
    };
    items: AnalyticsNavigationItem[];
}

export const ANALYTICS_NAVIGATION_GROUPS: AnalyticsNavigationGroup[] = [
    {
        id: "overview",
        label: { zh: "??", en: "Overview" },
        items: [
            {
                id: "core-metrics",
                label: { zh: "????", en: "Core metrics" },
                taskIds: [
                    "baidu-p0-metrics-ia",
                    "baidu-p1-overview-ui",
                    "baidu-p1-multisite-summary",
                    "baidu-p1-trend-compare",
                ],
            },
        ],
    },
    {
        id: "realtime",
        label: { zh: "??", en: "Realtime" },
        items: [
            {
                id: "online-and-active",
                label: { zh: "?????", en: "Online and active" },
                taskIds: ["baidu-p1-realtime"],
            },
        ],
    },
    {
        id: "sources",
        label: { zh: "??", en: "Sources" },
        items: [
            {
                id: "source-taxonomy",
                label: { zh: "????", en: "Source taxonomy" },
                taskIds: [
                    "baidu-p1-source-taxonomy",
                    "baidu-p2-search-detail",
                    "baidu-p2-traffic-rules",
                    "baidu-p3-attribution",
                ],
            },
        ],
    },
    {
        id: "visitors",
        label: { zh: "??", en: "Visitors" },
        items: [
            {
                id: "identity-and-ip",
                label: { zh: "??? IP", en: "Identity and IP" },
                taskIds: [
                    "baidu-p0-session-model",
                    "baidu-p0-ip-geo",
                    "baidu-p1-new-return",
                    "baidu-p2-os-lang",
                    "baidu-p2-resolution",
                    "baidu-p2-bot-filter",
                    "baidu-p2-visitor-loyalty",
                    "baidu-p2-client-network",
                ],
            },
        ],
    },
    {
        id: "content",
        label: { zh: "??", en: "Content" },
        items: [
            {
                id: "page-and-paths",
                label: { zh: "?????", en: "Pages and paths" },
                taskIds: [
                    "baidu-p1-duration-depth",
                    "baidu-p1-entry-exit",
                    "baidu-p2-exit-rate",
                    "baidu-p4-path-flow",
                    "baidu-p4-heatmap-spike",
                    "baidu-p2-performance-errors",
                ],
            },
        ],
    },
    {
        id: "conversions",
        label: { zh: "??", en: "Conversions" },
        items: [
            {
                id: "events-and-goals",
                label: { zh: "?????", en: "Events and goals" },
                taskIds: [
                    "baidu-p3-event-sdk",
                    "baidu-p3-goals",
                    "baidu-p3-funnel",
                    "baidu-p3-commerce-spike",
                ],
            },
        ],
    },
    {
        id: "management",
        label: { zh: "??", en: "Management" },
        items: [
            {
                id: "ops-and-governance",
                label: { zh: "?????", en: "Operations and governance" },
                taskIds: [
                    "baidu-p0-ae-schema",
                    "baidu-p2-install-health",
                    "baidu-p4-export-csv",
                    "baidu-p4-alerts",
                    "baidu-p4-open-api",
                    "baidu-p4-rbac",
                    "baidu-p4-data-governance",
                    "baidu-p4-scheduled-reports",
                    "baidu-p4-custom-reports",
                ],
            },
        ],
    },
];
