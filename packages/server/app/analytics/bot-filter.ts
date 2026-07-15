/**
 * Bot / spider detection for collect + AE filtering.
 *
 * Rules version is bumped when the pattern set changes so historical
 * botScore=0 traffic can be interpreted against the version at write time
 * if needed later (currently we only store 0/1 flag, not version in AE).
 */
export const BOT_RULES_VERSION = "v1";

/** Known crawler / headless UA tokens (case-insensitive). */
export const BOT_UA_PATTERNS: readonly RegExp[] = [
    /bot\b/i,
    /spider/i,
    /crawler/i,
    /slurp/i,
    /bingpreview/i,
    /facebookexternalhit/i,
    /facebot/i,
    /twitterbot/i,
    /linkedinbot/i,
    /pinterest/i,
    /discordbot/i,
    /whatsapp/i,
    /telegram/i,
    /applebot/i,
    /duckduckbot/i,
    /yandex(bot|images)/i,
    /baiduspider/i,
    /sogou/i,
    /bytespider/i,
    /semrush/i,
    /ahrefs/i,
    /mj12bot/i,
    /dotbot/i,
    /petalbot/i,
    /gptbot/i,
    /claudebot/i,
    /anthropic/i,
    /chatgpt/i,
    /headlesschrome/i,
    /phantomjs/i,
    /selenium/i,
    /puppeteer/i,
    /playwright/i,
    /curl\//i,
    /wget\//i,
    /python-requests/i,
    /go-http-client/i,
    /httpclient/i,
    /java\//i,
    /libwww/i,
    /scrapy/i,
];

/**
 * Returns true when the UA looks like a known bot/spider/tool.
 * Missing / empty UA is **not** treated as bot (avoid killing all traffic).
 */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
    if (!userAgent) return false;
    const ua = userAgent.trim();
    if (!ua) return false;
    return BOT_UA_PATTERNS.some((re) => re.test(ua));
}

/** AE double flag: 1 = bot, 0 = human/unknown. */
export function botScoreFromUserAgent(
    userAgent: string | null | undefined,
): 0 | 1 {
    return isBotUserAgent(userAgent) ? 1 : 0;
}
