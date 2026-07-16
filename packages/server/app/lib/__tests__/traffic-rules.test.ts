import { describe, expect, test } from "vitest";

import {
    applyCollectTrafficRules,
    isHostAllowed,
    parseAllowedHosts,
    stripTrackingQueryParams,
    TRAFFIC_RULES_VERSION,
} from "../traffic-rules";

describe("parseAllowedHosts", () => {
    test("splits commas/spaces and lowercases", () => {
        expect(parseAllowedHosts("Example.COM, www.foo.com  bar.net")).toEqual([
            "example.com",
            "www.foo.com",
            "bar.net",
        ]);
    });

    test("empty allowlist", () => {
        expect(parseAllowedHosts(null)).toEqual([]);
        expect(parseAllowedHosts("")).toEqual([]);
        expect(parseAllowedHosts("  ,  ")).toEqual([]);
    });
});

describe("isHostAllowed", () => {
    test("empty allowlist allows all hosts", () => {
        expect(isHostAllowed("anything.com", null)).toBe(true);
        expect(isHostAllowed("anything.com", "")).toBe(true);
        expect(isHostAllowed("", null)).toBe(true);
    });

    test("matches exact and subdomain", () => {
        expect(isHostAllowed("example.com", "example.com")).toBe(true);
        expect(isHostAllowed("www.example.com", "example.com")).toBe(true);
        expect(isHostAllowed("blog.example.com", "example.com")).toBe(true);
        expect(isHostAllowed("evil-example.com", "example.com")).toBe(false);
        expect(isHostAllowed("example.org", "example.com")).toBe(false);
    });

    test("accepts full URL as host param", () => {
        expect(
            isHostAllowed("https://www.Example.com/path", "example.com"),
        ).toBe(true);
    });

    test("missing host rejected when allowlist set", () => {
        expect(isHostAllowed("", "example.com")).toBe(false);
        expect(isHostAllowed(null, "example.com")).toBe(false);
    });
});

describe("stripTrackingQueryParams", () => {
    test("removes known tracking params and keeps others", () => {
        expect(
            stripTrackingQueryParams(
                "/landing?utm_source=google&page=1&fbclid=abc&id=42",
            ),
        ).toBe("/landing?page=1&id=42");
    });

    test("drops empty query after strip", () => {
        expect(stripTrackingQueryParams("/x?gclid=1&utm_medium=cpc")).toBe(
            "/x",
        );
    });

    test("path without query unchanged", () => {
        expect(stripTrackingQueryParams("/about")).toBe("/about");
        expect(stripTrackingQueryParams("")).toBe("");
    });
});

describe("applyCollectTrafficRules", () => {
    test("rejects disabled site", () => {
        const r = applyCollectTrafficRules({
            siteEnabled: false,
            host: "example.com",
            path: "/a",
        });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.status).toBe(403);
            expect(r.message).toMatch(/disabled/i);
        }
    });

    test("rejects host not on allowlist", () => {
        const r = applyCollectTrafficRules({
            siteEnabled: true,
            allowedHosts: "allowed.com",
            host: "other.com",
            path: "/a?utm_source=x",
        });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.status).toBe(403);
            expect(r.message).toMatch(/host/i);
        }
    });

    test("strips query and allows host", () => {
        const r = applyCollectTrafficRules({
            siteEnabled: true,
            allowedHosts: "example.com",
            host: "example.com",
            path: "/p?utm_source=ad&keep=1",
        });
        expect(r).toEqual({
            ok: true,
            host: "example.com",
            path: "/p?keep=1",
        });
    });

    test("version constant present for docs/rollout", () => {
        expect(TRAFFIC_RULES_VERSION).toBe("v1");
    });
});
