/**
 * Open query API v1: GET /api/v1/sites/:siteId/reports/:report
 * Auth: Authorization Bearer qs_… (site-scoped API token)
 * Never exposes CF bearer / token secrets in responses.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { checkRateLimit } from "~/lib/api-rate-limit";
import { verifyBearerToken } from "~/lib/api-tokens";
import {
    buildV1Report,
    isV1Interval,
    isV1ReportId,
    V1_ALLOWED_INTERVALS,
    V1_REPORT_OPTIONS,
} from "~/lib/api-v1-reports";
import { getFiltersFromSearchParams } from "~/lib/utils";

type ErrorCode =
    | "unauthorized"
    | "forbidden"
    | "bad_request"
    | "rate_limited"
    | "not_found"
    | "upstream";

function jsonError(
    status: number,
    code: ErrorCode,
    message: string,
    extraHeaders?: Record<string, string>,
): Response {
    return new Response(
        JSON.stringify({ error: { code, message } }),
        {
            status,
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                ...extraHeaders,
            },
        },
    );
}

function jsonOk(body: unknown, extraHeaders?: Record<string, string>): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...extraHeaders,
        },
    });
}

const CORS_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
};

/** CORS preflight (Authorization header) — non-GET hits action in RR. */
export async function action({ request }: ActionFunctionArgs) {
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    return jsonError(405, "bad_request", "Method not allowed", CORS_HEADERS);
}

export async function loader({ request, context, params }: LoaderFunctionArgs) {
    const siteId = (params.siteId || "").trim();
    const report = (params.report || "").trim();

    if (!siteId) {
        return jsonError(400, "bad_request", "siteId is required", CORS_HEADERS);
    }
    if (!isV1ReportId(report)) {
        const allowed = V1_REPORT_OPTIONS.map((r) => r.id).join(", ");
        return jsonError(
            400,
            "bad_request",
            `Invalid report. Allowed: ${allowed}`,
            CORS_HEADERS,
        );
    }

    const db = context.cloudflare.env.DB;
    if (!db) {
        return jsonError(
            501,
            "upstream",
            "Database not configured",
            CORS_HEADERS,
        );
    }

    const authHeader = request.headers.get("Authorization");
    const verified = await verifyBearerToken(db, authHeader, siteId);
    if (verified.status === "unauthorized") {
        return jsonError(
            401,
            "unauthorized",
            "Missing or invalid Authorization Bearer token",
            CORS_HEADERS,
        );
    }
    if (verified.status === "forbidden") {
        return jsonError(
            403,
            "forbidden",
            "Token is not authorized for this site",
            CORS_HEADERS,
        );
    }

    const rate = checkRateLimit(verified.tokenId, Date.now());
    if (!rate.allowed) {
        return jsonError(429, "rate_limited", "Rate limit exceeded", {
            ...CORS_HEADERS,
            "Retry-After": String(rate.retryAfterSec),
        });
    }

    const url = new URL(request.url);
    const interval = url.searchParams.get("interval") || "";
    if (!isV1Interval(interval)) {
        return jsonError(
            400,
            "bad_request",
            `Invalid interval. Allowed: ${V1_ALLOWED_INTERVALS.join(", ")}`,
            CORS_HEADERS,
        );
    }
    const timezone = url.searchParams.get("timezone") || "UTC";
    const filters = getFiltersFromSearchParams(url.searchParams);

    try {
        const { columns, rows, truncated } = await buildV1Report(
            context.analyticsEngine,
            {
                siteId,
                report,
                interval,
                tz: timezone,
                filters,
            },
        );

        return jsonOk(
            {
                version: "v1",
                siteId,
                report,
                interval,
                timezone,
                generatedAt: new Date().toISOString(),
                truncated,
                columns,
                rows,
            },
            CORS_HEADERS,
        );
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Analytics query failed";
        // Never leak secrets; message is from AE client only.
        return jsonError(502, "upstream", message, CORS_HEADERS);
    }
}
