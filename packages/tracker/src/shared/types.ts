export type IdentityScope = "persistent" | "mixed" | "page";

export type IdentityRequestParams = {
    visitorId: string;
    visitId: string;
    tabId: string;
    identityScope: IdentityScope;
    clientTime: number;
};

export type CollectRequestParams = {
    p: string; // path
    h: string; // host
    r: string; // referrer
    sid: string; // siteId
    ht?: string; // hit type
    sw?: string; // screen width (CSS px)
    sh?: string; // screen height (CSS px)
    /** TTFB ms (sampled, bucketed on server) */
    ttfb?: string;
    /** Load timing ms (sampled) */
    lcp?: string;
    /** 1 when this is a JS error sample */
    err?: string;
    /** sanitized error message */
    em?: string;
    /** sanitized error source path */
    es?: string;
    /** custom event name (trackEvent) */
    en?: string;
    /** custom event props JSON */
    ep?: string;
    [key: string]: string | undefined; // Allow additional string properties
} & UtmParams;

export type UtmParams = {
    us?: string; // utm_source
    um?: string; // utm_medium
    uc?: string; // utm_campaign
    ut?: string; // utm_term
    uco?: string; // utm_content
};

export type HostnameAndPath = {
    hostname: string;
    path: string;
};

export type BaseClientConfig = {
    siteId: string;
    reporterUrl: string;
    reportOnLocalhost?: boolean;
};

export type CacheResponse = {
    ht: number; // Number of hits in the current session (hit type)
};
