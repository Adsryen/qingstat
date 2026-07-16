/**
 * Custom event payload validation / sanitization for trackEvent.
 * Shared shape used by browser + server trackers.
 */

export const EVENT_NAME_MAX = 64;
export const EVENT_PROP_KEY_MAX = 32;
export const EVENT_PROP_VALUE_MAX = 128;
export const EVENT_PROPS_MAX = 8;
export const EVENT_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_.:-]{0,63}$/;

export type TrackEventInput = {
    name: string;
    /** Optional GA-style fields mapped into props if not already present */
    category?: string;
    action?: string;
    label?: string;
    value?: number;
    props?: Record<string, string | number | boolean | null | undefined>;
};

export type SanitizedEvent = {
    name: string;
    /** JSON object string, keys sorted, max EVENT_PROPS_MAX entries */
    propsJson: string;
};

export type SanitizeEventResult =
    | { ok: true; event: SanitizedEvent }
    | { ok: false; error: string };

function truncate(s: string, max: number): string {
    return s.length <= max ? s : s.slice(0, max);
}

function sanitizeKey(key: string): string | null {
    const k = key.trim();
    if (!k) return null;
    if (k.length > EVENT_PROP_KEY_MAX) return truncate(k, EVENT_PROP_KEY_MAX);
    // disallow prototype pollution-ish keys
    if (k === "__proto__" || k === "constructor" || k === "prototype") return null;
    return k;
}

function sanitizeValue(
    value: string | number | boolean | null | undefined,
): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") {
        if (!Number.isFinite(value)) return null;
        // avoid huge numbers / scientific noise
        return truncate(String(value), EVENT_PROP_VALUE_MAX);
    }
    const s = String(value).trim();
    if (!s) return null;
    return truncate(s, EVENT_PROP_VALUE_MAX);
}

/**
 * Validate event name and flatten props with hard limits.
 * Rejects empty/invalid names; drops invalid props; truncates oversize values.
 */
export function sanitizeTrackEvent(input: TrackEventInput): SanitizeEventResult {
    const name = (input.name ?? "").trim();
    if (!name) {
        return { ok: false, error: "event name is required" };
    }
    if (!EVENT_NAME_RE.test(name) || name.length > EVENT_NAME_MAX) {
        return {
            ok: false,
            error: `invalid event name (use [a-zA-Z][a-zA-Z0-9_.:-]{0,63})`,
        };
    }

    const merged: Record<string, string> = {};
    const add = (key: string, value: string | number | boolean | null | undefined) => {
        if (Object.keys(merged).length >= EVENT_PROPS_MAX) return;
        const k = sanitizeKey(key);
        if (!k || k in merged) return;
        const v = sanitizeValue(value);
        if (v === null) return;
        merged[k] = v;
    };

    if (input.category !== undefined) add("category", input.category);
    if (input.action !== undefined) add("action", input.action);
    if (input.label !== undefined) add("label", input.label);
    if (input.value !== undefined) add("value", input.value);

    if (input.props && typeof input.props === "object") {
        for (const [k, v] of Object.entries(input.props)) {
            add(k, v as string | number | boolean | null | undefined);
            if (Object.keys(merged).length >= EVENT_PROPS_MAX) break;
        }
    }

    // stable JSON for aggregation
    const keys = Object.keys(merged).sort();
    const obj: Record<string, string> = {};
    for (const k of keys) obj[k] = merged[k];
    const propsJson = JSON.stringify(obj);

    return { ok: true, event: { name, propsJson } };
}
