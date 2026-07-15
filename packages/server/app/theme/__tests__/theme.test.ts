import { describe, expect, test } from "vitest";
import {
    DEFAULT_THEME,
    isThemePreference,
    parseThemeCookie,
    resolveThemePreference,
    themeCookieHeader,
} from "../index";

describe("theme helpers", () => {
    test("isThemePreference", () => {
        expect(isThemePreference("light")).toBe(true);
        expect(isThemePreference("dark")).toBe(true);
        expect(isThemePreference("system")).toBe(true);
        expect(isThemePreference("auto")).toBe(false);
    });

    test("parseThemeCookie", () => {
        expect(
            parseThemeCookie("__qingstat_theme=dark; other=1"),
        ).toBe("dark");
        expect(parseThemeCookie("__qingstat_theme=nope")).toBeNull();
        expect(parseThemeCookie(null)).toBeNull();
    });

    test("resolveThemePreference defaults to system", () => {
        expect(resolveThemePreference({})).toBe(DEFAULT_THEME);
        expect(DEFAULT_THEME).toBe("system");
        expect(
            resolveThemePreference({
                cookieHeader: "__qingstat_theme=light",
            }),
        ).toBe("light");
    });

    test("themeCookieHeader", () => {
        expect(themeCookieHeader("system")).toContain(
            "__qingstat_theme=system",
        );
        expect(themeCookieHeader("dark")).toContain("SameSite=Lax");
    });
});
