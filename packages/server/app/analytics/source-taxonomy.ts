export const TRAFFIC_SOURCE_TYPES = [
    "ads",
    "campaign",
    "search",
    "social",
    "external",
    "direct",
    "other",
] as const;

export type TrafficSourceType = (typeof TRAFFIC_SOURCE_TYPES)[number];

export const TRAFFIC_SOURCE_LABELS: Record<TrafficSourceType, string> = {
    ads: "广告",
    campaign: "活动",
    search: "搜索引擎",
    social: "社交媒体",
    external: "外部链接",
    direct: "直接访问",
    other: "其他",
};

export interface TrafficSourceInput {
    referrer?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    utmTerm?: string | null;
    utmContent?: string | null;
}

/** Named search engines for detail reports. */
export type SearchEngineId =
    | "baidu"
    | "google"
    | "bing"
    | "sogou"
    | "so"
    | "sm"
    | "yahoo"
    | "yandex"
    | "duckduckgo"
    | "other-search"
    | "not-search";

export const SEARCH_ENGINE_LABELS: Record<SearchEngineId, string> = {
    baidu: "百度",
    google: "Google",
    bing: "Bing",
    sogou: "搜狗",
    so: "360搜索",
    sm: "神马",
    yahoo: "Yahoo",
    yandex: "Yandex",
    duckduckgo: "DuckDuckGo",
    "other-search": "其他搜索",
    "not-search": "非搜索",
};

/** Display when query param is absent (HTTPS referrer privacy). */
export const SEARCH_TERM_NOT_PROVIDED = "(not provided)";

const PAID_UTM_MEDIA = new Set([
    "ad",
    "ads",
    "affiliate",
    "banner",
    "cpa",
    "cpc",
    "cpm",
    "cpv",
    "display",
    "paid",
    "paid_search",
    "paidsearch",
    "ppc",
    "sem",
]);

const SEARCH_ENGINE_DOMAINS = [
    "baidu.com",
    "bing.com",
    "duckduckgo.com",
    "google.",
    "sm.cn",
    "so.com",
    "sogou.com",
    "yahoo.",
    "yandex.",
];

const SOCIAL_DOMAINS = [
    "bilibili.com",
    "douyin.com",
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "mp.weixin.qq.com",
    "reddit.com",
    "tiktok.com",
    "twitter.com",
    "weibo.com",
    "weixin.qq.com",
    "x.com",
    "xiaohongshu.com",
    "zhihu.com",
];

/** Domain suffix → engine id (order matters: more specific first). */
const SEARCH_ENGINE_HOST_RULES: Array<{
    match: string;
    id: Exclude<SearchEngineId, "not-search" | "other-search">;
}> = [
    { match: "baidu.com", id: "baidu" },
    { match: "bing.com", id: "bing" },
    { match: "duckduckgo.com", id: "duckduckgo" },
    { match: "sogou.com", id: "sogou" },
    { match: "so.com", id: "so" },
    { match: "sm.cn", id: "sm" },
    { match: "google.", id: "google" },
    { match: "yahoo.", id: "yahoo" },
    { match: "yandex.", id: "yandex" },
];

/** Query param names commonly used for the search keyword. */
const SEARCH_TERM_PARAMS = [
    "q",
    "query",
    "wd",
    "word",
    "keyword",
    "keywords",
    "text",
    "search",
    "p",
    "oq",
];

function normalizeValue(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : "";
}

function hasUtm(input: TrafficSourceInput) {
    return [
        input.utmSource,
        input.utmMedium,
        input.utmCampaign,
        input.utmTerm,
        input.utmContent,
    ].some((value) => normalizeValue(value) !== "");
}

function normalizeHostname(hostname: string) {
    return hostname.toLowerCase().replace(/^www\./, "");
}

function hostMatchesDomain(hostname: string, domain: string) {
    if (domain.endsWith(".")) {
        const label = domain.slice(0, -1);
        return hostname.startsWith(`${label}.`) || hostname.includes(`.${label}.`);
    }

    return hostname === domain || hostname.endsWith(`.${domain}`);
}

function hostMatchesAny(hostname: string, domains: string[]) {
    return domains.some((domain) => hostMatchesDomain(hostname, domain));
}

export function classifyTrafficSource(
    input: TrafficSourceInput,
): TrafficSourceType {
    if (hasUtm(input)) {
        const medium = normalizeValue(input.utmMedium).toLowerCase();
        return PAID_UTM_MEDIA.has(medium) ? "ads" : "campaign";
    }

    const referrer = normalizeValue(input.referrer);
    if (!referrer) {
        return "direct";
    }

    let hostname: string;
    try {
        hostname = normalizeHostname(new URL(referrer).hostname);
    } catch {
        return "other";
    }

    if (hostMatchesAny(hostname, SEARCH_ENGINE_DOMAINS)) {
        return "search";
    }

    if (hostMatchesAny(hostname, SOCIAL_DOMAINS)) {
        return "social";
    }

    return "external";
}

/**
 * Identify which search engine a referrer belongs to.
 * Non-search referrers return "not-search".
 */
export function identifySearchEngine(
    referrer?: string | null,
): SearchEngineId {
    const raw = normalizeValue(referrer);
    if (!raw) return "not-search";

    let hostname: string;
    try {
        hostname = normalizeHostname(new URL(raw).hostname);
    } catch {
        return "not-search";
    }

    for (const rule of SEARCH_ENGINE_HOST_RULES) {
        if (hostMatchesDomain(hostname, rule.match)) {
            return rule.id;
        }
    }

    if (hostMatchesAny(hostname, SEARCH_ENGINE_DOMAINS)) {
        return "other-search";
    }

    return "not-search";
}

/**
 * Extract a search keyword when the referrer URL still includes it.
 * HTTPS privacy often strips q= → returns SEARCH_TERM_NOT_PROVIDED.
 * Falls back to utm_term when present.
 */
export function extractSearchTerm(input: TrafficSourceInput): string {
    const utmTerm = normalizeValue(input.utmTerm);
    const referrer = normalizeValue(input.referrer);

    if (referrer) {
        try {
            const url = new URL(referrer);
            const engine = identifySearchEngine(referrer);
            if (engine !== "not-search") {
                for (const key of SEARCH_TERM_PARAMS) {
                    const v = url.searchParams.get(key);
                    if (v && v.trim()) {
                        try {
                            return decodeURIComponent(v.replace(/\+/g, " ")).trim();
                        } catch {
                            return v.trim();
                        }
                    }
                }
                if (utmTerm) return utmTerm;
                return SEARCH_TERM_NOT_PROVIDED;
            }
        } catch {
            // fall through
        }
    }

    if (utmTerm) return utmTerm;
    return SEARCH_TERM_NOT_PROVIDED;
}
