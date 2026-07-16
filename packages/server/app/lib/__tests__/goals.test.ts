import { describe, expect, test } from "vitest";

import {
    computeGoalCompletions,
    eventMatchesGoal,
    eventNameFromPath,
    pathMatchesGoal,
    type Goal,
} from "../goals";

function goal(partial: Partial<Goal> & Pick<Goal, "goalType" | "matchValue">): Goal {
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

describe("pathMatchesGoal", () => {
    test("exact / prefix / contains", () => {
        expect(pathMatchesGoal("/thanks", "/thanks", "exact")).toBe(true);
        expect(pathMatchesGoal("/thanks/", "/thanks", "exact")).toBe(false);
        expect(pathMatchesGoal("/checkout/done", "/checkout", "prefix")).toBe(
            true,
        );
        expect(pathMatchesGoal("/a/checkout/b", "checkout", "contains")).toBe(
            true,
        );
    });
});

describe("event matching", () => {
    test("parses event path and matches name", () => {
        expect(eventNameFromPath("/__event__/signup_click")).toBe(
            "signup_click",
        );
        expect(eventMatchesGoal("signup_click", "signup_click")).toBe(true);
        expect(eventMatchesGoal("signup_click", "other")).toBe(false);
    });
});

describe("computeGoalCompletions", () => {
    test("sums matching URL paths", () => {
        const g = goal({
            goalType: "url",
            matchValue: "/thanks",
            matchMode: "exact",
        });
        expect(
            computeGoalCompletions(g, [
                ["/thanks", 5],
                ["/other", 9],
                ["/thanks", 2],
            ]),
        ).toBe(7);
    });

    test("sums matching events", () => {
        const g = goal({ goalType: "event", matchValue: "purchase" });
        expect(
            computeGoalCompletions(g, [
                ["/__event__/purchase", 3],
                ["/__event__/click", 4],
            ]),
        ).toBe(3);
    });
});
