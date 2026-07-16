/**
 * Site-level traffic rules for collect-time enforcement.
 *
 * Effect position (this MVP):
 * - Host allowlist: collect (and already presence)
 * - Path query stripping: collect (before AE/D1 write)
 * - Bot policy: already via botScore at collect + query default exclude
 *
 * Cross-domain site groups: deferred; single-site host allowlist remains compatible.
 */

export const TRAFFIC_RULES_VERSION = "v1";

/** Query param names stripped from tracked paths (tracking/noise). */
export const DEFAULT_STRIP_QUERY_PARAMS = [
    "fbclid",
    "gclid",
    "gbraid",
    "wbraid",
    "msclkid",
    "mc_cid",
    "mc_eid",
    "igshid",
    "twclid",
    "li_fat_id",
    "yclid",
    "dclid",
    "ttclid",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "utm_id",
    "utm_name",
    "utm_reader",
    "utm_place",
    "utm_social",
    "utm_social-type",
    "ref",
    "referer",
    "referrer",
    "source",
    "_ga",
    "_gl",
    "spm",
    "scm",
] as const;

export function parseAllowedHosts(
    value: string | null | undefined,
): string[] {
    return (value ?? "")
        .split(/[\s,]+/)
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean);
}

/**
 * Check if a tracked page host (collect `h` param) is allowed.
 * Empty allowlist = allow all (backward compatible).
 */
export function isHostAllowed(
    host: string | null | undefined,
    allowedHosts: string | null | undefined,
): boolean {
    const allow = parseAllowedHosts(allowedHosts);
    if (allow.length === 0) return true;
    if (!host) return false;
    let hostname = host.trim().toLowerCase();
    try {
        // accept full URL in h
        if (hostname.includes("://")) {
            hostname = new URL(hostname).hostname.toLowerCase();
        }
    } catch {
        return false;
    }
    hostname = hostname.replace(/^www\./, "");
    return allow.some((a) => {
        const clean = a.replace(/^www\./, "");
        return hostname === clean || hostname.endsWith(`.${clean}`);
    });
}

/**
 * Strip tracking/noise query params from a path string.
 * Path may be `/x` or `/x?a=1&fbclid=2`.
 * Keeps non-tracking params; drops empty `?`.
 */
export function stripTrackingQueryParams(
    path: string | null | undefined,
    stripList: readonly string[] = DEFAULT_STRIP_QUERY_PARAMS,
): string {
    if (!path) return path ?? "";
    const q = path.indexOf("?");
    if (q === -1) return path;
    const base = path.slice(0, q);
    const search = path.slice(q + 1);
    if (!search) return base;

    const strip = new Set(stripList.map((s) => s.toLowerCase()));
    const kept: string[] = [];
    for (const part of search.split("&")) {
        if (!part) continue;
        const eq = part.indexOf("=");
        const key = (eq === -1 ? part : part.slice(0, eq)).trim();
        if (!key) continue;
        let decoded = key;
        try {
            decoded = decodeURIComponent(key);
        } catch {
            // keep raw key
        }
        if (strip.has(decoded.toLowerCase()) || strip.has(key.toLowerCase())) {
            continue;
        }
        kept.push(part);
    }
    return kept.length ? `${base}?${kept.join("&")}` : base;
}

export type TrafficRuleDecision =
    | { ok: true; path: string; host: string }
    | { ok: false; status: number; message: string };

/**
 * Apply collect-time traffic rules for a site.
 * - Disabled site → 403
 * - Host not in allowlist → 403
 * - Path query cleaned
 */
export function applyCollectTrafficRules(input: {
    siteEnabled?: boolean;
    allowedHosts?: string | null;
    host?: string | null;
    path?: string | null;
}): TrafficRuleDecision {
    if (input.siteEnabled === false) {
        return { ok: false, status: 403, message: "Site disabled" };
    }
    const host = (input.host ?? "").trim();
    if (!isHostAllowed(host, input.allowedHosts)) {
        return { ok: false, status: 403, message: "Host not allowed" };
    }
    return {
        ok: true,
        host,
        path: stripTrackingQueryParams(input.path ?? ""),
    };
}
