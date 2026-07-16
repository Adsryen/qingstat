/**
 * Heatmap spike types + privacy sanitization.
 *
 * Pure client-side helpers for evaluating click capture modes.
 * NOT wired into production /collect or trackEvent send paths.
 */

export type HeatmapMode = "coordinate" | "element" | "link";

export type DeviceBucket = "desktop" | "mobile" | "tablet" | "unknown";

/** Minimal element summary for privacy checks (no text/value/DOM). */
export type HeatmapElementSummary = {
    tagName: string;
    role?: string | null;
    type?: string | null;
    isContentEditable?: boolean;
    href?: string | null;
    id?: string | null;
    className?: string | null;
    /** e.g. data-testid value when present */
    testId?: string | null;
    /** true when element or ancestors declare data-private */
    dataPrivate?: boolean;
    /** true when click is inside a form that contains a password input */
    inPasswordForm?: boolean;
};

export type HeatmapClickCandidate = HeatmapElementSummary & {
    mode: HeatmapMode;
    /** clientX relative to viewport */
    clientX: number;
    clientY: number;
    viewportWidth: number;
    viewportHeight: number;
    scrollY: number;
    documentHeight: number;
    pagePath: string;
    pageVersion: string;
    deviceBucket: DeviceBucket;
    sampleRate: number;
    /** site/page exclude selectors (simple string match) */
    excludeSelectors?: string[];
    /** optional host for link normalization */
    host?: string;
};

export type SanitizedHeatmapEvent = {
    mode: HeatmapMode;
    pagePath: string;
    pageVersion: string;
    deviceBucket: DeviceBucket;
    sampleRate: number;
    timestamp: number;
    /** coordinate mode fields */
    xRatio?: number;
    yRatio?: number;
    viewportWidth?: number;
    viewportHeight?: number;
    scrollY?: number;
    documentHeight?: number;
    /** element mode */
    elementKey?: string;
    /** link mode: path-only, query/hash stripped */
    actionUrl?: string;
};

export type SanitizeHeatmapResult =
    | { ok: true; event: SanitizedHeatmapEvent }
    | { ok: false; reason: string };

const SENSITIVE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

const SAFE_ID_RE = /^[a-zA-Z][\w-]{0,63}$/;

function normalizeTag(tagName: string): string {
    return (tagName || "").toUpperCase();
}

function clamp01(n: number): number {
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}

/**
 * Simple exclude selector match against an element summary.
 * Supports:
 * - tag names: `input`, `button`
 * - id: `#checkout`, `button#submit`
 * - class fragment: `.private`, `div.card`
 * - attribute-ish: `[data-private]`, `input[type=password]`
 * Matching is substring/endsWith based for spike testability — not a full CSS engine.
 */
