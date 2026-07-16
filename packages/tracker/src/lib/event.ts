import type { Client } from "./client";
import { makeRequest } from "./request";
import { buildCollectRequestParams } from "../shared/request";
import {
    sanitizeTrackEvent,
    type TrackEventInput,
} from "../shared/event";
import { getHostnameAndPath, isLocalhostAddress } from "../shared/utils";

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

    const { hostname, path } = getHostnameAndPath(
        window.location.pathname + window.location.search || "/",
        true,
    );
    const identityContext = client.identity.getContext();

    const params = buildCollectRequestParams(
        client.siteId,
        hostname,
        path,
        "",
        {},
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
