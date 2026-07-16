import { describe, expect, test } from "vitest";

import {
    aggregatePathFlow,
    collapseConsecutive,
    edgesFromSequence,
    normalizePath,
    OTHER_PATH,
    UNKNOWN_PATH,
    type PathFlowSequence,
} from "../path-flow";

describe("normalizePath", () => {
    test("trims and maps empty to (unknown)", () => {
        expect(normalizePath("/a")).toBe("/a");
        expect(normalizePath("  /b  ")).toBe("/b");
        expect(normalizePath("")).toBe(UNKNOWN_PATH);
        expect(normalizePath("   ")).toBe(UNKNOWN_PATH);
        expect(normalizePath(null)).toBe(UNKNOWN_PATH);
        expect(normalizePath(undefined)).toBe(UNKNOWN_PATH);
    });
});

describe("collapseConsecutive", () => {
    test("drops runs of the same path (SPA re-reports)", () => {
        expect(collapseConsecutive(["/a", "/a", "/b", "/b", "/b", "/a"])).toEqual([
            "/a",
            "/b",
            "/a",
        ]);
    });

    test("empty and single", () => {
        expect(collapseConsecutive([])).toEqual([]);
        expect(collapseConsecutive(["/only"])).toEqual(["/only"]);
    });
});

describe("edgesFromSequence", () => {
    test("emits adjacent hops", () => {
        expect(edgesFromSequence(["/a", "/b", "/c"])).toEqual([
            { from: "/a", to: "/b" },
            { from: "/b", to: "/c" },
        ]);
    });

    test("maxSteps truncates pages (first N pages → N-1 edges)", () => {
        const paths = ["/1", "/2", "/3", "/4", "/5", "/6"];
        expect(edgesFromSequence(paths, 5)).toEqual([
            { from: "/1", to: "/2" },
            { from: "/2", to: "/3" },
            { from: "/3", to: "/4" },
            { from: "/4", to: "/5" },
        ]);
        expect(edgesFromSequence(paths, 5)).toHaveLength(4);
        expect(edgesFromSequence(["/a"], 5)).toEqual([]);
        expect(edgesFromSequence(["/a", "/b"], 1)).toEqual([]);
    });
});

