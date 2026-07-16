import { describe, expect, test } from "vitest";

import {
    createApiToken,
    generateApiTokenSecret,
    hashApiToken,
    listApiTokens,
    revokeApiToken,
    tokenDisplayPrefix,
    verifyBearerToken,
    type ApiToken,
} from "../api-tokens";

type Row = {
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

function createMemoryD1(initial: Row[] = []) {
    const rows = new Map<string, Row>(
        initial.map((r) => [r.token_id, { ...r }]),
    );

    function prepare(sql: string) {
        const binds: unknown[] = [];
        const stmt = {
            bind(...args: unknown[]) {
                binds.push(...args);
                return stmt;
            },
            async first<T>() {
                if (sql.includes("WHERE token_id = ?")) {
                    const id = String(binds[0]);
                    return (rows.get(id) as T) ?? null;
                }
                return null;
            },
            async all<T>() {
                let list = Array.from(rows.values());
                if (sql.includes("WHERE site_id = ?")) {
                    list = list.filter((r) => r.site_id === String(binds[0]));
                }
                if (sql.includes("WHERE token_prefix = ?")) {
                    list = list.filter(
                        (r) => r.token_prefix === String(binds[0]),
                    );
                }
                if (sql.includes("ORDER BY created_at DESC")) {
                    list = list
                        .slice()
                        .sort((a, b) =>
                            b.created_at.localeCompare(a.created_at),
                        );
                }
                return { results: list as T[] };
            },
            async run() {
                if (sql.includes("INSERT INTO api_tokens")) {
                    const [
                        token_id,
                        site_id,
                        name,
                        token_prefix,
                        token_hash,
                        created_at,
                    ] = binds as [
                        string,
                        string,
                        string,
                        string,
                        string,
                        string,
                    ];
                    rows.set(token_id, {
                        token_id,
                        site_id,
                        name,
                        token_prefix,
                        token_hash,
                        enabled: 1,
                        created_at,
                        last_used_at: null,
                        revoked_at: null,
                    });
                    return { success: true };
                }
                if (sql.includes("SET enabled = 0, revoked_at")) {
                    const [revoked_at, token_id, site_id] = binds as [
                        string,
                        string,
                        string,
                    ];
                    const row = rows.get(token_id);
                    if (row && row.site_id === site_id) {
                        row.enabled = 0;
                        row.revoked_at = revoked_at;
                    }
                    return { success: true };
                }
                if (sql.includes("SET last_used_at")) {
                    const [last_used_at, token_id] = binds as [string, string];
                    const row = rows.get(token_id);
                    if (row) row.last_used_at = last_used_at;
                    return { success: true };
                }
                return { success: true };
            },
        };
        return stmt;
    }

    return { prepare } as unknown as D1Database;
}

describe("hashApiToken", () => {
    test("is stable for the same secret", async () => {
        const secret =
            "qs_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        const a = await hashApiToken(secret);
        const b = await hashApiToken(secret);
        expect(a).toBe(b);
        expect(a).toMatch(/^[0-9a-f]{64}$/);
    });

    test("differs for different secrets", async () => {
        const a = await hashApiToken("qs_aaa");
        const b = await hashApiToken("qs_bbb");
        expect(a).not.toBe(b);
    });
});

describe("generateApiTokenSecret", () => {
    test("matches qs_ + 64 hex chars", () => {
        const secret = generateApiTokenSecret();
        expect(secret).toMatch(/^qs_[0-9a-f]{64}$/);
        expect(secret.length).toBe(3 + 64);
    });

    test("produces unique values", () => {
        const a = generateApiTokenSecret();
        const b = generateApiTokenSecret();
        expect(a).not.toBe(b);
    });
});

describe("tokenDisplayPrefix", () => {
    test("returns first 8 characters", () => {
        expect(tokenDisplayPrefix("qs_abcdef012345")).toBe("qs_abcde");
    });
});

describe("api token CRUD + verify", () => {
    test("create returns plaintext once and list omits hash", async () => {
        const db = createMemoryD1();
        const created = await createApiToken(db, {
            siteId: "example.com",
            name: "CI",
        });
        expect(created.token).toMatch(/^qs_[0-9a-f]{64}$/);
        expect(created.record.tokenPrefix).toBe(
            tokenDisplayPrefix(created.token),
        );

        const listed = await listApiTokens(db, "example.com");
        expect(listed).toHaveLength(1);
        expect(listed[0].name).toBe("CI");
        // Public type has no hash field
        expect(
            (listed[0] as ApiToken & { tokenHash?: string }).tokenHash,
        ).toBeUndefined();
    });

    test("verifyBearerToken ok / unauthorized / forbidden / revoke", async () => {
        const db = createMemoryD1();
        const created = await createApiToken(db, {
            siteId: "example.com",
            name: "CI",
        });
        const header = `Bearer ${created.token}`;

        const ok = await verifyBearerToken(db, header, "example.com");
        expect(ok).toEqual({
            status: "ok",
            tokenId: created.record.tokenId,
        });

        const missing = await verifyBearerToken(db, null, "example.com");
        expect(missing).toEqual({ status: "unauthorized" });

        const wrongSite = await verifyBearerToken(
            db,
            header,
            "other.example",
        );
        expect(wrongSite).toEqual({ status: "forbidden" });

        await revokeApiToken(db, created.record.tokenId, "example.com");
        const revoked = await verifyBearerToken(db, header, "example.com");
        expect(revoked).toEqual({ status: "unauthorized" });
    });
});
