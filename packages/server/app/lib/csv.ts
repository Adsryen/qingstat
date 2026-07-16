/** UTF-8 BOM so Excel opens Chinese CSV correctly. */
export const CSV_BOM = "﻿";

/**
 * Escape a single CSV cell per RFC4180.
 * - null/undefined → empty string
 * - numbers via String(n) (no locale grouping)
 * - quote when cell contains comma, quote, CR, or LF
 */
export function escapeCsvCell(
    value: string | number | null | undefined,
): string {
    if (value === null || value === undefined) {
        return "";
    }

    const text = typeof value === "number" ? String(value) : value;
    if (/[",\r\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

/**
 * Build a full CSV document with UTF-8 BOM, header row, and data rows.
 */
export function rowsToCsv(
    headers: string[],
    rows: Array<Array<string | number | null | undefined>>,
): string {
    const lines: string[] = [];
    lines.push(headers.map(escapeCsvCell).join(","));
    for (const row of rows) {
        lines.push(row.map(escapeCsvCell).join(","));
    }
    return CSV_BOM + lines.join("\r\n");
}
