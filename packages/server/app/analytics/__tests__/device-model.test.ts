import { describe, expect, test } from "vitest";
import { normalizeDeviceModel } from "../collect";

describe("normalizeDeviceModel", () => {
    test("maps empty to (unknown)", () => {
        expect(normalizeDeviceModel(undefined)).toBe("(unknown)");
        expect(normalizeDeviceModel(null)).toBe("(unknown)");
        expect(normalizeDeviceModel("")).toBe("(unknown)");
        expect(normalizeDeviceModel("  ")).toBe("(unknown)");
    });
    test("trims model names", () => {
        expect(normalizeDeviceModel(" iPhone ")).toBe("iPhone");
    });
});
