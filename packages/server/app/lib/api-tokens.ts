/**
 * Site-scoped API tokens for the open query API.
 * Secrets are hashed (SHA-256) at rest; plaintext is only returned at create time.
 */

export type ApiToken = {
    tokenId: string;
    siteId: string;
    name: string;
    tokenPrefix: string;
    enabled: boolean;
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
};

export type CreateTokenResult = {
    /** Full secret — show once, never store or re-fetch. */
    token: string;
    record: ApiToken;
};

type ApiTokenRow = {
    token_id: string;
    site_id: string;
    name: string;
    token_prefix: string;
    token_hash: string;
    enabled: number;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
};

const TOKEN_PREFIX_LABEL = "qs_";
const SECRET_HEX_BYTES = 32;
const UI_PREFIX_LEN = 8;

function nowIso(): string {
    return new Date().toISOString();
}

function createId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return `tok_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function toHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function rowToApiToken(row: ApiTokenRow): ApiToken {
    return {
        tokenId: row.token_id,
        siteId: row.site_id,
        name: row.name,
        tokenPrefix: row.token_prefix,
        enabled: row.enabled === 1,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        revokedAt: row.revoked_at,
    };
}

/** SHA-256 hex of the full token secret string. */
export async function hashApiToken(secret: string): Promise<string> {
    const encoded = new TextEncoder().encode(secret);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return toHex(digest);
}

/** Generate `qs_` + 64 hex chars (32 random bytes). */
export function generateApiTokenSecret(): string {
    const bytes = new Uint8Array(SECRET_HEX_BYTES);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return `${TOKEN_PREFIX_LABEL}${hex}`;
}

/** First UI_PREFIX_LEN chars of secret for list display / prefix lookup. */
export function tokenDisplayPrefix(secret: string): string {
    return secret.slice(0, UI_PREFIX_LEN);
}

const SELECT_PUBLIC = `SELECT token_id, site_id, name, token_prefix, token_hash, enabled, created_at, last_used_at, revoked_at
             FROM api_tokens`;

export async function createApiToken(
    db: D1Database,
    input: { siteId: string; name: string },
): Promise<CreateTokenResult> {
    const siteId = input.siteId.trim();
    const name = input.name.trim();
    if (!siteId) throw new Error("siteId is required");
    if (!name) throw new Error("Name is required");

    const secret = generateApiTokenSecret();
    const tokenHash = await hashApiToken(secret);
    const tokenPrefix = tokenDisplayPrefix(secret);
    const tokenId = createId();
    const ts = nowIso();

    await db
        .prepare(
            `INSERT INTO api_tokens
             (token_id, site_id, name, token_prefix, token_hash, enabled, created_at, last_used_at, revoked_at)
             VALUES (?, ?, ?, ?, ?, 1, ?, NULL, NULL)`,
        )
        .bind(tokenId, siteId, name, tokenPrefix, tokenHash, ts)
        .run();

    const record: ApiToken = {
        tokenId,
        siteId,
        name,
        tokenPrefix,
        enabled: true,
        createdAt: ts,
        lastUsedAt: null,
        revokedAt: null,
    };

    return { token: secret, record };
}

export async function listApiTokens(
    db: D1Database,
    siteId: string,
): Promise<ApiToken[]> {
    const result = await db
        .prepare(
            `${SELECT_PUBLIC} WHERE site_id = ? ORDER BY created_at DESC`,
        )
        .bind(siteId)
        .all<ApiTokenRow>();
    return (result.results ?? []).map(rowToApiToken);
}

/**
 * Soft-revoke: set revoked_at + enabled=0. Must match siteId.
 * Returns false when not found or site mismatch.
 */
export async function revokeApiToken(
    db: D1Database,
    tokenId: string,
    siteId: string,
): Promise<boolean> {
    const row = await db
        .prepare(`${SELECT_PUBLIC} WHERE token_id = ?`)
        .bind(tokenId)
        .first<ApiTokenRow>();
    if (!row || row.site_id !== siteId) {
        return false;
    }
    if (row.revoked_at) {
        return true;
    }
    const ts = nowIso();
    await db
        .prepare(
            `UPDATE api_tokens
             SET enabled = 0, revoked_at = ?
             WHERE token_id = ? AND site_id = ?`,
        )
        .bind(ts, tokenId, siteId)
        .run();
    return true;
}

function parseBearerToken(authorizationHeader: string | null): string | null {
    if (!authorizationHeader) return null;
    const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader.trim());
    if (!match) return null;
    const token = match[1];
    if (!token.startsWith(TOKEN_PREFIX_LABEL)) return null;
    return token;
}

export type VerifyBearerResult =
    | { status: "ok"; tokenId: string }
    | { status: "unauthorized" }
    | { status: "forbidden" };

/**
 * Verify Authorization Bearer token for the given site.
 * Looks up by prefix, compares hash among candidates.
 * - missing/invalid/revoked/disabled → unauthorized
 * - valid token but site_id mismatch → forbidden
 * Best-effort last_used_at update on success.
 */
export async function verifyBearerToken(
    db: D1Database,
    authorizationHeader: string | null,
    siteId: string,
): Promise<VerifyBearerResult> {
    const secret = parseBearerToken(authorizationHeader);
    if (!secret) return { status: "unauthorized" };

    const prefix = tokenDisplayPrefix(secret);
    const hash = await hashApiToken(secret);

    const result = await db
        .prepare(`${SELECT_PUBLIC} WHERE token_prefix = ?`)
        .bind(prefix)
        .all<ApiTokenRow>();

    const candidates = result.results ?? [];
    const match = candidates.find((row) => row.token_hash === hash);
    if (!match) return { status: "unauthorized" };

    if (match.enabled !== 1 || match.revoked_at) {
        return { status: "unauthorized" };
    }

    if (match.site_id !== siteId) {
        return { status: "forbidden" };
    }

    // Best-effort audit; do not fail auth if update errors.
    try {
        await db
            .prepare(
                `UPDATE api_tokens SET last_used_at = ? WHERE token_id = ?`,
            )
            .bind(nowIso(), match.token_id)
            .run();
    } catch {
        // ignore
    }

    return { status: "ok", tokenId: match.token_id };
}
