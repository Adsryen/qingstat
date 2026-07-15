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
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
}

export interface User {
    authenticated: boolean;
}
