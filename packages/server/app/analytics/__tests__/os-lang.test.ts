import { describe, expect, test } from "vitest";

import {
    normalizeOsName,
    parsePrimaryBrowserLanguage,
} from "../collect";

describe("normalizeOsName", () => {
    test("trims and preserves known names", () => {
        expect(normalizeOsName(" Windows ")).toBe("Windows");
        expect(normalizeOsName("Android")).toBe("Android");
    });

    test("maps empty to (unknown)", () => {
        expect(normalizeOsName("")).toBe("(unknown)");
        expect(normalizeOsName(null)).toBe("(unknown)");
        expect(normalizeOsName(undefined)).toBe("(unknown)");
    });
});

describe("parsePrimaryBrowserLanguage", () => {
    test("extracts primary tag from Accept-Language", () => {
        expect(parsePrimaryBrowserLanguage("zh-CN,zh;q=0.9,en;q=0.8")).toBe(
            "zh",
        );
        expect(parsePrimaryBrowserLanguage("en-US")).toBe("en");
        expect(parsePrimaryBrowserLanguage("en")).toBe("en");
    });

    test("maps missing or invalid to (unknown)", () => {
        expect(parsePrimaryBrowserLanguage(null)).toBe("(unknown)");
        expect(parsePrimaryBrowserLanguage("")).toBe("(unknown)");
        expect(parsePrimaryBrowserLanguage("*;q=0.1")).toBe("(unknown)");
    });
});
