import { Client } from "./lib/client";
import type { ClientOpts } from "./lib/client";

import { trackPageview as _trackPageview } from "./lib/track";
import type { TrackPageviewOpts } from "./lib/track";
import { trackEvent as _trackEvent } from "./lib/event";
import type { TrackEventInput } from "./lib/event";

const GLOBALS = {
    client: undefined as Client | undefined,
};

export function init(opts: ClientOpts) {
    if (GLOBALS.client) {
        return;
    }
    GLOBALS.client = new Client(opts);
}

export function isInitialized() {
    return Boolean(GLOBALS.client);
}

export function getInitializedClient(): typeof GLOBALS["client"] {
    return GLOBALS.client 
}

export function trackPageview(opts?: TrackPageviewOpts) {
    if (!GLOBALS.client) {
        throw new Error(
            "You must call Qingstat.initialize() before calling Qingstat.trackPageview().",
        );
    }
    _trackPageview(GLOBALS.client, opts);
}

export function trackEvent(input: TrackEventInput) {
    if (!GLOBALS.client) {
        throw new Error(
            "You must call Qingstat.init() before calling Qingstat.trackEvent().",
        );
    }
    return _trackEvent(GLOBALS.client, input);
}

export function cleanup() {
    if (!GLOBALS.client) {
        return; // no-op if not already initialized (TODO: warn?)
    }
    GLOBALS.client.cleanup();
    GLOBALS.client = undefined;
}

export type { TrackEventInput } from "./lib/event";
