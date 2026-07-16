/*eslint @typescript-eslint/no-explicit-any: 0 */
import { Mock, describe, expect, test, vi, beforeEach } from "vitest";
import type { AnalyticsEngineDataset } from "@cloudflare/workers-types";
import httpMocks from "node-mocks-http";

import { collectRequestHandler } from "../collect";

type CollectVisitRow = {
    site_id: string;
    visit_id: string;
    page_count: number;
};

type CollectPageviewRow = {
    site_id: string;
    visit_id: string;
    path: string | null;
    client_pageview_id: string | null;
};

function createCollectD1() {
    const visits = new Map<string, CollectVisitRow>();
    const pageviews: CollectPageviewRow[] = [];

    function key(siteId: string, visitId: string) {
        return `${siteId}\u0000${visitId}`;
    }

    return {
        prepare(sql: string) {
            const binds: unknown[] = [];
            const stmt = {
                bind(...args: unknown[]) {
                    binds.push(...args);
                    return stmt;
                },
                async first<T>() {
                    if (sql.includes("FROM sites")) {
                        return null;
                    }
                    if (sql.includes("FROM visits")) {
                        return (visits.get(key(String(binds[0]), String(binds[1]))) as T) ?? null;
                    }
                    return null;
                },
                async all<T>() {
                    return { results: [] as T[] };
                },
                async run() {
                    if (sql.includes("INSERT INTO visits")) {
                        const [siteId, visitId] = binds as [string, string];
                        visits.set(key(siteId, visitId), {
                            site_id: siteId,
                            visit_id: visitId,
                            page_count: 0,
                        });
                    } else if (sql.includes("INSERT INTO pageviews")) {
                        const [, siteId, visitId, , , , , path] = binds as (string | null)[];
                        const clientPageviewId =
                            sql.includes("client_pageview_id") && binds.length > 16
                                ? binds[16]
                                : null;
                        pageviews.push({
                            site_id: String(siteId),
                            visit_id: String(visitId),
                            path,
                            client_pageview_id:
                                clientPageviewId == null ? null : String(clientPageviewId),
                        });
                    } else if (
                        sql.includes("UPDATE visits") &&
                        sql.includes("page_count = page_count + 1")
                    ) {
                        const siteId = String(binds[binds.length - 2]);
                        const visitId = String(binds[binds.length - 1]);
                        const existing = visits.get(key(siteId, visitId));
                        if (existing) existing.page_count += 1;
                    }
                    return { meta: { changes: 1 } };
                },
            };
            return stmt;
        },
        _visits: visits,
        _pageviews: pageviews,
    } as unknown as D1Database & {
        _visits: Map<string, CollectVisitRow>;
        _pageviews: CollectPageviewRow[];
    };
}

const defaultRequestParams = generateRequestParams({
    "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36",
});

function generateRequestParams(headers: Record<string, string>) {
    return {
        method: "GET",
        url:
            "https://example.com/user/42?" +
            new URLSearchParams({
                sid: "example",
                h: "example.com",
                p: "/post/123",
                r: "https://google.com",
                nv: "1",
                ns: "1",
                us: "google",
                um: "search",
                uc: "summer_sale",
                ut: "running_shoes",
                uco: "ad1",
            }).toString(),
        headers: {
            get: (_header: string) => {
                return headers[_header];
            },
        },
        // Cloudflare-specific request properties
        cf: {
            country: "US",
        },
    };
}

