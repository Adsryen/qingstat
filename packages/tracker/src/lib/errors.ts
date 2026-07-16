/**
 * Lightweight JS error capture with privacy redaction + sampling.
 */

export const ERROR_SAMPLE_RATE = 0.2; // 20% of error events
export const ERROR_MAX_PER_PAGE = 5;
export const ERROR_RULES_VERSION = "v1";

export type SanitizedError = {
    message: string;
    source: string;
};

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const LONG_NUM_RE = /\b\d{6,}\b/g;
const TOKENISH_RE = /\b(?:Bearer\s+)?[A-Za-z0-9_-]{20,}\b/g;

/** Redact emails, long numbers, token-like strings; truncate. */
export function sanitizeErrorMessage(raw: string | null | undefined): string {
    if (!raw) return "(unknown)";
    let s = String(raw);
    s = s.replace(EMAIL_RE, "[email]");
    s = s.replace(TOKENISH_RE, "[redacted]");
    s = s.replace(LONG_NUM_RE, "[num]");
    s = s.replace(/\s+/g, " ").trim();
    if (s.length > 120) s = s.slice(0, 117) + "...";
    return s || "(unknown)";
}

/** Keep only pathname for source URL (drop query/hash). */
export function sanitizeErrorSource(raw: string | null | undefined): string {
    if (!raw) return "";
    try {
        if (raw.startsWith("http://") || raw.startsWith("https://")) {
            return new URL(raw).pathname.slice(0, 80);
        }
    } catch {
        // fall through
    }
    return String(raw).split("?")[0].split("#")[0].slice(0, 80);
}

export function shouldSampleError(random: () => number = Math.random): boolean {
    return random() < ERROR_SAMPLE_RATE;
}

export function sanitizeErrorEvent(input: {
    message?: string | null;
    source?: string | null;
}): SanitizedError {
    return {
        message: sanitizeErrorMessage(input.message),
        source: sanitizeErrorSource(input.source),
    };
}
