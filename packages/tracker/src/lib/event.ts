import type { Client } from "./client";
import { makeRequest } from "./request";
import { buildCollectRequestParams } from "../shared/request";
import {
    sanitizeTrackEvent,
    type TrackEventInput,
} from "../shared/event";
import {
    getHostnameAndPath,
    getUtmParamsFromBrowserUrl,
    isLocalhostAddress,
} from "../shared/utils";

export type { TrackEventInput };

export async function trackEvent(client: Client, input: TrackEventInput) {
    const sanitized = sanitizeTrackEvent(input);
    if (!sanitized.ok) {
        throw new Error(sanitized.error);
    }

    if (
        !client.reportOnLocalhost &&
        isLocalhostAddress(window.location.hostname)
    ) {
        return;
    }

    if (window.location.host === "" && navigator.userAgent.indexOf("Electron") < 0) {
        return;
    }

    const browserUrl =
        window.location.pathname + window.location.search || "/";
    const { hostname, path } = getHostnameAndPath(browserUrl, true);
    const identityContext = client.identity.getContext();
    // Pass current-page UTM so event goals can attribute to campaign when
    // the conversion fires on a UTM landing/deep page. Referrer stays empty
    // (collect clears it for events to avoid noise / props collision).
    const utmParams = getUtmParamsFromBrowserUrl(browserUrl);

    const params = buildCollectRequestParams(
        client.siteId,
        hostname,
        path,
        "",
        utmParams,
        undefined,
        identityContext,
        undefined,
        undefined,
        undefined,
        undefined,
        {
            name: sanitized.event.name,
            propsJson: sanitized.event.propsJson,
        },
    );

    makeRequest(client.reporterUrl, params);
}
