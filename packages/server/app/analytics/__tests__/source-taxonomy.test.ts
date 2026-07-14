import { describe, expect, test } from "vitest";

import { classifyTrafficSource } from "../source-taxonomy";

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
