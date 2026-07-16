import { describe, expect, test } from "vitest";

import {
    isBreaching,
    nextAlertTransition,
    normalizeWebhookUrl,
    validateThreshold,
    webhookHostname,
} from "../alerts";

describe("isBreaching", () => {
    test("drop_pct breaches when drop >= threshold", () => {
        expect(
            isBreaching({
                condition: "drop_pct",
                threshold: 50,
                current: 40,
                baseline: 100,
            }),
        ).toBe(true);
        expect(
            isBreaching({
                condition: "drop_pct",
                threshold: 50,
                current: 60,
                baseline: 100,
            }),
        ).toBe(false);
    });

    test("spike_pct breaches when rise >= threshold", () => {
        expect(
            isBreaching({
                condition: "spike_pct",
                threshold: 100,
                current: 250,
                baseline: 100,
            }),
        ).toBe(true);
        expect(
            isBreaching({
                condition: "spike_pct",
                threshold: 100,
                current: 150,
                baseline: 100,
            }),
        ).toBe(false);
    });

    test("below_abs uses absolute threshold", () => {
        expect(
            isBreaching({
                condition: "below_abs",
                threshold: 10,
                current: 5,
                baseline: 0,
            }),
        ).toBe(true);
        expect(
            isBreaching({
                condition: "below_abs",
                threshold: 10,
                current: 10,
                baseline: 0,
            }),
        ).toBe(false);
    });

    test("pct conditions do not breach when baseline is 0", () => {
        expect(
            isBreaching({
                condition: "drop_pct",
                threshold: 10,
                current: 0,
                baseline: 0,
            }),
        ).toBe(false);
        expect(
            isBreaching({
                condition: "spike_pct",
                threshold: 10,
                current: 100,
                baseline: 0,
            }),
        ).toBe(false);
    });
});

describe("nextAlertTransition", () => {
    test("requires consecutive breaches before fire", () => {
        const first = nextAlertTransition({
            status: "ok",
            breaching: true,
            consecutiveBreaches: 0,
            minConsecutive: 2,
        });
        expect(first).toEqual({
            status: "ok",
            consecutiveBreaches: 1,
            notify: null,
        });

        const second = nextAlertTransition({
            status: "ok",
            breaching: true,
            consecutiveBreaches: 1,
            minConsecutive: 2,
        });
        expect(second).toEqual({
            status: "firing",
            consecutiveBreaches: 2,
            notify: "fire",
        });
    });

    test("resets consecutive when not breaching", () => {
        const r = nextAlertTransition({
            status: "ok",
            breaching: false,
            consecutiveBreaches: 1,
            minConsecutive: 2,
        });
        expect(r).toEqual({
            status: "ok",
            consecutiveBreaches: 0,
            notify: null,
        });
    });

    test("resolve when leaving firing", () => {
        const r = nextAlertTransition({
            status: "firing",
            breaching: false,
            consecutiveBreaches: 3,
            minConsecutive: 2,
        });
        expect(r).toEqual({
            status: "ok",
            consecutiveBreaches: 0,
            notify: "resolve",
        });
    });

    test("stay firing without re-notify", () => {
        const r = nextAlertTransition({
            status: "firing",
            breaching: true,
            consecutiveBreaches: 2,
            minConsecutive: 2,
        });
        expect(r).toEqual({
            status: "firing",
            consecutiveBreaches: 3,
            notify: null,
        });
    });
});

describe("validation helpers", () => {
    test("threshold rules", () => {
        expect(validateThreshold("drop_pct", 10)).toBe(10);
        expect(() => validateThreshold("drop_pct", 0)).toThrow();
        expect(validateThreshold("below_abs", 0)).toBe(0);
        expect(() => validateThreshold("below_abs", -1)).toThrow();
    });

    test("webhook https only", () => {
        expect(normalizeWebhookUrl("https://hooks.example/x")).toBe(
            "https://hooks.example/x",
        );
        expect(normalizeWebhookUrl("")).toBe(null);
        expect(() => normalizeWebhookUrl("http://hooks.example/x")).toThrow();
        expect(webhookHostname("https://hooks.example/secret")).toBe(
            "hooks.example",
        );
    });
});
