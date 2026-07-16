/**
 * RBAC MVP for single-tenant console.
 * API tokens / publicStats are separate subjects (see design.md).
 */

export type Role = "admin" | "viewer";

export type Permission =
    | "analytics.view"
    | "export.run"
    | "sites.read"
    | "sites.write"
    | "goals.write"
    | "funnels.write"
    | "alerts.write"
    | "api_tokens.write"
    | "settings.write";

const ADMIN_ONLY: ReadonlySet<Permission> = new Set([
    "sites.write",
    "goals.write",
    "funnels.write",
    "alerts.write",
    "api_tokens.write",
    "settings.write",
]);

/**
 * Parse JWT / form role values. Missing or unknown → admin (legacy cookies).
 */
export function parseRole(value: unknown): Role {
    if (value === "viewer") return "viewer";
    return "admin";
}

export function can(role: Role, permission: Permission): boolean {
    if (role === "admin") return true;
    // viewer: read/analytics/export only
    return !ADMIN_ONLY.has(permission);
}
