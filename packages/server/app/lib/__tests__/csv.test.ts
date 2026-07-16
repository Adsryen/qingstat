import { describe, expect, test } from "vitest";

import { CSV_BOM, escapeCsvCell, rowsToCsv } from "../csv";

describe("escapeCsvCell", () => {
    test("returns empty string for null and undefined", () => {
        expect(escapeCsvCell(null)).toBe("");
        expect(escapeCsvCell(undefined)).toBe("");
    });

    test("stringifies numbers without locale grouping", () => {
        expect(escapeCsvCell(0)).toBe("0");
        expect(escapeCsvCell(1234567)).toBe("1234567");
        expect(escapeCsvCell(3.14159)).toBe("3.14159");
    });

    test("leaves plain text unquoted", () => {
        expect(escapeCsvCell("hello")).toBe("hello");
        expect(escapeCsvCell("路径")).toBe("路径");
    });

    test("quotes cells containing comma, quote, CR, or LF", () => {
        expect(escapeCsvCell("a,b")).toBe('"a,b"');
        expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
        expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
        expect(escapeCsvCell("line1\rline2")).toBe('"line1\rline2"');
    });
});

describe("rowsToCsv", () => {
    test("starts with UTF-8 BOM for Excel Chinese support", () => {
        const csv = rowsToCsv(["metric", "value"], [["views", 10]]);
        expect(csv.startsWith(CSV_BOM)).toBe(true);
        expect(CSV_BOM).toBe("﻿");
    });

    test("joins header and rows with CRLF", () => {
        const csv = rowsToCsv(
            ["path", "visitors", "views"],
            [
                ["/home", 12, 34],
                ["/about", 5, 6],
            ],
        );
        const body = csv.slice(CSV_BOM.length);
        expect(body).toBe(
            "path,visitors,views\r\n/home,12,34\r\n/about,5,6",
        );
    });

    test("handles null cells and quoting in rows", () => {
        const csv = rowsToCsv(
            ["a", "b"],
            [
                [null, "x,y"],
                [undefined, 'q"z'],
            ],
        );
        const body = csv.slice(CSV_BOM.length);
        expect(body).toBe('a,b\r\n,"x,y"\r\n,"q""z"');
    });

    test("supports Chinese headers and values with BOM", () => {
        const csv = rowsToCsv(["来源", "访客"], [["直接访问", 100]]);
        expect(csv.startsWith(CSV_BOM)).toBe(true);
        expect(csv.includes("来源")).toBe(true);
        expect(csv.includes("直接访问")).toBe(true);
        expect(csv.includes("100")).toBe(true);
    });
});
