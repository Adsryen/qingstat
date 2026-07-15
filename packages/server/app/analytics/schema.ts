/**
 * This maps logical column names to the actual column names in the data store.
 *
 * AE limits: up to 20 blobs + 20 doubles per datapoint.
 * https://developers.cloudflare.com/analytics/analytics-engine/limits/
 */

export type ColumnMappingToType<
    T extends (typeof ColumnMappings)[keyof typeof ColumnMappings],
> = T extends `blob${number}`
    ? string
    : T extends `double${number}`
      ? number
      : never;

export const ColumnMappings = {
    /**
     * blobs
     */
    host: "blob1",
    userAgent: "blob2",
    path: "blob3",
    country: "blob4",
    referrer: "blob5",
    browserName: "blob6",
    deviceModel: "blob7",
    siteId: "blob8",
    browserVersion: "blob9",
    deviceType: "blob10",
    utmSource: "blob11",
    utmMedium: "blob12",
    utmCampaign: "blob13",
    utmTerm: "blob14",
    utmContent: "blob15",
    /** Subdivision / province / state (from request.cf.region) */
    region: "blob16",
    /** City name (from request.cf.city) */
    city: "blob17",
    /** ISO-3166-2 region code when available (request.cf.regionCode) */
    regionCode: "blob18",
    /** OS name from parsed User-Agent (e.g. Windows, Android) */
    osName: "blob19",
    /** Primary browser language from Accept-Language (e.g. en, zh) */
    browserLanguage: "blob20",

    /**
     * doubles
     */

    // this record is a new visitor (every 24h)
    newVisitor: "double1",

    // this record is a new session (resets after 30m inactivity)
    newSession: "double2",

    // this record is the bounce value
    bounce: "double3",

    // approximate latitude / longitude from Cloudflare edge geolocation
    // (city-level; raw IP is intentionally not stored)
    latitude: "double4",
    longitude: "double5",

    // bucketed screen dimensions (CSS px); 0 means unknown / not provided
    screenWidth: "double6",
    screenHeight: "double7",
} as const;
