import { describe, expect, it } from "vitest";
import {
    buildElementKey,
    matchesExcludeSelector,
    normalizeActionUrl,
    sanitizeHeatmapClick,
    type HeatmapClickCandidate,
} from "../heatmap-types";

function base(
    partial: Partial<HeatmapClickCandidate> &
        Pick<HeatmapClickCandidate, "mode" | "tagName">,
): HeatmapClickCandidate {
    return {
        clientX: 100,
        clientY: 200,
        viewportWidth: 1000,
        viewportHeight: 800,
        scrollY: 0,
        documentHeight: 2000,
        pagePath: "/home",
        pageVersion: "v1",
        deviceBucket: "desktop",
        sampleRate: 0.1,
        ...partial,
    };
}

describe("matchesExcludeSelector", () => {
    it("matches tag, #id, .class, and attribute selectors", () => {
        const el = {
            tagName: "BUTTON",
            id: "checkout",
            className: "btn private",
            type: "submit",
            dataPrivate: true,
            testId: "pay-btn",
        };
        expect(matchesExcludeSelector(el, "button")).toBe(true);
        expect(matchesExcludeSelector(el, "#checkout")).toBe(true);
        expect(matchesExcludeSelector(el, ".private")).toBe(true);
        expect(matchesExcludeSelector(el, "button#checkout")).toBe(true);
        expect(matchesExcludeSelector(el, "[data-private]")).toBe(true);
        expect(matchesExcludeSelector(el, "[type=submit]")).toBe(true);
        expect(matchesExcludeSelector(el, "[data-testid=pay-btn]")).toBe(true);
        expect(matchesExcludeSelector(el, ".other")).toBe(false);
        expect(matchesExcludeSelector(el, "#nope")).toBe(false);
    });
});

describe("buildElementKey", () => {
    it("uses tag + safe id + testid only (no full path)", () => {
        expect(
            buildElementKey({
                tagName: "A",
                id: "nav-home",
                testId: "link-home",
                className: "x y",
            }),
        ).toBe("a#nav-home[data-testid=link-home]");

        // unsafe id dropped
        expect(
            buildElementKey({
                tagName: "DIV",
                id: "123-bad",
            }),
        ).toBe("div");
    });
});

describe("normalizeActionUrl", () => {
    it("keeps path only and rejects dangerous schemes", () => {
        expect(normalizeActionUrl("/pricing?utm=1#x")).toBe("/pricing");
        expect(normalizeActionUrl("https://ex.com/a/b?q=1")).toBe("/a/b");
        expect(normalizeActionUrl("javascript:alert(1)")).toBeNull();
        expect(normalizeActionUrl("data:text/html,hi")).toBeNull();
        expect(normalizeActionUrl("mailto:a@b.c")).toBeNull();
        expect(normalizeActionUrl("#section")).toBeNull();
    });
});

describe("sanitizeHeatmapClick drops", () => {
    it("drops input / textarea / select / contenteditable", () => {
        for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
            const r = sanitizeHeatmapClick(base({ mode: "coordinate", tagName }));
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.reason).toContain("sensitive_tag");
        }
        const ce = sanitizeHeatmapClick(
            base({
                mode: "coordinate",
                tagName: "DIV",
                isContentEditable: true,
            }),
        );
        expect(ce.ok).toBe(false);
        if (!ce.ok) expect(ce.reason).toBe("contenteditable");
    });

    it("drops password type and role=textbox", () => {
        const pw = sanitizeHeatmapClick(
            base({ mode: "element", tagName: "INPUT", type: "password" }),
        );
        // INPUT already sensitive; also password type path
        expect(pw.ok).toBe(false);

        const role = sanitizeHeatmapClick(
            base({ mode: "coordinate", tagName: "DIV", role: "textbox" }),
        );
        expect(role.ok).toBe(false);
        if (!role.ok) expect(role.reason).toContain("textbox");
    });

    it("drops data-private and exclude selectors", () => {
        const priv = sanitizeHeatmapClick(
            base({
                mode: "coordinate",
                tagName: "DIV",
                dataPrivate: true,
            }),
        );
        expect(priv.ok).toBe(false);

        const ex = sanitizeHeatmapClick(
            base({
                mode: "coordinate",
                tagName: "BUTTON",
                id: "pay",
                excludeSelectors: ["#pay", ".secret"],
            }),
        );
        expect(ex.ok).toBe(false);
        if (!ex.ok) expect(ex.reason).toContain("exclude_selector");
    });

    it("optionally drops submit in password form", () => {
        const r = sanitizeHeatmapClick(
            base({
                mode: "element",
                tagName: "BUTTON",
                type: "submit",
                inPasswordForm: true,
            }),
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe("submit_in_password_form");
    });

    it("drops invalid link href schemes", () => {
        const r = sanitizeHeatmapClick(
            base({
                mode: "link",
                tagName: "A",
                href: "javascript:void(0)",
            }),
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe("invalid_or_sensitive_href");
    });
});

describe("sanitizeHeatmapClick allows", () => {
    it("coordinate mode stores ratios only and clamps", () => {
        const r = sanitizeHeatmapClick(
            base({
                mode: "coordinate",
                tagName: "DIV",
                clientX: 500,
                clientY: 400,
                viewportWidth: 1000,
                viewportHeight: 800,
                scrollY: 200,
                documentHeight: 2000,
            }),
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.event.xRatio).toBe(0.5);
        // pageY = 200+400=600 / 2000 = 0.3
        expect(r.event.yRatio).toBe(0.3);
        expect(r.event.viewportWidth).toBe(1000);
        expect(r.event).not.toHaveProperty("textContent");
        expect(r.event).not.toHaveProperty("value");
        expect(r.event).not.toHaveProperty("innerHTML");
        expect(r.event.sampleRate).toBe(0.1);
    });

    it("element mode builds stable key without full CSS path", () => {
        const r = sanitizeHeatmapClick(
            base({
                mode: "element",
                tagName: "BUTTON",
                id: "cta-buy",
                testId: "buy",
                className: "btn btn-primary",
            }),
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.event.elementKey).toBe("button#cta-buy[data-testid=buy]");
        expect(JSON.stringify(r.event)).not.toContain("btn-primary");
    });

    it("link mode normalizes path and strips query/hash", () => {
        const r = sanitizeHeatmapClick(
            base({
                mode: "link",
                tagName: "A",
                href: "https://example.com/docs/start?utm_source=x#top",
                id: "docs",
            }),
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.event.actionUrl).toBe("/docs/start");
        expect(r.event.elementKey).toBe("a#docs");
    });

    it("never leaks textContent even if present on input object", () => {
        const dirty = {
            ...base({ mode: "coordinate", tagName: "SPAN" }),
            textContent: "secret email@x.com",
            value: "password123",
            innerHTML: "<b>x</b>",
        } as HeatmapClickCandidate & {
            textContent: string;
            value: string;
            innerHTML: string;
        };
        const r = sanitizeHeatmapClick(dirty);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const json = JSON.stringify(r.event);
        expect(json).not.toContain("secret");
        expect(json).not.toContain("password123");
        expect(json).not.toContain("innerHTML");
        expect(json).not.toContain("email@");
    });
});