describe("collectRequestHandler", () => {
    test("returns 400 when siteId is missing", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = generateRequestParams({
            "user-agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36",
        });
        request.url =
            "https://example.com/user/42?" +
            new URLSearchParams({
                h: "example.com",
                p: "/post/123",
                r: "https://google.com",
                nv: "1",
                ns: "1",
            }).toString();

        const response = await collectRequestHandler(request as any, env);
        expect(response.status).toBe(400);
        expect(env.WEB_COUNTER_AE.writeDataPoint).not.toHaveBeenCalled();
    });

    test("returns 400 when siteId is empty string", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = generateRequestParams({
            "user-agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36",
        });
        request.url =
            "https://example.com/user/42?" +
            new URLSearchParams({
                sid: "",
                h: "example.com",
                p: "/post/123",
                r: "https://google.com",
                nv: "1",
                ns: "1",
            }).toString();

        const response = await collectRequestHandler(request as any, env);
        expect(response.status).toBe(400);
        expect(env.WEB_COUNTER_AE.writeDataPoint).not.toHaveBeenCalled();
    });

    beforeEach(() => {
        // default time is just middle of the day
        vi.setSystemTime(new Date("2024-01-18T09:33:02").getTime());
    });

    test("invokes writeDataPoint with transformed params", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        // @ts-expect-error - we're mocking the request object
        const request = httpMocks.createRequest(defaultRequestParams);

        await collectRequestHandler(request as any, env, {
            country: "US",
            region: "California",
            city: "San Francisco",
            regionCode: "CA",
            latitude: "37.7749",
            longitude: "-122.4194",
        });

        const writeDataPoint = env.WEB_COUNTER_AE.writeDataPoint;
        expect(env.WEB_COUNTER_AE.writeDataPoint).toHaveBeenCalled();

        // verify data shows up in the right place
        expect((writeDataPoint as Mock).mock.calls[0][0]).toEqual({
            blobs: [
                "example.com", // host
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36", // ua string
                "/post/123", // url
                "US", // country
                "https://google.com", // referrer
                "Chrome", // browser name
                "",
                "example", // site id
                "51.x.x.x", // browser version
                "desktop", // device type
                "google", // utm_source
                "search", // utm_medium
                "summer_sale", // utm_campaign
                "running_shoes", // utm_term
                "ad1", // utm_content
                "California", // region
                "San Francisco", // city
                "CA", // regionCode
                "Linux", // osName
                "(unknown)", // browserLanguage — no Accept-Language header
            ],
            doubles: [
                1, // new visitor
                0, // DEAD COLUMN (was session)
                1, // new visit, so bounce
                37.7749, // latitude
                -122.4194, // longitude
                0, // screenWidth unknown
                0, // screenHeight unknown
                0, // botScore human
            ],
            indexes: [
                "example", // site id is index
            ],
        });
    });

    test("if-modified-since is absent", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        // @ts-expect-error - we're mocking the request object
        const request = httpMocks.createRequest(generateRequestParams({}));

        await collectRequestHandler(request as any, env);

        const writeDataPoint = env.WEB_COUNTER_AE.writeDataPoint;
        expect((writeDataPoint as Mock).mock.calls[0][0]).toHaveProperty(
            "doubles",
            [
                1, // new visitor
                0, // DEAD COLUMN (was session)
                1, // new visit, so bounce,
                0,
                0,
                0, // screenWidth
                0, // screenHeight,
                0, // botScore
            ],
        );
    });

    test("if-modified-since is within 30 minutes", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({
                "if-modified-since": new Date(
                    Date.now() - 5 * 60 * 1000, // 5 mins ago
                ).toUTCString(),
            }),
        );

        await collectRequestHandler(request as any, env);

        const writeDataPoint = env.WEB_COUNTER_AE.writeDataPoint;
        expect((writeDataPoint as Mock).mock.calls[0][0]).toHaveProperty(
            "doubles",
            [
                0, // NOT a new visitor
                0, // DEAD COLUMN (was session)
                0, // NOT first or second visit,
                0,
                0,
                0, // screenWidth
                0, // screenHeight,
                0, // botScore
            ],
        );
    });

    test("if-modified since is within 30 minutes but over day boundary", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        // intentionally set system time as 00:15:00
        // if the user last visited ~30 minutes ago, that occurred during
        // the prior day, so this should be considered a new visit
        vi.setSystemTime(new Date("2024-01-18T00:15:00").getTime());

        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({
                "if-modified-since": new Date(
                    Date.now() - 25 * 60 * 1000, // 25 minutes ago
                ).toUTCString(),
            }),
        );

        await collectRequestHandler(request as any, env);

        const writeDataPoint = env.WEB_COUNTER_AE.writeDataPoint;
        expect((writeDataPoint as Mock).mock.calls[0][0]).toHaveProperty(
            "doubles",
            [
                1, // new visitor because a new day began
                0, // DEAD COLUMN (was session)
                1, // new visitor so bounce counted,
                0,
                0,
                0, // screenWidth
                0, // screenHeight,
                0, // botScore
            ],
        );
    });

    test("if-modified-since is over 30 days ago", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({
                "if-modified-since": new Date(
                    Date.now() - 31 * 24 * 60 * 60 * 1000, // 31 days ago
                ).toUTCString(),
            }),
        );

        await collectRequestHandler(request as any, env);

        const writeDataPoint = env.WEB_COUNTER_AE.writeDataPoint;
        expect((writeDataPoint as Mock).mock.calls[0][0]).toHaveProperty(
            "doubles",
            [
                1, // new visitor because > 30 days passed
                0, // DEAD COLUMN (was session)
                1, // new visitor so bounce
                0,
                0,
                0, // screenWidth
                0, // screenHeight,
                0, // botScore
            ],
        );
    });

    test("if-modified-since was yesterday", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({
                "if-modified-since": new Date(
                    Date.now() - 24 * 60 * 60 * 1000, // 24 hours ago
                ).toUTCString(),
            }),
        );

        await collectRequestHandler(request as any, env);

        const writeDataPoint = env.WEB_COUNTER_AE.writeDataPoint;
        expect((writeDataPoint as Mock).mock.calls[0][0]).toHaveProperty(
            "doubles",
            [
                1, // new visitor because > 24 hours passed
                0, // DEAD COLUMN (was session)
                1, // new visitor so bounce
                0,
                0,
                0, // screenWidth
                0, // screenHeight,
                0, // botScore
            ],
        );
    });

    test("if-modified-since is one second after midnight", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);

        vi.setSystemTime(midnight.getTime());

        const midnightPlusOneSecond = new Date(midnight.getTime());
        midnightPlusOneSecond.setSeconds(
            midnightPlusOneSecond.getSeconds() + 1,
        );

        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({
                "if-modified-since": midnightPlusOneSecond.toUTCString(),
            }),
        );

        await collectRequestHandler(request as any, env);

        const writeDataPoint = env.WEB_COUNTER_AE.writeDataPoint;
        expect((writeDataPoint as Mock).mock.calls[0][0]).toHaveProperty(
            "doubles",
            [
                0, // NOT a new visitor
                0, // DEAD COLUMN (was session)
                -1, // First visit after the initial visit so decrement bounce,
                0,
                0,
                0, // screenWidth
                0, // screenHeight,
                0, // botScore
            ],
        );
    });

    test("if-modified-since is two seconds after midnight", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const midnightPlusOneSecond = new Date();
        midnightPlusOneSecond.setHours(0, 0, 1, 0);

        vi.setSystemTime(midnightPlusOneSecond.getTime());

        const midnightPlusTwoSeconds = new Date(
            midnightPlusOneSecond.getTime(),
        );
        midnightPlusTwoSeconds.setSeconds(
            midnightPlusTwoSeconds.getSeconds() + 1,
        );

        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({
                "if-modified-since": midnightPlusTwoSeconds.toUTCString(),
            }),
        );

        await collectRequestHandler(request as any, env);

        const writeDataPoint = env.WEB_COUNTER_AE.writeDataPoint;
        expect((writeDataPoint as Mock).mock.calls[0][0]).toHaveProperty(
            "doubles",
            [
                0, // NOT a new visitor
                0, // DEAD COLUMN (was session)
                0, // After the second visit so no bounce,
                0,
                0,
                0, // screenWidth
                0, // screenHeight,
                0, // botScore
            ],
        );
    });

    test("handles UTM parameters correctly", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = generateRequestParams({
            "user-agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36",
        });

        await collectRequestHandler(request as any, env, {
            country: "US",
        });

        const writeDataPoint = env.WEB_COUNTER_AE.writeDataPoint;
        expect(env.WEB_COUNTER_AE.writeDataPoint).toHaveBeenCalled();

        const blobs = (writeDataPoint as Mock).mock.calls[0][0].blobs;
        expect(blobs[10]).toBe("google"); // utm_source
        expect(blobs[11]).toBe("search"); // utm_medium
        expect(blobs[12]).toBe("summer_sale"); // utm_campaign
        expect(blobs[13]).toBe("running_shoes"); // utm_term
        expect(blobs[14]).toBe("ad1"); // utm_content
    });

    test("handles missing UTM parameters gracefully", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = generateRequestParams({
            "user-agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36",
        });
        // Remove UTM parameters from URL
        request.url = request.url
            .replace(/&us=[^&]*/, "")
            .replace(/&um=[^&]*/, "")
            .replace(/&uc=[^&]*/, "")
            .replace(/&ut=[^&]*/, "")
            .replace(/&uco=[^&]*/, "");

        await collectRequestHandler(request as any, env, {
            country: "US",
        });

        const writeDataPoint = env.WEB_COUNTER_AE.writeDataPoint;
        expect(env.WEB_COUNTER_AE.writeDataPoint).toHaveBeenCalled();

        const blobs = (writeDataPoint as Mock).mock.calls[0][0].blobs;
        expect(blobs[10]).toBe(""); // utm_source (empty)
        expect(blobs[11]).toBe(""); // utm_medium (empty)
        expect(blobs[12]).toBe(""); // utm_campaign (empty)
        expect(blobs[13]).toBe(""); // utm_term (empty)
        expect(blobs[14]).toBe(""); // utm_content (empty)
    });

    test("accepts optional identity params without changing AE schema or trusting self-reported IP", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({
                "user-agent":
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36",
            }),
        );
        const url = new URL(request.url);
        url.searchParams.set("cid", "visitor-123");
        url.searchParams.set("vid", "visit-123");
        url.searchParams.set("tid", "tab-123");
        url.searchParams.set("isc", "persistent");
        url.searchParams.set("ct", "1767225600000");
        url.searchParams.set("ip", "203.0.113.10");
        url.searchParams.set("client_ip", "198.51.100.20");
        request.url = url.toString();

        const response = await collectRequestHandler(request as any, env, {
            country: "US",
        });

        expect(response.status).toBe(200);
        const writeDataPoint = env.WEB_COUNTER_AE.writeDataPoint;
        expect(writeDataPoint).toHaveBeenCalled();
        const datapoint = (writeDataPoint as Mock).mock.calls[0][0];
        expect(datapoint.blobs).toHaveLength(20);
        expect(datapoint.doubles).toHaveLength(8);
        expect(datapoint.blobs).not.toContain("203.0.113.10");
        expect(datapoint.blobs).not.toContain("198.51.100.20");
    });

    test("stores client pageview id in D1 detail without changing AE schema", async () => {
        const db = createCollectD1();
        const env = {
            DB: db,
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as unknown as Env;
        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({
                "user-agent":
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36",
            }),
        );
        const url = new URL(request.url);
        url.searchParams.set("cid", "visitor-123");
        url.searchParams.set("vid", "visit-123");
        url.searchParams.set("tid", "tab-123");
        url.searchParams.set("isc", "persistent");
        url.searchParams.set("ct", "1767225600000");
        url.searchParams.set("pid", "client-pv-123");
        request.url = url.toString();

        const response = await collectRequestHandler(request as any, env, {
            country: "US",
        });

        expect(response.status).toBe(200);
        expect(db._pageviews).toHaveLength(1);
        expect(db._pageviews[0]).toMatchObject({
            site_id: "example",
            visit_id: "visit-123",
            path: "/post/123",
            client_pageview_id: "client-pv-123",
        });
        expect(db._visits.get("example\u0000visit-123")?.page_count).toBe(1);

        const datapoint = (env.WEB_COUNTER_AE.writeDataPoint as Mock).mock.calls[0][0];
        expect(datapoint.blobs).toHaveLength(20);
        expect(datapoint.doubles).toHaveLength(8);
        expect(datapoint.blobs).not.toContain("client-pv-123");
    });

    test("returns 400 for overlong identity ids", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({}),
        );
        const url = new URL(request.url);
        url.searchParams.set("cid", "x".repeat(129));
        request.url = url.toString();

        const response = await collectRequestHandler(request as any, env);

        expect(response.status).toBe(400);
        expect(env.WEB_COUNTER_AE.writeDataPoint).not.toHaveBeenCalled();
    });

    test("returns 400 for invalid identity scope", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({}),
        );
        const url = new URL(request.url);
        url.searchParams.set("isc", "device");
        request.url = url.toString();

        const response = await collectRequestHandler(request as any, env);

        expect(response.status).toBe(400);
        expect(env.WEB_COUNTER_AE.writeDataPoint).not.toHaveBeenCalled();
    });

    test("ignores abnormal client time and keeps server time as the cache header source", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;
        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({}),
        );
        const url = new URL(request.url);
        url.searchParams.set("cid", "visitor-123");
        url.searchParams.set("vid", "visit-123");
        url.searchParams.set("tid", "tab-123");
        url.searchParams.set("isc", "persistent");
        url.searchParams.set("ct", "999999999999999999999999999999999999");
        request.url = url.toString();

        const response = await collectRequestHandler(request as any, env);
        const expectedLastModified = new Date(Date.now());
        expectedLastModified.setHours(0, 0, 1, 0);

        expect(response.status).toBe(200);
        expect(response.headers.get("Last-Modified")).toBe(
            expectedLastModified.toUTCString(),
        );
        expect(env.WEB_COUNTER_AE.writeDataPoint).toHaveBeenCalled();
    });

    test("parses OS from UA and primary language from Accept-Language", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({
                "user-agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
            }),
        );

        await collectRequestHandler(request as any, env);

        const blobs = (env.WEB_COUNTER_AE.writeDataPoint as Mock).mock
            .calls[0][0].blobs;
        expect(blobs).toHaveLength(20);
        expect(blobs[18]).toBe("Windows"); // osName
        expect(blobs[19]).toBe("zh"); // browserLanguage primary tag
    });

    test("buckets sw/sh into doubles[5] and doubles[6]", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({}),
        );
        const url = new URL(request.url);
        // Near 1920x1080 ladder entries
        url.searchParams.set("sw", "1918");
        url.searchParams.set("sh", "1079");
        request.url = url.toString();

        await collectRequestHandler(request as any, env);

        const doubles = (env.WEB_COUNTER_AE.writeDataPoint as Mock).mock
            .calls[0][0].doubles;
        expect(doubles).toHaveLength(8);
        expect(doubles[5]).toBe(1920); // screenWidth bucketed
        expect(doubles[6]).toBe(1080); // screenHeight bucketed
        expect(doubles[7]).toBe(0); // botScore
    });

    test("missing or invalid sw/sh write 0 for screen doubles", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({}),
        );
        const url = new URL(request.url);
        url.searchParams.set("sw", "0");
        url.searchParams.set("sh", "abc");
        request.url = url.toString();

        await collectRequestHandler(request as any, env);

        const doubles = (env.WEB_COUNTER_AE.writeDataPoint as Mock).mock
            .calls[0][0].doubles;
        expect(doubles[5]).toBe(0);
        expect(doubles[6]).toBe(0);
    });
    test("marks known spider UA as botScore=1", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = httpMocks.createRequest(
            // @ts-expect-error mock
            generateRequestParams({
                "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
            }),
        );
        await collectRequestHandler(request as any, env);
        const doubles = (env.WEB_COUNTER_AE.writeDataPoint as Mock).mock.calls[0][0].doubles;
        expect(doubles).toHaveLength(8);
        expect(doubles[7]).toBe(1);
    });

    test("empty user-agent is not treated as bot", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;
        const request = httpMocks.createRequest(
            // @ts-expect-error mock
            generateRequestParams({}),
        );
        await collectRequestHandler(request as any, env);
        const doubles = (env.WEB_COUNTER_AE.writeDataPoint as Mock).mock.calls[0][0].doubles;
        expect(doubles[7]).toBe(0);
    });

    test("rejects collect when registry site is disabled", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
            DB: {
                prepare(sql: string) {
                    return {
                        bind() {
                            return this;
                        },
                        async first() {
                            if (sql.includes("FROM sites")) {
                                return {
                                    site_id: "example",
                                    name: "Example",
                                    enabled: 0,
                                    public_stats: 1,
                                    record_ip: 1,
                                    ip_retention_days: 60,
                                    allowed_hosts: null,
                                    created_at: "2024-01-01T00:00:00.000Z",
                                    updated_at: "2024-01-01T00:00:00.000Z",
                                };
                            }
                            return null;
                        },
                        async all() {
                            return { results: [] };
                        },
                        async run() {
                            return { meta: { changes: 0 } };
                        },
                    };
                },
            } as unknown as D1Database,
        } as Env;
        // @ts-expect-error mock
        const request = httpMocks.createRequest(defaultRequestParams);
        const response = await collectRequestHandler(request as any, env);
        expect(response.status).toBe(403);
        expect(await response.text()).toMatch(/disabled/i);
        expect(env.WEB_COUNTER_AE.writeDataPoint).not.toHaveBeenCalled();
    });

    test("rejects collect when host not on allowlist", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
            DB: {
                prepare(sql: string) {
                    return {
                        bind() {
                            return this;
                        },
                        async first() {
                            if (sql.includes("FROM sites")) {
                                return {
                                    site_id: "example",
                                    name: "Example",
                                    enabled: 1,
                                    public_stats: 1,
                                    record_ip: 1,
                                    ip_retention_days: 60,
                                    allowed_hosts: "allowed.example",
                                    created_at: "2024-01-01T00:00:00.000Z",
                                    updated_at: "2024-01-01T00:00:00.000Z",
                                };
                            }
                            return null;
                        },
                        async all() {
                            return { results: [] };
                        },
                        async run() {
                            return { meta: { changes: 0 } };
                        },
                    };
                },
            } as unknown as D1Database,
        } as Env;
        // @ts-expect-error mock
        const request = httpMocks.createRequest(defaultRequestParams);
        const response = await collectRequestHandler(request as any, env);
        expect(response.status).toBe(403);
        expect(await response.text()).toMatch(/host/i);
        expect(env.WEB_COUNTER_AE.writeDataPoint).not.toHaveBeenCalled();
    });

    test("strips tracking query params from path before write", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;
        const request = generateRequestParams({
            "user-agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36",
        });
        request.url =
            "https://example.com/user/42?" +
            new URLSearchParams({
                sid: "example",
                h: "example.com",
                p: "/landing?utm_source=google&page=2&fbclid=abc",
                r: "https://google.com",
                nv: "1",
                ns: "1",
            }).toString();
        // @ts-expect-error mock
        await collectRequestHandler(request as any, env);
        expect(env.WEB_COUNTER_AE.writeDataPoint).toHaveBeenCalled();
        const blobs = (env.WEB_COUNTER_AE.writeDataPoint as Mock).mock.calls[0][0]
            .blobs;
        expect(blobs[2]).toBe("/landing?page=2");
    });


});
