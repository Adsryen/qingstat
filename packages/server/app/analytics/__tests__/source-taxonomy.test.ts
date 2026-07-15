import { describe, expect, test } from "vitest";

import {
    classifyTrafficSource,
    extractSearchTerm,
    identifySearchEngine,
    SEARCH_TERM_NOT_PROVIDED,
} from "../source-taxonomy";

describe("classifyTrafficSource", () => {
    test("classifies paid UTM traffic as ads before looking at referrer", () => {
        expect(
            classifyTrafficSource({
                referrer: "https://www.google.com/search?q=counter",
                utmSource: "google",
                utmMedium: " CPC ",
                utmCampaign: "launch",
            }),
        ).toBe("ads");
    });

    test("classifies non-paid UTM traffic as campaign before looking at referrer", () => {
        expect(
            classifyTrafficSource({
                referrer: "https://weibo.com/u/123",
                utmSource: "newsletter",
                utmMedium: "email",
            }),
        ).toBe("campaign");
    });

    test.each([
        ["https://www.baidu.com/s?wd=analytics", "search"],
        ["https://www.google.co.jp/search?q=analytics", "search"],
        ["https://www.bing.com/search?q=analytics", "search"],
        ["https://mp.weixin.qq.com/s/example", "social"],
        ["https://www.zhihu.com/question/1", "social"],
        ["https://example.org/post", "external"],
        ["https://evilgoogle.com/post", "external"],
        ["", "direct"],
        ["not a valid referrer url", "other"],
    ] as const)("classifies referrer %s as %s", (referrer, expected) => {
        expect(classifyTrafficSource({ referrer })).toBe(expected);
    });
});

describe("identifySearchEngine", () => {
    test.each([
        ["https://www.baidu.com/s?wd=foo", "baidu"],
        ["https://m.baidu.com/s?word=bar", "baidu"],
        ["https://www.google.com/search?q=x", "google"],
        ["https://www.google.co.uk/search?q=x", "google"],
        ["https://www.bing.com/search?q=x", "bing"],
        ["https://www.sogou.com/web?query=x", "sogou"],
        ["https://www.so.com/s?q=x", "so"],
        ["https://m.sm.cn/s?q=x", "sm"],
        ["https://search.yahoo.com/search?p=x", "yahoo"],
        ["https://yandex.ru/search/?text=x", "yandex"],
        ["https://duckduckgo.com/?q=x", "duckduckgo"],
        ["https://example.com/", "not-search"],
        ["", "not-search"],
    ] as const)("%s → %s", (referrer, id) => {
        expect(identifySearchEngine(referrer)).toBe(id);
    });
});

describe("extractSearchTerm", () => {
    test("reads common query params from search referrers", () => {
        expect(
            extractSearchTerm({
                referrer: "https://www.baidu.com/s?wd=%E7%BB%9F%E8%AE%A1",
            }),
        ).toBe("统计");
        expect(
            extractSearchTerm({
                referrer: "https://www.google.com/search?q=counter+scale",
            }),
        ).toBe("counter scale");
        expect(
            extractSearchTerm({
                referrer: "https://www.bing.com/search?q=analytics",
            }),
        ).toBe("analytics");
    });

    test("returns not provided when search referrer has no keyword", () => {
        expect(
            extractSearchTerm({
                referrer: "https://www.google.com/",
            }),
        ).toBe(SEARCH_TERM_NOT_PROVIDED);
    });

    test("falls back to utm_term", () => {
        expect(
            extractSearchTerm({
                referrer: "https://www.google.com/",
                utmTerm: "brand",
            }),
        ).toBe("brand");
        expect(extractSearchTerm({ utmTerm: " only-utm " })).toBe("only-utm");
    });

    test("non-search without utm_term is not provided", () => {
        expect(
            extractSearchTerm({ referrer: "https://example.com/page" }),
        ).toBe(SEARCH_TERM_NOT_PROVIDED);
    });
});
