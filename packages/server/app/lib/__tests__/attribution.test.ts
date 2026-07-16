import { describe, expect, test } from "vitest";

import {
    ATTRIBUTION_MODEL,
    ATTRIBUTION_WINDOW,
    DIRECT_LABEL,
    UNKNOWN_LABEL,
    attributeGoalHits,
    dimensionKeyForHit,
    hitMatchesGoal,
    hitsToPathCounts,
    sumCompletions,
    type AttributionRawHit,
} from "../attribution";
import { computeGoalCompletions, type Goal } from "../goals";

function goal(
    partial: Partial<Goal> & Pick<Goal, "goalType" | "matchValue">,
): Goal {
    return {
        goalId: "g1",
        siteId: "s1",
        name: "Test",
        matchMode: "exact",
        enabled: true,
        createdAt: "",
        updatedAt: "",
        ...partial,
    };
}

function hit(partial: Partial<AttributionRawHit> = {}): AttributionRawHit {
    return {
        path: "/thanks",
        referrer: "",
        utmSource: "",
        utmMedium: "",
        utmCampaign: "",
        utmTerm: "",
        utmContent: "",
        deviceType: "",
        country: "",
        count: 1,
        ...partial,
    };
}

describe("attribution constants", () => {
    test("model and window are fixed", () => {
        expect(ATTRIBUTION_MODEL).toBe("last-touch-conversion-hit");
        expect(ATTRIBUTION_WINDOW).toBe("report-interval");
    });
});

describe("hitMatchesGoal", () => {
    test("URL exact / prefix", () => {
        const exact = goal({
            goalType: "url",
            matchValue: "/thanks",
            matchMode: "exact",
        });
        expect(hitMatchesGoal(exact, hit({ path: "/thanks" }))).toBe(true);
        expect(hitMatchesGoal(exact, hit({ path: "/other" }))).toBe(false);

        const prefix = goal({
            goalType: "url",
            matchValue: "/checkout",
            matchMode: "prefix",
        });
        expect(
            hitMatchesGoal(prefix, hit({ path: "/checkout/done" })),
        ).toBe(true);
    });

    test("event goal", () => {
        const g = goal({ goalType: "event", matchValue: "purchase" });
        expect(
            hitMatchesGoal(g, hit({ path: "/__event__/purchase" })),
        ).toBe(true);
        expect(
            hitMatchesGoal(g, hit({ path: "/__event__/click" })),
        ).toBe(false);
    });
});

describe("dimensionKeyForHit Direct / Unknown", () => {
    test("empty referrer → (direct)", () => {
        expect(dimensionKeyForHit(hit({ referrer: "" }), "referrer")).toBe(
            DIRECT_LABEL,
        );
    });

    test("empty device/country/path → (unknown)", () => {
        expect(dimensionKeyForHit(hit({ deviceType: "" }), "deviceType")).toBe(
            UNKNOWN_LABEL,
        );
        expect(dimensionKeyForHit(hit({ country: "" }), "country")).toBe(
            UNKNOWN_LABEL,
        );
        expect(dimensionKeyForHit(hit({ path: "" }), "path")).toBe(
            UNKNOWN_LABEL,
        );
    });

    test("empty utmSource with no UTM and no referrer → (direct)", () => {
        expect(dimensionKeyForHit(hit(), "utmSource")).toBe(DIRECT_LABEL);
    });

    test("empty utmSource with referrer → (unknown)", () => {
        expect(
            dimensionKeyForHit(
                hit({ referrer: "https://google.com/" }),
                "utmSource",
            ),
        ).toBe(UNKNOWN_LABEL);
    });

    test("sourceType classifies direct / search / campaign", () => {
        expect(dimensionKeyForHit(hit(), "sourceType")).toBe("直接访问");
        expect(
            dimensionKeyForHit(
                hit({ referrer: "https://www.google.com/search?q=x" }),
                "sourceType",
            ),
        ).toBe("搜索引擎");
        expect(
            dimensionKeyForHit(
                hit({ utmSource: "newsletter", utmMedium: "email" }),
                "sourceType",
            ),
        ).toBe("活动");
        expect(
            dimensionKeyForHit(
                hit({ utmSource: "google", utmMedium: "cpc" }),
                "sourceType",
            ),
        ).toBe("广告");
        expect(
            dimensionKeyForHit(hit({ referrer: "not-a-url" }), "sourceType"),
        ).toBe("其他");
    });

    test("event props in utmContent do not force campaign sourceType", () => {
        // collect stores trackEvent props JSON in utmContent for errorEvent=2
        expect(
            dimensionKeyForHit(
                hit({
                    path: "/__event__/purchase",
                    utmContent: '{"plan":"pro"}',
                    referrer: "",
                }),
                "sourceType",
            ),
        ).toBe("直接访问");
        expect(
            dimensionKeyForHit(
                hit({
                    path: "/__event__/purchase",
                    utmSource: "newsletter",
                    utmMedium: "email",
                    utmContent: '{"plan":"pro"}',
                }),
                "sourceType",
            ),
        ).toBe("活动");
    });
});

