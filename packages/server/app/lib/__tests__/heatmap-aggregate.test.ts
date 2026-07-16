import { describe, expect, test } from "vitest";

import {
    bucketCoordinateHeat,
    blurHeatGrid,
    intensityToRgba,
    rankElements,
    rankLinks,
    splitByPageVersion,
} from "../heatmap-aggregate";

describe("bucketCoordinateHeat", () => {
    test("bins points into grid and tracks max", () => {
        const grid = bucketCoordinateHeat(
            [
                { xRatio: 0, yRatio: 0 },
                { xRatio: 0, yRatio: 0 },
                { xRatio: 1, yRatio: 1 },
                { xRatio: 0.5, yRatio: 0.5 },
            ],
            10,
            10,
        );
        expect(grid.width).toBe(10);
        expect(grid.height).toBe(10);
        expect(grid.pointCount).toBe(4);
        expect(grid.cells[0]).toBe(2); // two points at 0,0
        expect(grid.max).toBeGreaterThanOrEqual(2);
        // 1.0 maps to last cell
        expect(grid.cells[9 * 10 + 9]).toBe(1);
    });

    test("clamps out-of-range ratios", () => {
        const grid = bucketCoordinateHeat(
            [
                { xRatio: -1, yRatio: 2 },
                { xRatio: 1.5, yRatio: -0.2 },
            ],
            4,
            4,
        );
        expect(grid.pointCount).toBe(2);
        // y=2 clamps to 1 → last row index 3; x=-1 → 0
        expect(grid.cells[3 * 4 + 0]).toBe(1);
        // x=1.5 → last col 3, y=-0.2 → 0
        expect(grid.cells[0 * 4 + 3]).toBe(1);
    });
});

describe("blurHeatGrid", () => {
    test("spreads intensity to neighbors", () => {
        const base = bucketCoordinateHeat([{ xRatio: 0.5, yRatio: 0.5 }], 5, 5);
        const blurred = blurHeatGrid(base, 1);
        expect(blurred.pointCount).toBe(1);
        // center still positive; neighbors should pick up some intensity
        const centerIdx = 2 * 5 + 2;
        expect(blurred.cells[centerIdx]).toBeGreaterThan(0);
        expect(blurred.cells[centerIdx - 1]).toBeGreaterThan(0);
    });
});

describe("rankElements / rankLinks", () => {
    test("returns top-N with share", () => {
        const elements = rankElements(
            [
                { elementKey: "a#nav" },
                { elementKey: "a#nav" },
                { elementKey: "button#cta" },
                { elementKey: undefined },
            ],
            10,
        );
        expect(elements[0]).toEqual({
            key: "a#nav",
            count: 2,
            share: 2 / 3,
        });
        expect(elements[1].key).toBe("button#cta");

        const links = rankLinks(
            [
                { actionUrl: "/pricing" },
                { actionUrl: "/pricing" },
                { actionUrl: "/docs" },
                { actionUrl: "/pricing" },
            ],
            1,
        );
        expect(links).toHaveLength(1);
        expect(links[0].key).toBe("/pricing");
        expect(links[0].count).toBe(3);
    });
});

describe("splitByPageVersion", () => {
    test("buckets by pageVersion", () => {
        const map = splitByPageVersion([
            { pageVersion: "v1", xRatio: 0.1, yRatio: 0.1 },
            { pageVersion: "v2", xRatio: 0.2, yRatio: 0.2 },
            { pageVersion: "v1", xRatio: 0.3, yRatio: 0.3 },
            { xRatio: 0.4, yRatio: 0.4 },
        ]);
        expect(map.get("v1")).toHaveLength(2);
        expect(map.get("v2")).toHaveLength(1);
        expect(map.get("unknown")).toHaveLength(1);
    });
});

describe("intensityToRgba", () => {
    test("returns cool at 0 and hot at 1", () => {
        const cold = intensityToRgba(0);
        const hot = intensityToRgba(1);
        expect(cold[2]).toBe(255); // blue
        expect(hot[0]).toBe(255); // red
        expect(hot[1]).toBe(0);
    });
});
