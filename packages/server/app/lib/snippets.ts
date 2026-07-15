/** Shared snippet builders (used by console code page & tests). */

export function sanitizeSiteId(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return "mysite";
    const cleaned = trimmed.replace(/[^a-zA-Z0-9._-]/g, "");
    return cleaned || "mysite";
}

export function buildHtmlSnippet(origin: string, siteId: string) {
    const sid = sanitizeSiteId(siteId);
    return `<script
    id="qingstat-script"
    data-site-id="${sid}"
    src="${origin}/tracker.js"
    defer
></script>`;
}

export function buildModuleSnippet(origin: string, siteId: string) {
    const sid = sanitizeSiteId(siteId);
    return `import * as Qingstat from "@qingstat/tracker";

Qingstat.init({
    siteId: "${sid}",
    reporterUrl: "${origin}/collect",
});`;
}