describe("attributeGoalHits", () => {
    test("aggregates by dimension and sorts desc", () => {
        const g = goal({
            goalType: "url",
            matchValue: "/thanks",
            matchMode: "exact",
        });
        const rows = attributeGoalHits(
            g,
            [
                hit({ country: "US", count: 2 }),
                hit({ country: "CN", count: 5 }),
                hit({ country: "US", count: 3 }),
                hit({ path: "/other", country: "JP", count: 99 }),
            ],
            "country",
        );
        expect(rows).toEqual([
            { key: "CN", completions: 5 },
            { key: "US", completions: 5 },
        ]);
    });

    test("sourceType aggregation + topN", () => {
        const g = goal({
            goalType: "url",
            matchValue: "/thanks",
            matchMode: "exact",
        });
        const rows = attributeGoalHits(
            g,
            [
                hit({ count: 3 }),
                hit({
                    referrer: "https://www.google.com/",
                    count: 1,
                }),
                hit({ utmSource: "x", utmMedium: "email", count: 2 }),
            ],
            "sourceType",
            2,
        );
        expect(rows).toHaveLength(2);
        expect(rows[0].key).toBe("直接访问");
        expect(rows[0].completions).toBe(3);
        expect(sumCompletions(rows)).toBe(5);
    });

    test("prefix URL goals", () => {
        const g = goal({
            goalType: "url",
            matchValue: "/checkout",
            matchMode: "prefix",
        });
        const rows = attributeGoalHits(
            g,
            [
                hit({ path: "/checkout", deviceType: "desktop", count: 1 }),
                hit({
                    path: "/checkout/done",
                    deviceType: "mobile",
                    count: 4,
                }),
                hit({ path: "/home", deviceType: "desktop", count: 9 }),
            ],
            "deviceType",
        );
        expect(sumCompletions(rows)).toBe(5);
        expect(rows.find((r) => r.key === "mobile")?.completions).toBe(4);
    });

    test("sum of dimension rows equals computeGoalCompletions", () => {
        const g = goal({
            goalType: "url",
            matchValue: "/thanks",
            matchMode: "exact",
        });
        const hits = [
            hit({ path: "/thanks", country: "US", count: 2 }),
            hit({ path: "/thanks", country: "CN", count: 3 }),
            hit({ path: "/other", country: "JP", count: 7 }),
            hit({ path: "/thanks", country: "", count: 1 }),
        ];
        const rows = attributeGoalHits(g, hits, "country");
        const pathCounts = hitsToPathCounts(hits);
        expect(sumCompletions(rows)).toBe(computeGoalCompletions(g, pathCounts));
        expect(sumCompletions(rows)).toBe(6);
    });

    test("event goal sum consistency", () => {
        const g = goal({ goalType: "event", matchValue: "signup" });
        const hits = [
            hit({
                path: "/__event__/signup",
                utmSource: "twitter",
                count: 4,
            }),
            hit({ path: "/__event__/other", count: 2 }),
            hit({ path: "/__event__/signup", referrer: "", count: 1 }),
        ];
        const rows = attributeGoalHits(g, hits, "utmSource");
        expect(sumCompletions(rows)).toBe(
            computeGoalCompletions(g, hitsToPathCounts(hits)),
        );
        expect(sumCompletions(rows)).toBe(5);
    });
});
