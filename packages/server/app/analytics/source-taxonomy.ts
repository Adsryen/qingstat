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
