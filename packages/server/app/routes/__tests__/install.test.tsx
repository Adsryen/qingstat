// @vitest-environment jsdom
import { test, describe, expect } from "vitest";
import "vitest-dom/extend-expect";

import {
    buildHtmlSnippet,
    buildModuleSnippet,
    sanitizeSiteId,
} from "~/lib/snippets";

describe("snippet helpers", () => {
    test("sanitizeSiteId strips unsafe characters", () => {
        expect(sanitizeSiteId("")).toBe("mysite");
        expect(sanitizeSiteId("  blog  ")).toBe("blog");
        expect(sanitizeSiteId('"><script>')).toBe("script");
        expect(sanitizeSiteId("my-site_1.0")).toBe("my-site_1.0");
    });

    test("buildHtmlSnippet embeds origin and site id", () => {
        const html = buildHtmlSnippet("https://example.workers.dev", "blog");
        expect(html).toContain('data-site-id="blog"');
        expect(html).toContain('src="https://example.workers.dev/tracker.js"');
        expect(html).toContain("defer");
    });

    test("buildModuleSnippet uses reporterUrl /collect", () => {
        const snip = buildModuleSnippet("https://example.workers.dev", "shop");
        expect(snip).toContain('siteId: "shop"');
        expect(snip).toContain(
            'reporterUrl: "https://example.workers.dev/collect"',
        );
    });
});
