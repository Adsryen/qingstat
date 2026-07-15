import type { TrafficSourceType } from "~/analytics/source-taxonomy";

export interface SearchFilters {
    path?: string;
    referrer?: string;
    sourceType?: TrafficSourceType;
    deviceModel?: string;
    deviceType?: string;
    country?: string;
    region?: string;
    city?: string;
    browserName?: string;
    browserVersion?: string;
    osName?: string;
    browserLanguage?: string;
    /** Combined "WxH" label, e.g. "1920x1080"; parsed to double6/double7 equality. */
    screenResolution?: string;
    /**
     * Bot traffic visibility.
     * - omitted / "exclude": hide bots (default for dashboard)
     * - "include": all traffic
     * - "only": bot traffic only
     */
    botTraffic?: "exclude" | "include" | "only";
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
}

export interface User {
    authenticated: boolean;
}