export function matchesExcludeSelector(
    el: HeatmapElementSummary,
    selector: string,
): boolean {
    const sel = (selector || "").trim().toLowerCase();
    if (!sel) return false;

    const tag = normalizeTag(el.tagName).toLowerCase();
    const id = (el.id || "").toLowerCase();
    const className = (el.className || "").toLowerCase();
    const type = (el.type || "").toLowerCase();
    const role = (el.role || "").toLowerCase();
    const testId = (el.testId || "").toLowerCase();

    // [attr] / [attr=value]
    const attrMatch = sel.match(/^\[([a-z0-9_-]+)(?:=([^\]]+))?\]$/i);
    if (attrMatch) {
        const attr = attrMatch[1].toLowerCase();
        const val = (attrMatch[2] || "").replace(/^["']|["']$/g, "").toLowerCase();
        if (attr === "data-private") return Boolean(el.dataPrivate);
        if (attr === "data-testid") {
            if (!val) return Boolean(testId);
            return testId === val;
        }
        if (attr === "type") {
            if (!val) return Boolean(type);
            return type === val;
        }
        if (attr === "role") {
            if (!val) return Boolean(role);
            return role === val;
        }
        if (attr === "id") {
            if (!val) return Boolean(id);
            return id === val;
        }
        return false;
    }

    // #id
    if (sel.startsWith("#")) {
        return id === sel.slice(1);
    }

    // .class
    if (sel.startsWith(".")) {
        const cls = sel.slice(1);
        return className.split(/\s+/).includes(cls) || className.includes(cls);
    }

    // tag#id.class or tag[type=password] or plain tag
    let rest = sel;
    let wantTag = "";
    const tagPart = rest.match(/^([a-z][\w-]*)/i);
    if (tagPart) {
        wantTag = tagPart[1].toLowerCase();
        rest = rest.slice(tagPart[1].length);
        if (wantTag && wantTag !== tag) return false;
    }

    if (rest.startsWith("#")) {
        const idPart = rest.match(/^#([a-zA-Z][\w-]*)/);
        if (!idPart) return false;
        if (id !== idPart[1].toLowerCase()) return false;
        rest = rest.slice(idPart[0].length);
    }

    while (rest.startsWith(".")) {
        const classPart = rest.match(/^\.([a-zA-Z_][\w-]*)/);
        if (!classPart) return false;
        const cls = classPart[1].toLowerCase();
        if (!className.split(/\s+/).includes(cls) && !className.includes(cls)) {
            return false;
        }
        rest = rest.slice(classPart[0].length);
    }

    const typeAttr = rest.match(/^\[type(?:=([^\]]+))?\]/i);
    if (typeAttr) {
        const val = (typeAttr[1] || "").replace(/^["']|["']$/g, "").toLowerCase();
        if (val && type !== val) return false;
        if (!val && !type) return false;
        rest = rest.slice(typeAttr[0].length);
    }

    // leftover means incomplete parse → treat as includes on serialized summary
    if (rest.length > 0) {
        const summary = `${tag}${id ? `#${id}` : ""}${className ? `.${className.replace(/\s+/g, ".")}` : ""}${type ? `[type=${type}]` : ""}`;
        return summary.includes(sel) || sel.includes(tag);
    }

    return Boolean(wantTag) || sel === tag;
}

export function buildElementKey(el: HeatmapElementSummary): string {
    const tag = normalizeTag(el.tagName).toLowerCase() || "unknown";
    let key = tag;
    const id = el.id || "";
    if (id && SAFE_ID_RE.test(id)) {
        key += `#${id}`;
    }
    const testId = (el.testId || "").trim();
    if (testId && /^[\w:.-]{1,64}$/.test(testId)) {
        key += `[data-testid=${testId}]`;
    }
    return key;
}

/**
 * Normalize href to path-only action URL.
 * Rejects javascript:/data:/mailto: and empty.
 * Optionally prefixes host when provided as absolute http(s) URL.
 */
export function normalizeActionUrl(
    href: string | null | undefined,
    host?: string,
): string | null {
    if (!href) return null;
    const raw = href.trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (
        lower.startsWith("javascript:") ||
        lower.startsWith("data:") ||
        lower.startsWith("mailto:") ||
        lower.startsWith("tel:") ||
        lower.startsWith("vbscript:")
    ) {
        return null;
    }

    try {
        if (raw.startsWith("/") && !raw.startsWith("//")) {
            // path-only relative
            const path = raw.split(/[?#]/)[0] || "/";
            return path || "/";
        }
        if (raw.startsWith("#")) {
            return null;
        }
        // absolute or protocol-relative
        const base = host
            ? host.includes("://")
                ? host
                : `https://${host}`
            : "https://example.invalid";
        const url = new URL(raw, base);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return null;
        }
        return url.pathname || "/";
    } catch {
        // bare path-ish
        const path = raw.split(/[?#]/)[0];
        if (path.startsWith("/")) return path;
        return null;
    }
}

function isSensitiveTarget(el: HeatmapElementSummary): string | null {
    const tag = normalizeTag(el.tagName);
    if (SENSITIVE_TAGS.has(tag)) {
        return `sensitive_tag:${tag.toLowerCase()}`;
    }
    if (el.isContentEditable) {
        return "contenteditable";
    }
    const type = (el.type || "").toLowerCase();
    if (type === "password") {
        return "password_input";
    }
    const role = (el.role || "").toLowerCase();
    if (role === "textbox" || role === "searchbox" || role === "combobox") {
        return `sensitive_role:${role}`;
    }
    if (el.dataPrivate) {
        return "data_private";
    }
    // optional: submit button inside password form
    if (
        tag === "BUTTON" &&
        (type === "submit" || !type) &&
        el.inPasswordForm
    ) {
        return "submit_in_password_form";
    }
    return null;
}

/**
 * Sanitize a click candidate into a privacy-safe heatmap event, or drop it.
 * Never includes textContent / innerHTML / value.
 */
export function sanitizeHeatmapClick(
    candidate: HeatmapClickCandidate,
): SanitizeHeatmapResult {
    const tag = normalizeTag(candidate.tagName);
    if (!tag) {
        return { ok: false, reason: "missing_tag" };
    }

    const sensitive = isSensitiveTarget(candidate);
    if (sensitive) {
        return { ok: false, reason: sensitive };
    }

    const excludes = candidate.excludeSelectors || [];
    for (const sel of excludes) {
        if (matchesExcludeSelector(candidate, sel)) {
            return { ok: false, reason: `exclude_selector:${sel}` };
        }
    }

    const sampleRate =
        Number.isFinite(candidate.sampleRate) && candidate.sampleRate > 0
            ? candidate.sampleRate
            : 1;

    const base: SanitizedHeatmapEvent = {
        mode: candidate.mode,
        pagePath: candidate.pagePath || "/",
        pageVersion: candidate.pageVersion || "unknown",
        deviceBucket: candidate.deviceBucket || "unknown",
        sampleRate,
        timestamp: Date.now(),
    };

    if (candidate.mode === "coordinate") {
        const vw = Math.max(1, candidate.viewportWidth || 1);
        const vh = Math.max(1, candidate.viewportHeight || 1);
        const docH = Math.max(1, candidate.documentHeight || vh);
        // y relative to full document height when possible
        const pageY = (candidate.scrollY || 0) + candidate.clientY;
        return {
            ok: true,
            event: {
                ...base,
                xRatio: clamp01(candidate.clientX / vw),
                yRatio: clamp01(pageY / docH),
                viewportWidth: Math.round(vw),
                viewportHeight: Math.round(vh),
                scrollY: Math.max(0, Math.round(candidate.scrollY || 0)),
                documentHeight: Math.round(docH),
            },
        };
    }

    if (candidate.mode === "element") {
        return {
            ok: true,
            event: {
                ...base,
                elementKey: buildElementKey(candidate),
            },
        };
    }

    // link mode
    const actionUrl = normalizeActionUrl(candidate.href, candidate.host);
    if (!actionUrl) {
        return { ok: false, reason: "invalid_or_sensitive_href" };
    }
    return {
        ok: true,
        event: {
            ...base,
            actionUrl,
            elementKey: buildElementKey(candidate),
        },
    };
}
