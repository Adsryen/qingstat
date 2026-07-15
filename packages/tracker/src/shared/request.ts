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
