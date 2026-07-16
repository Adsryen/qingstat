import { describe, expect, test } from "vitest";
import {
    can,
    parseRole,
    type Permission,
    type Role,
} from "../permissions";

const ALL_PERMISSIONS: Permission[] = [
    "analytics.view",
    "export.run",
    "sites.read",
    "sites.write",
    "goals.write",
    "funnels.write",
    "alerts.write",
    "api_tokens.write",
    "settings.write",
];

const VIEWER_ALLOWED: Permission[] = [
    "analytics.view",
    "export.run",
    "sites.read",
];

const VIEWER_DENIED: Permission[] = [
    "sites.write",
    "goals.write",
    "funnels.write",
    "alerts.write",
    "api_tokens.write",
    "settings.write",
];

describe("permissions", () => {
    describe("parseRole", () => {
        test("returns admin for null/undefined/legacy", () => {
            expect(parseRole(null)).toBe("admin");
            expect(parseRole(undefined)).toBe("admin");
            expect(parseRole("")).toBe("admin");
            expect(parseRole("admin")).toBe("admin");
            expect(parseRole("unknown")).toBe("admin");
            expect(parseRole(1)).toBe("admin");
        });

        test("returns viewer when value is viewer", () => {
            expect(parseRole("viewer")).toBe("viewer");
        });
    });

    describe("can matrix", () => {
        test.each(ALL_PERMISSIONS)("admin can %s", (permission) => {
            expect(can("admin", permission)).toBe(true);
        });

        test.each(VIEWER_ALLOWED)("viewer can %s", (permission) => {
            expect(can("viewer", permission)).toBe(true);
        });

        test.each(VIEWER_DENIED)("viewer cannot %s", (permission) => {
            expect(can("viewer", permission)).toBe(false);
        });

        test("covers every permission for both roles", () => {
            const roles: Role[] = ["admin", "viewer"];
            for (const role of roles) {
                for (const permission of ALL_PERMISSIONS) {
                    const allowed = can(role, permission);
                    if (role === "admin") {
                        expect(allowed).toBe(true);
                    } else {
                        expect(allowed).toBe(
                            VIEWER_ALLOWED.includes(permission),
                        );
                    }
                }
            }
        });
    });
});
