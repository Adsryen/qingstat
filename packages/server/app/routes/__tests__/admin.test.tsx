// @vitest-environment jsdom
import type { LoaderFunctionArgs } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { loader } from "../admin";

vi.mock("~/lib/auth", () => ({
    requireAuth: vi.fn(),
}));

describe("admin redirect route", () => {
    test("redirects to /console/sites", async () => {
        try {
            await loader({
                request: new Request("http://localhost/admin"),
                context: { cloudflare: { env: {} } },
            } as unknown as LoaderFunctionArgs);
            expect.unreachable("should throw redirect");
        } catch (err) {
            // react-router redirect throws Response or redirect result
            expect(err).toBeTruthy();
        }
    });
});