describe("aggregatePathFlow", () => {
    test("loop a→b→a yields two edges", () => {
        const sequences: PathFlowSequence[] = [
            { visitId: "v1", paths: ["/a", "/b", "/a"] },
        ];
        const result = aggregatePathFlow(sequences);
        expect(result.edges).toEqual(
            expect.arrayContaining([
                { from: "/a", to: "/b", visits: 1 },
                { from: "/b", to: "/a", visits: 1 },
            ]),
        );
        expect(result.edges).toHaveLength(2);
    });

    test("collapses consecutive duplicates before edges", () => {
        const sequences: PathFlowSequence[] = [
            { visitId: "v1", paths: ["/a", "/a", "/b", "/b"] },
        ];
        const result = aggregatePathFlow(sequences);
        expect(result.edges).toEqual([{ from: "/a", to: "/b", visits: 1 }]);
    });

    test("counts each hop once per visit across visits", () => {
        const sequences: PathFlowSequence[] = [
            { visitId: "v1", paths: ["/a", "/b"] },
            { visitId: "v2", paths: ["/a", "/b"] },
            { visitId: "v3", paths: ["/a", "/c"] },
        ];
        const result = aggregatePathFlow(sequences);
        const ab = result.edges.find((e) => e.from === "/a" && e.to === "/b");
        const ac = result.edges.find((e) => e.from === "/a" && e.to === "/c");
        expect(ab?.visits).toBe(2);
        expect(ac?.visits).toBe(1);
    });

    test("other aggregation remaps non-top nodes", () => {
        // Create many distinct nodes; only topNodes=2 kept
        const sequences: PathFlowSequence[] = [
            { visitId: "v1", paths: ["/hot", "/a"] },
            { visitId: "v2", paths: ["/hot", "/a"] },
            { visitId: "v3", paths: ["/hot", "/a"] },
            { visitId: "v4", paths: ["/hot", "/b"] },
            { visitId: "v5", paths: ["/hot", "/b"] },
            { visitId: "v6", paths: ["/cold1", "/cold2"] },
        ];
        const result = aggregatePathFlow(sequences, { topNodes: 2, topEdges: 40 });

        // /hot and /a should be the top two by endpoint frequency
        // /b, /cold1, /cold2 → (other)
        const froms = new Set(result.edges.flatMap((e) => [e.from, e.to]));
        // At most 2 original top + optional (other)
        const nonOther = [...froms].filter((p) => p !== OTHER_PATH);
        expect(nonOther.length).toBeLessThanOrEqual(2);
        expect(froms.has(OTHER_PATH) || nonOther.length <= 2).toBe(true);

        // Edges involving remapped cold path should use (other)
        const otherEdges = result.edges.filter(
            (e) => e.from === OTHER_PATH || e.to === OTHER_PATH,
        );
        expect(otherEdges.length).toBeGreaterThan(0);
    });

    test("keeps Other→Other when mass exists", () => {
        // Many rare paths that only connect to each other; all map to other
        const sequences: PathFlowSequence[] = [
            { visitId: "v1", paths: ["/r1", "/r2"] },
            { visitId: "v2", paths: ["/r3", "/r4"] },
            { visitId: "v3", paths: ["/hot", "/hot2"] },
            { visitId: "v4", paths: ["/hot", "/hot2"] },
            { visitId: "v5", paths: ["/hot", "/hot2"] },
        ];
        // topNodes=2 keeps /hot and /hot2; rare pairs → other→other
        const result = aggregatePathFlow(sequences, { topNodes: 2 });
        const oo = result.edges.find(
            (e) => e.from === OTHER_PATH && e.to === OTHER_PATH,
        );
        expect(oo).toBeDefined();
        expect(oo!.visits).toBe(2);
    });

    test("maxSteps applied inside aggregate", () => {
        const sequences: PathFlowSequence[] = [
            {
                visitId: "v1",
                paths: ["/1", "/2", "/3", "/4", "/5", "/6", "/7"],
            },
        ];
        const result = aggregatePathFlow(sequences, { maxSteps: 3 });
        // first 3 pages → 2 edges
        expect(result.edges).toHaveLength(2);
        expect(result.edges).toEqual([
            { from: "/1", to: "/2", visits: 1 },
            { from: "/2", to: "/3", visits: 1 },
        ]);
    });

    test("empty sequence after collapse yields no edges", () => {
        const result = aggregatePathFlow([
            { visitId: "v1", paths: [] },
            { visitId: "v2", paths: ["/only"] },
        ]);
        expect(result.edges).toEqual([]);
    });

    test("normalizes blank paths to (unknown)", () => {
        const result = aggregatePathFlow([
            { visitId: "v1", paths: ["", "  ", "/a"] },
        ]);
        // collapse consecutive unknowns → (unknown) → /a
        expect(result.edges).toEqual([
            { from: UNKNOWN_PATH, to: "/a", visits: 1 },
        ]);
    });

    test("note mentions caps and truncation flag", () => {
        const result = aggregatePathFlow([], {
            scannedVisits: 10,
            scannedPageviews: 100,
            truncated: true,
        });
        expect(result.note).toContain("5000");
        expect(result.note).toContain("truncated");
        expect(result.truncated).toBe(true);
        expect(result.scannedVisits).toBe(10);
        expect(result.scannedPageviews).toBe(100);
    });

    test("topEdges slices after sort", () => {
        const sequences: PathFlowSequence[] = Array.from({ length: 5 }, (_, i) => ({
            visitId: `v${i}`,
            paths: [`/from${i}`, `/to${i}`],
        }));
        // All equal weight 1; topEdges=2 keeps 2
        const result = aggregatePathFlow(sequences, {
            topNodes: 20,
            topEdges: 2,
        });
        expect(result.edges).toHaveLength(2);
    });
});
