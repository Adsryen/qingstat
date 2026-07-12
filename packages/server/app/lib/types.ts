export interface SearchFilters {
    path?: string;
    referrer?: string;
    deviceModel?: string;
    deviceType?: string;
    country?: string;
    region?: string;
    city?: string;
    browserName?: string;
    browserVersion?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
}

export interface User {
    authenticated: boolean;
}
