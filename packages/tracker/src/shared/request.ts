import type {
    CollectRequestParams,
    IdentityRequestParams,
    UtmParams,
} from "./types";
import { queryParamStringify } from "./utils";

export type ScreenSizeParams = {
    width?: number;
    height?: number;
};

export type PerfSampleParams = {
    ttfbMs?: number;
    lcpMs?: number;
};

export type ErrorSampleParams = {
    message?: string;
    source?: string;
};

export type CustomEventParams = {
    name: string;
    propsJson?: string;
};

export function buildCollectRequestParams(
    siteId: string,
    hostname: string,
    path: string,
    referrer: string,
    utmParams: UtmParams = {},
    hitType?: string,
    identity?: IdentityRequestParams,
    clientPageviewId?: string,
    screenSize?: ScreenSizeParams,
    perfSample?: PerfSampleParams,
    errorSample?: ErrorSampleParams,
    customEvent?: CustomEventParams,
): CollectRequestParams {
    const params: CollectRequestParams = {
        p: path,
        h: hostname,
        r: referrer,
        sid: siteId,
    };

    if (hitType) {
        params.ht = hitType;
    }

    if (identity) {
        params.cid = identity.visitorId;
        params.vid = identity.visitId;
        params.tid = identity.tabId;
        params.isc = identity.identityScope;
        params.ct = identity.clientTime.toString();
    }

    if (clientPageviewId) {
        params.pid = clientPageviewId;
    }

    if (
        screenSize &&
        typeof screenSize.width === "number" &&
        Number.isFinite(screenSize.width) &&
        screenSize.width > 0
    ) {
        params.sw = String(Math.round(screenSize.width));
    }

    if (
        screenSize &&
        typeof screenSize.height === "number" &&
        Number.isFinite(screenSize.height) &&
        screenSize.height > 0
    ) {
        params.sh = String(Math.round(screenSize.height));
    }

    if (perfSample) {
        if (
            typeof perfSample.ttfbMs === "number" &&
            Number.isFinite(perfSample.ttfbMs) &&
            perfSample.ttfbMs > 0
        ) {
            params.ttfb = String(Math.round(perfSample.ttfbMs));
        }
        if (
            typeof perfSample.lcpMs === "number" &&
            Number.isFinite(perfSample.lcpMs) &&
            perfSample.lcpMs > 0
        ) {
            params.lcp = String(Math.round(perfSample.lcpMs));
        }
    }

    if (errorSample) {
        params.err = "1";
        if (errorSample.message) params.em = errorSample.message;
        if (errorSample.source) params.es = errorSample.source;
    }

    if (customEvent) {
        params.en = customEvent.name;
        if (customEvent.propsJson) params.ep = customEvent.propsJson;
    }

    Object.assign(params, utmParams);

    return params;
}

export function buildCollectUrl(
    baseUrl: string,
    params: CollectRequestParams,
    filterEmpty = false,
): string {
    return baseUrl + queryParamStringify(params, filterEmpty);
}
