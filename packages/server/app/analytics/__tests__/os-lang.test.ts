import { describe, expect, test } from "vitest";

import {
    bucketScreenDimension,
    normalizeOsName,
    parsePrimaryBrowserLanguage,
    SCREEN_DIMENSION_LADDER,
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

describe("bucketScreenDimension", () => {
    test("returns 0 for missing or non-positive values", () => {
        expect(bucketScreenDimension(undefined)).toBe(0);
        expect(bucketScreenDimension(null)).toBe(0);
        expect(bucketScreenDimension("")).toBe(0);
        expect(bucketScreenDimension(0)).toBe(0);
        expect(bucketScreenDimension(-10)).toBe(0);
        expect(bucketScreenDimension("abc")).toBe(0);
    });

    test("keeps exact ladder values", () => {
        expect(bucketScreenDimension(1920)).toBe(1920);
        expect(bucketScreenDimension(1080)).toBe(1080);
        expect(bucketScreenDimension(375)).toBe(375);
        expect(bucketScreenDimension("1366")).toBe(1366);
    });

    test("snaps to nearest ladder entry", () => {
        expect(bucketScreenDimension(1918)).toBe(1920);
        expect(bucketScreenDimension(1079)).toBe(1080);
        expect(bucketScreenDimension(370)).toBe(375);
    });

    test("clamps below min and above max", () => {
        const min = SCREEN_DIMENSION_LADDER[0];
        const max = SCREEN_DIMENSION_LADDER[SCREEN_DIMENSION_LADDER.length - 1];
        expect(bucketScreenDimension(1)).toBe(min);
        expect(bucketScreenDimension(10000)).toBe(max);
    });
});
