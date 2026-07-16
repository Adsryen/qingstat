import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
    login,
    logout,
    requireAuth,
    requirePermission,
    getUser,
    isAuthEnabled,
} from "../auth";
import { createJWTCookie, clearJWTCookie } from "../session";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AnalyticsEngineDataset } from "@cloudflare/workers-types";

vi.mock("../session");
vi.mock("bcryptjs");
vi.mock("react-router", () => ({
    redirect: vi.fn((url, options) => ({ url, options })),
}));

const mockEnv = {
    CF_PASSWORD_HASH: "$2b$12$test.hash.value",
    CF_JWT_SECRET: "test-secret-key-for-jwt-signing-and-verification",
} as Env;

const mockEnvWithViewer = {
    ...mockEnv,
    CF_VIEWER_PASSWORD_HASH: "$2b$12$viewer.hash.value",
} as Env;

const mockEnvAuthDisabled = {
    CF_BEARER_TOKEN: "test-bearer-token",
    CF_ACCOUNT_ID: "test-account-id",
    CF_AUTH_ENABLED: "false",
    WEB_COUNTER_AE: {} as AnalyticsEngineDataset,
} as Env;

describe("auth", () => {
    beforeEach(() => {
        vi.mocked(createJWTCookie).mockReturnValue(
            "__qingstat_token=test-jwt; HttpOnly; Max-Age=2592000; Path=/; SameSite=Lax",
        );
        vi.mocked(clearJWTCookie).mockReturnValue(
            "__qingstat_token=; HttpOnly; Max-Age=0; Path=/; SameSite=Lax",
        );
        vi.mocked(bcrypt.compare).mockResolvedValue(true as any);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe("isAuthEnabled", () => {
        test("should return true when CF_AUTH_ENABLED is true", () => {
            const env = {
                ...mockEnv,
                CF_AUTH_ENABLED: "true",
            } as Env;

            expect(isAuthEnabled(env)).toBe(true);
        });

        test("should return false when CF_AUTH_ENABLED is false", () => {
            const env = {
                ...mockEnv,
                CF_AUTH_ENABLED: "false",
            } as Env;

            expect(isAuthEnabled(env)).toBe(false);
        });

        test("should return true when CF_AUTH_ENABLED is not set but password secrets exist", () => {
            //@ts-expect-error emulate missing var
            const env = {
                ...mockEnv,
                CF_AUTH_ENABLED: undefined,
            } as Env;

            expect(isAuthEnabled(env)).toBe(true);
        });

        test("should throw error when CF_AUTH_ENABLED is true but password secrets are missing", () => {
            const env = {
                CF_AUTH_ENABLED: "true",
                CF_BEARER_TOKEN: "test-bearer-token",
                CF_ACCOUNT_ID: "test-account-id",
            } as Env;

            expect(() => isAuthEnabled(env)).toThrow(
                "Authentication is enabled but password secrets are missing",
            );
        });
    });

    describe("login", () => {
        test("should login successfully with correct password as admin", async () => {
            const request = new Request("http://localhost");

            const result = await login(request, "test-password", mockEnv);

            expect(bcrypt.compare).toHaveBeenCalledWith(
                "test-password",
                mockEnv.CF_PASSWORD_HASH,
            );
            expect(createJWTCookie).toHaveBeenCalledWith(expect.any(String));

            // Verify the JWT token that was created
            const createJWTCookieCall =
                vi.mocked(createJWTCookie).mock.calls[0][0];
            const decoded = jwt.verify(
                createJWTCookieCall,
                mockEnv.CF_JWT_SECRET,
            ) as jwt.JwtPayload;
            expect(decoded.authenticated).toBe(true);
            expect(decoded.role).toBe("admin");
            expect(decoded.iat).toBeTypeOf("number");
            expect(decoded.iss).toBe("Qingstat");

            expect(result).toEqual({
                url: "/console",
                options: {
                    headers: {
                        "Set-Cookie":
                            "__qingstat_token=test-jwt; HttpOnly; Max-Age=2592000; Path=/; SameSite=Lax",
                    },
                },
            });
        });

        test("should login as viewer when admin fails and viewer hash matches", async () => {
            vi.mocked(bcrypt.compare).mockImplementation(
                async (_pw, hash) => hash === mockEnvWithViewer.CF_VIEWER_PASSWORD_HASH,
            );
            const request = new Request("http://localhost");

            await login(request, "viewer-password", mockEnvWithViewer);

            expect(bcrypt.compare).toHaveBeenCalledWith(
                "viewer-password",
                mockEnv.CF_PASSWORD_HASH,
            );
            expect(bcrypt.compare).toHaveBeenCalledWith(
                "viewer-password",
                mockEnvWithViewer.CF_VIEWER_PASSWORD_HASH,
            );

            const createJWTCookieCall =
                vi.mocked(createJWTCookie).mock.calls[0][0];
            const decoded = jwt.verify(
                createJWTCookieCall,
                mockEnv.CF_JWT_SECRET,
            ) as jwt.JwtPayload;
            expect(decoded.authenticated).toBe(true);
            expect(decoded.role).toBe("viewer");
        });

        test("should throw error with incorrect password", async () => {
            vi.mocked(bcrypt.compare).mockResolvedValue(false as any);
            const request = new Request("http://localhost");

            await expect(
                login(request, "wrong-password", mockEnv),
            ).rejects.toThrow("Invalid password");

            expect(bcrypt.compare).toHaveBeenCalledWith(
                "wrong-password",
                mockEnv.CF_PASSWORD_HASH,
            );
        });

        test("should not try viewer hash when not configured", async () => {
            vi.mocked(bcrypt.compare).mockResolvedValue(false as any);
            const request = new Request("http://localhost");

            await expect(
                login(request, "wrong-password", mockEnv),
            ).rejects.toThrow("Invalid password");

            expect(bcrypt.compare).toHaveBeenCalledTimes(1);
        });

        test("should redirect to dashboard when auth is disabled", async () => {
            const request = new Request("http://localhost");

            const result = await login(
                request,
                "any-password",
                mockEnvAuthDisabled,
            );

            // Should not attempt to verify password
            expect(bcrypt.compare).not.toHaveBeenCalled();

            // Should redirect directly to dashboard without setting cookie
            expect(result).toEqual({
                url: "/console",
                options: undefined,
            });
        });
    });

    describe("logout", () => {
        test("should logout successfully", async () => {
            const request = new Request("http://localhost", {
                headers: { Cookie: "__qingstat_token=some-jwt" },
            });

            const result = await logout(request, mockEnv);

            expect(clearJWTCookie).toHaveBeenCalled();
            expect(result).toEqual({
                url: "/",
                options: {
                    headers: {
                        "Set-Cookie":
                            "__qingstat_token=; HttpOnly; Max-Age=0; Path=/; SameSite=Lax",
                    },
                },
            });
        });

        test("should handle request without cookie header", async () => {
            const request = new Request("http://localhost");

            const result = await logout(request, mockEnv);

            expect(clearJWTCookie).toHaveBeenCalled();
            expect(result).toEqual({
                url: "/",
                options: {
                    headers: {
                        "Set-Cookie":
                            "__qingstat_token=; HttpOnly; Max-Age=0; Path=/; SameSite=Lax",
                    },
                },
            });
        });
    });

    describe("requireAuth", () => {
        test("should return user when authenticated", async () => {
            // Create a real JWT token for testing
            const validToken = jwt.sign(
                {
                    authenticated: true,
                    role: "admin",
                    iat: Math.floor(Date.now() / 1000),
                },
                mockEnv.CF_JWT_SECRET,
                { expiresIn: "30d", issuer: "Qingstat" },
            );

            const request = new Request("http://localhost", {
                headers: { Cookie: `__qingstat_token=${validToken}` },
            });

            const result = await requireAuth(request, mockEnv);

            expect(result).toEqual({ authenticated: true, role: "admin" });
        });

        test("should redirect when not authenticated", async () => {
            const request = new Request("http://localhost");

            await expect(requireAuth(request, mockEnv)).rejects.toEqual({
                url: "/login",
                options: undefined,
            });
        });

        test("should redirect when JWT is invalid", async () => {
            const request = new Request("http://localhost", {
                headers: { Cookie: "__qingstat_token=invalid-jwt" },
            });

            await expect(requireAuth(request, mockEnv)).rejects.toEqual({
                url: "/login",
                options: undefined,
            });
        });

        test("should redirect when JWT is expired", async () => {
            // Create an expired token
            const expiredToken = jwt.sign(
                { authenticated: true, iat: Math.floor(Date.now() / 1000) },
                mockEnv.CF_JWT_SECRET,
                { expiresIn: "-1s", issuer: "Qingstat" },
            );

            const request = new Request("http://localhost", {
                headers: { Cookie: `__qingstat_token=${expiredToken}` },
            });

            await expect(requireAuth(request, mockEnv)).rejects.toEqual({
                url: "/login",
                options: undefined,
            });
        });

        test("should always return authenticated admin when auth is disabled", async () => {
            const request = new Request("http://localhost");

            const result = await requireAuth(request, mockEnvAuthDisabled);

            expect(result).toEqual({ authenticated: true, role: "admin" });
        });
    });

    describe("requirePermission", () => {
        test("admin can sites.write", async () => {
            const validToken = jwt.sign(
                {
                    authenticated: true,
                    role: "admin",
                    iat: Math.floor(Date.now() / 1000),
                },
                mockEnv.CF_JWT_SECRET,
                { expiresIn: "30d", issuer: "Qingstat" },
            );
            const request = new Request("http://localhost", {
                headers: { Cookie: `__qingstat_token=${validToken}` },
            });

            const user = await requirePermission(
                request,
                mockEnv,
                "sites.write",
            );
            expect(user.role).toBe("admin");
        });

        test("viewer denied sites.write with 403", async () => {
            const validToken = jwt.sign(
                {
                    authenticated: true,
                    role: "viewer",
                    iat: Math.floor(Date.now() / 1000),
                },
                mockEnv.CF_JWT_SECRET,
                { expiresIn: "30d", issuer: "Qingstat" },
            );
            const request = new Request("http://localhost", {
                headers: { Cookie: `__qingstat_token=${validToken}` },
            });

            try {
                await requirePermission(request, mockEnv, "sites.write");
                expect.unreachable("should have thrown");
            } catch (err) {
                expect(err).toBeInstanceOf(Response);
                expect((err as Response).status).toBe(403);
            }
        });

        test("viewer allowed analytics.view", async () => {
            const validToken = jwt.sign(
                {
                    authenticated: true,
                    role: "viewer",
                    iat: Math.floor(Date.now() / 1000),
                },
                mockEnv.CF_JWT_SECRET,
                { expiresIn: "30d", issuer: "Qingstat" },
            );
            const request = new Request("http://localhost", {
                headers: { Cookie: `__qingstat_token=${validToken}` },
            });

            const user = await requirePermission(
                request,
                mockEnv,
                "analytics.view",
            );
            expect(user.role).toBe("viewer");
        });

        test("legacy JWT without role treated as admin for writes", async () => {
            const validToken = jwt.sign(
                { authenticated: true, iat: Math.floor(Date.now() / 1000) },
                mockEnv.CF_JWT_SECRET,
                { expiresIn: "30d", issuer: "Qingstat" },
            );
            const request = new Request("http://localhost", {
                headers: { Cookie: `__qingstat_token=${validToken}` },
            });

            const user = await requirePermission(
                request,
                mockEnv,
                "sites.write",
            );
            expect(user.role).toBe("admin");
        });
    });

    describe("getUser", () => {
        test("should return user object when authenticated with valid JWT", async () => {
            // Create a real JWT token for testing
            const validToken = jwt.sign(
                {
                    authenticated: true,
                    role: "admin",
                    iat: Math.floor(Date.now() / 1000),
                },
                mockEnv.CF_JWT_SECRET,
                { expiresIn: "30d", issuer: "Qingstat" },
            );

            const request = new Request("http://localhost", {
                headers: { Cookie: `__qingstat_token=${validToken}` },
            });

            const result = await getUser(request, mockEnv);

            expect(result).toEqual({ authenticated: true, role: "admin" });
        });

        test("legacy JWT without role defaults to admin", async () => {
            const validToken = jwt.sign(
                { authenticated: true, iat: Math.floor(Date.now() / 1000) },
                mockEnv.CF_JWT_SECRET,
                { expiresIn: "30d", issuer: "Qingstat" },
            );

            const request = new Request("http://localhost", {
                headers: { Cookie: `__qingstat_token=${validToken}` },
            });

            const result = await getUser(request, mockEnv);
            expect(result).toEqual({ authenticated: true, role: "admin" });
        });

        test("viewer role from JWT", async () => {
            const validToken = jwt.sign(
                {
                    authenticated: true,
                    role: "viewer",
                    iat: Math.floor(Date.now() / 1000),
                },
                mockEnv.CF_JWT_SECRET,
                { expiresIn: "30d", issuer: "Qingstat" },
            );

            const request = new Request("http://localhost", {
                headers: { Cookie: `__qingstat_token=${validToken}` },
            });

            const result = await getUser(request, mockEnv);
            expect(result).toEqual({ authenticated: true, role: "viewer" });
        });

        test("should return { authenticated: false } when no cookie header", async () => {
            const request = new Request("http://localhost");

            const result = await getUser(request, mockEnv);

            expect(result).toEqual({ authenticated: false });
        });

        test("should return { authenticated: false } when no JWT token in cookie", async () => {
            const request = new Request("http://localhost", {
                headers: { Cookie: "other-cookie=value" },
            });

            const result = await getUser(request, mockEnv);

            expect(result).toEqual({ authenticated: false });
        });

        test("should return { authenticated: false } when JWT is invalid", async () => {
            const request = new Request("http://localhost", {
                headers: { Cookie: "__qingstat_token=invalid-jwt" },
            });

            const result = await getUser(request, mockEnv);

            expect(result).toEqual({ authenticated: false });
        });

        test("should return { authenticated: false } when JWT is expired", async () => {
            // Create an expired token
            const expiredToken = jwt.sign(
                { authenticated: true, iat: Math.floor(Date.now() / 1000) },
                mockEnv.CF_JWT_SECRET,
                { expiresIn: "-1s", issuer: "Qingstat" },
            );

            const request = new Request("http://localhost", {
                headers: { Cookie: `__qingstat_token=${expiredToken}` },
            });

            const result = await getUser(request, mockEnv);

            expect(result).toEqual({ authenticated: false });
        });

        test("should return { authenticated: false } when JWT payload is not authenticated", async () => {
            // Create a token with authenticated: false
            const unauthenticatedToken = jwt.sign(
                { authenticated: false, iat: Math.floor(Date.now() / 1000) },
                mockEnv.CF_JWT_SECRET,
                { expiresIn: "30d", issuer: "Qingstat" },
            );

            const request = new Request("http://localhost", {
                headers: {
                    Cookie: `__qingstat_token=${unauthenticatedToken}`,
                },
            });

            const result = await getUser(request, mockEnv);

            expect(result).toEqual({ authenticated: false });
        });

        test("should return authenticated admin when JWT has wrong issuer", async () => {
            // Create a token with wrong issuer
            const wrongIssuerToken = jwt.sign(
                {
                    authenticated: true,
                    role: "admin",
                    iat: Math.floor(Date.now() / 1000),
                },
                mockEnv.CF_JWT_SECRET,
                { expiresIn: "30d", issuer: "wrong-issuer" },
            );

            const request = new Request("http://localhost", {
                headers: { Cookie: `__qingstat_token=${wrongIssuerToken}` },
            });

            const result = await getUser(request, mockEnv);

            // This should still work since the auth.ts doesn't validate issuer in verification
            expect(result).toEqual({ authenticated: true, role: "admin" });
        });

        test("should return { authenticated: false } when JWT signed with wrong secret", async () => {
            // Create a token with wrong secret
            const wrongSecretToken = jwt.sign(
                { authenticated: true, iat: Math.floor(Date.now() / 1000) },
                "wrong-secret",
                { expiresIn: "30d", issuer: "Qingstat" },
            );

            const request = new Request("http://localhost", {
                headers: { Cookie: `__qingstat_token=${wrongSecretToken}` },
            });

            const result = await getUser(request, mockEnv);

            expect(result).toEqual({ authenticated: false });
        });

        test("should always return authenticated admin when auth is disabled", async () => {
            const request = new Request("http://localhost");

            const result = await getUser(request, mockEnvAuthDisabled);

            expect(result).toEqual({ authenticated: true, role: "admin" });
        });
    });
});
