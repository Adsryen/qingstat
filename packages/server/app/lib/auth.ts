import { redirect } from "react-router";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createJWTCookie, clearJWTCookie } from "./session";
import { User } from "./types";
import {
    can,
    parseRole,
    type Permission,
    type Role,
} from "./permissions";

/**
 * Checks if authentication is enabled based on environment variables
 */
export function isAuthEnabled(env: Env): boolean {
    // Explicitly disabled
    if (env.CF_AUTH_ENABLED === "false") {
        return false;
    }

    // Explicitly enabled
    if (env.CF_AUTH_ENABLED === "true") {
        // Require both secrets to be present for auth to work
        if (!env.CF_PASSWORD_HASH || !env.CF_JWT_SECRET) {
            throw new Error(
                "Authentication is enabled but password secrets are missing",
            );
        }
        return true;
    }

    // If not explicitly set but password hash exists, consider auth enabled
    if (!env.CF_AUTH_ENABLED && env.CF_PASSWORD_HASH && env.CF_JWT_SECRET) {
        return true;
    }

    return false;
}

export async function login(_request: Request, password: string, env: Env) {
    // If auth is disabled, redirect directly to console
    if (!isAuthEnabled(env)) {
        return redirect("/console");
    }

    let role: Role | null = null;

    const isAdmin = await bcrypt.compare(password, env.CF_PASSWORD_HASH);
    if (isAdmin) {
        role = "admin";
    } else if (env.CF_VIEWER_PASSWORD_HASH) {
        const isViewer = await bcrypt.compare(
            password,
            env.CF_VIEWER_PASSWORD_HASH,
        );
        if (isViewer) {
            role = "viewer";
        }
    }

    if (!role) {
        throw new Error("Invalid password");
    }

    const token = jwt.sign(
        {
            authenticated: true,
            role,
            iat: Math.floor(Date.now() / 1000),
        },
        env.CF_JWT_SECRET,
        {
            expiresIn: "30d",
            issuer: "Qingstat",
        },
    );

    return redirect("/console", {
        headers: {
            "Set-Cookie": createJWTCookie(token),
        },
    });
}

export async function logout(_request: Request, _env: Env) {
    return redirect("/", {
        headers: {
            "Set-Cookie": clearJWTCookie(),
        },
    });
}

export async function requireAuth(request: Request, env: Env) {
    // If auth is disabled, allow access without checking (full admin)
    if (!isAuthEnabled(env)) {
        return { authenticated: true, role: "admin" as const };
    }

    const user = await getUser(request, env);

    if (!user.authenticated) {
        // Password only protects the console, not the public front page
        throw redirect("/login");
    }

    return user;
}

/**
 * Require authentication + a specific permission.
 * Throws Response 403 when the role cannot perform the action.
 */
export async function requirePermission(
    request: Request,
    env: Env,
    permission: Permission,
): Promise<User> {
    const user = await requireAuth(request, env);
    const role = user.role ?? "admin";
    if (!can(role, permission)) {
        throw new Response(
            `Forbidden: role "${role}" cannot perform "${permission}"`,
            { status: 403 },
        );
    }
    return { ...user, role };
}

export async function getUser(request: Request, env: Env): Promise<User> {
    // If auth is disabled, user is always authenticated as admin
    if (!isAuthEnabled(env)) {
        return { authenticated: true, role: "admin" };
    }

    try {
        const cookieHeader = request.headers.get("Cookie");
        if (!cookieHeader) {
            return { authenticated: false };
        }

        // Extract JWT from cookie
        const cookies = cookieHeader.split(";").reduce(
            (acc, cookie) => {
                const [key, value] = cookie.trim().split("=");
                acc[key] = value;
                return acc;
            },
            {} as Record<string, string>,
        );

        const token = cookies["__qingstat_token"];
        if (!token) {
            return { authenticated: false };
        }

        const decoded = jwt.verify(
            token,
            env.CF_JWT_SECRET,
        ) as jwt.JwtPayload;

        if (decoded.authenticated) {
            // Legacy cookies without role → admin
            return {
                authenticated: true,
                role: parseRole(decoded.role),
            };
        }

        return { authenticated: false };
    } catch {
        // JWT verification failed
        return { authenticated: false };
    }
}
