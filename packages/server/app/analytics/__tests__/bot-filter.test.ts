import { describe, expect, test } from "vitest";

import {
    botScoreFromUserAgent,
    isBotUserAgent,
    BOT_RULES_VERSION,
} from "../bot-filter";

describe("bot-filter", () => {
    test("exports a rules version", () => {
        expect(BOT_RULES_VERSION).toMatch(/^v\d+/);
    });

    test("detects common search spiders", () => {
        expect(
            isBotUserAgent(
                "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
            ),
        ).toBe(true);
        expect(
            isBotUserAgent(
                "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
            ),
        ).toBe(true);
        expect(isBotUserAgent("Baiduspider+(+http://www.baidu.com/search/spider.htm)")).toBe(
            true,
        );
        expect(botScoreFromUserAgent("Twitterbot/1.0")).toBe(1);
    });

    test("does not flag common browsers", () => {
        expect(
            isBotUserAgent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            ),
        ).toBe(false);
        expect(
            isBotUserAgent(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            ),
        ).toBe(false);
        expect(botScoreFromUserAgent("Mozilla/5.0 (X11; Linux x86_64) Firefox/121.0")).toBe(
            0,
        );
    });

    test("missing or empty UA is not a bot", () => {
        expect(isBotUserAgent(undefined)).toBe(false);
        expect(isBotUserAgent(null)).toBe(false);
        expect(isBotUserAgent("")).toBe(false);
        expect(isBotUserAgent("   ")).toBe(false);
        expect(botScoreFromUserAgent(undefined)).toBe(0);
    });
});
