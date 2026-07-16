import { describe, expect, test } from "vitest";
import {
    sanitizeErrorMessage,
    sanitizeErrorSource,
    sanitizeErrorEvent,
    shouldSampleError,
    ERROR_SAMPLE_RATE,
} from "../errors";

describe("sanitizeErrorMessage", () => {
    test("redacts email and long numbers/tokens", () => {
        const s = sanitizeErrorMessage(
            "fail user@example.com token=abcdefghijklmnopqrstuvwxyz012345 count=1234567",
        );
        expect(s).not.toContain("user@example.com");
        expect(s).toContain("[email]");
        expect(s).toContain("[num]");
        expect(s).toContain("[redacted]");
    });
    test("truncates long messages", () => {
        expect(sanitizeErrorMessage("x".repeat(200)).length).toBeLessThanOrEqual(120);
    });
});

describe("sanitizeErrorSource", () => {
    test("keeps pathname only", () => {
        expect(
            sanitizeErrorSource("https://example.com/app/main.js?v=1#x"),
        ).toBe("/app/main.js");
    });
});

describe("sanitizeErrorEvent", () => {
    test("combines fields", () => {
        expect(
            sanitizeErrorEvent({
                message: "boom",
                source: "https://a.com/x.js",
            }),
        ).toEqual({ message: "boom", source: "/x.js" });
    });
});

describe("shouldSampleError", () => {
    test("rate", () => {
        expect(shouldSampleError(() => 0)).toBe(true);
        expect(shouldSampleError(() => ERROR_SAMPLE_RATE)).toBe(false);
    });
});
