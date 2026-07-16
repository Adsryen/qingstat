import type { ServerClient } from "./client";
import { makeRequest } from "./request";
import { buildCollectRequestParams } from "../shared/request";
import {
    sanitizeTrackEvent,
    type TrackEventInput,
} from "../shared/event";
import {
    getHostnameAndPath,
    isLocalhostAddress,
} from "../shared/utils";

export type ServerTrackEventOpts = TrackEventInput & {
    url: string;
    hostname?: string;
    referrer?: string;
};

export async function trackEvent(
    client: ServerClient,
    opts: ServerTrackEventOpts,
) {
    const sanitized = sanitizeTrackEvent(opts);
    if (!sanitized.ok) {
        throw new Error(sanitized.error);
    }
    if (!opts.url) {
        throw new Error("url is required for server-side trackEvent");
    }

    let fullUrl: string;
    if (opts.url.startsWith("/")) {
        if (!opts.hostname) {
            throw new Error("hostname is required when tracking relative URLs");
        }
        const protocol =
            opts.hostname.startsWith("localhost") ||
            opts.hostname.includes("127.0.0.1")
                ? "http://"
                : "https://";
        fullUrl = `${protocol}${opts.hostname}${opts.url}`;
    } else {
        fullUrl = opts.url;
    }
    try {
        new URL(fullUrl);
    } catch {
        throw new Error(`Invalid URL: ${opts.url}`);
    }

    if (
        !client.reportOnLocalhost &&
        isLocalhostAddress(new URL(fullUrl).hostname)
    ) {
        return;
    }

    const { hostname, path } = getHostnameAndPath(fullUrl);
    const params = buildCollectRequestParams(
        client.siteId,
        hostname,
        path,
        opts.referrer || "",
        {},
        "1",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        {
            name: sanitized.event.name,
            propsJson: sanitized.event.propsJson,
        },
    );

    await makeRequest(client.reporterUrl, params, client.timeout);
}
