import type { Client } from "./client";
import { instrumentHistoryBuiltIns } from "./instrument";
import { makeRequest, checkCacheStatus } from "./request";
import {
    getHostnameAndPath,
    getReferrer,
    getUtmParamsFromBrowserUrl,
    isLocalhostAddress,
} from "../shared/utils";
import { buildCollectRequestParams } from "../shared/request";
import { readNavigationPerf, shouldSamplePerf } from "./performance";
import {
    sanitizeErrorEvent,
    shouldSampleError,
    ERROR_MAX_PER_PAGE,
} from "./errors";

export type TrackPageviewOpts = {
    url?: string;
    referrer?: string;
};

let errorHookInstalled = false;
let errorsReportedThisPage = 0;

function installErrorHooks(client: Client) {
    if (errorHookInstalled || typeof window === "undefined") return;
    errorHookInstalled = true;

    const report = (message: string, source?: string) => {
        if (errorsReportedThisPage >= ERROR_MAX_PER_PAGE) return;
        if (!shouldSampleError()) return;
        errorsReportedThisPage += 1;
        const sanitized = sanitizeErrorEvent({ message, source });
        const identityContext = client.identity.getContext();
        const { hostname, path } = getHostnameAndPath(
            window.location.pathname + window.location.search,
            true,
        );
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
            sanitized,
        );
        try {
            makeRequest(client.reporterUrl, params);
        } catch {
            // swallow
        }
    };

    window.addEventListener("error", (event) => {
        report(
            event.message || String(event.error || "error"),
            event.filename || "",
        );
    });
    window.addEventListener("unhandledrejection", (event) => {
        const reason = event.reason;
        const message =
            reason instanceof Error
                ? reason.message
                : typeof reason === "string"
                  ? reason
                  : "unhandledrejection";
        report(message, "");
    });
}

export function autoTrackPageviews(client: Client) {
    installErrorHooks(client);
    errorsReportedThisPage = 0;
    const cleanupFn = instrumentHistoryBuiltIns(() => {
        errorsReportedThisPage = 0;
        void trackPageview(client);
    });

    void trackPageview(client);

    return cleanupFn;
}

function getCanonicalUrl() {
    const canonical = document.querySelector(
        'link[rel="canonical"][href]',
    ) as HTMLLinkElement;
    if (!canonical) {
        return null;
    }

    const a = document.createElement("a");
    a.href = canonical.href;
    return a;
}

function getBrowserReferrer(hostname: string, referrer: string): string {
    // First, check if we have an explicit referrer parameter
    if (referrer) {
        return getReferrer(hostname, referrer);
    }

    // If no explicit referrer, check document.referrer
    if (document.referrer && document.referrer.indexOf(hostname) < 0) {
        return getReferrer(hostname, document.referrer);
    }

    // If still no referrer, check query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const referrerParams = [
        "ref",
        "referer",
        "referrer",
        "source",
        "utm_source",
    ];

    for (const param of referrerParams) {
        const value = urlParams.get(param);
        if (value) {
            return getReferrer(hostname, value);
        }
    }

    return getReferrer(hostname, "");
}

function createClientPageviewId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `pv_${crypto.randomUUID()}`;
    }
    return `pv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export async function trackPageview(
    client: Client,
    opts: TrackPageviewOpts = {},
) {
    const canonical = getCanonicalUrl();
    const location = canonical ?? window.location;

    if (
        !client.reportOnLocalhost &&
        isLocalhostAddress(window.location.hostname)
    ) {
        return;
    }

    // if host is empty, we're probably loading a file:/// URI
    // -- exit early if this is not an Electron app
    if (location.host === "" && navigator.userAgent.indexOf("Electron") < 0) {
        return;
    }

    const url = opts.url || location.pathname + location.search || "/";

    const { hostname, path } = getHostnameAndPath(url, true);
    const referrer = getBrowserReferrer(hostname, opts.referrer || "");
    const utmParams = getUtmParamsFromBrowserUrl(url);
    const identityContext = client.identity.getContext();
    const clientPageviewId = createClientPageviewId();

    let hitType: string | undefined;
    try {
        const cacheStatus = await checkCacheStatus(
            client.reporterUrl,
            client.siteId,
        );
        hitType = cacheStatus.ht.toString();
    } catch {
        // If cache check fails, we proceed without hit count data
        // The collect endpoint will handle the missing parameters
    }

    let screenSize: { width?: number; height?: number } | undefined;
    try {
        if (typeof window !== "undefined" && window.screen) {
            screenSize = {
                width: window.screen.width,
                height: window.screen.height,
            };
        }
    } catch {
        // ignore environments without screen
    }

    let perfSample: { ttfbMs?: number; lcpMs?: number } | undefined;
    try {
        if (shouldSamplePerf() && typeof performance !== "undefined") {
            // Defer slightly so navigation timing is populated
            const read = () => readNavigationPerf(performance);
            // If timing not ready yet, still send 0s after short wait via sync best-effort
            const first = read();
            if (first.ttfbMs > 0 || first.lcpMs > 0) {
                perfSample = first;
            } else {
                // fallback: try again after load (fire-and-forget second beacon only if needed)
                const sendPerf = () => {
                    const later = readNavigationPerf(performance);
                    if (later.ttfbMs <= 0 && later.lcpMs <= 0) return;
                    const params = buildCollectRequestParams(
                        client.siteId,
                        hostname,
                        path,
                        referrer,
                        utmParams,
                        hitType,
                        identityContext,
                        clientPageviewId,
                        screenSize,
                        later,
                    );
                    makeRequest(client.reporterUrl, params);
                };
                if (document.readyState === "complete") {
                    setTimeout(sendPerf, 0);
                } else {
                    window.addEventListener("load", () => setTimeout(sendPerf, 0), {
                        once: true,
                    });
                }
            }
        }
    } catch {
        // ignore perf failures
    }

    const requestParams = buildCollectRequestParams(
        client.siteId,
        hostname,
        path,
        referrer,
        utmParams,
        hitType,
        identityContext,
        clientPageviewId,
        screenSize,
        perfSample,
    );

    makeRequest(client.reporterUrl, requestParams);
    client.engagement.startPage(path, clientPageviewId);
    client.presence?.updatePage(path);
}
