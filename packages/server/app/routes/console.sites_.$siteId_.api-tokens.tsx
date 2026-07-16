import type {
    ActionFunctionArgs,
    LoaderFunctionArgs,
    MetaFunction,
} from "react-router";
import {
    Form,
    Link,
    useActionData,
    useLoaderData,
    useNavigation,
} from "react-router";
import { requireAuth } from "~/lib/auth";
import {
    createApiToken,
    listApiTokens,
    revokeApiToken,
    type ApiToken,
} from "~/lib/api-tokens";
import { V1_REPORT_OPTIONS } from "~/lib/api-v1-reports";
import { getSite } from "~/lib/sites";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";

export const meta: MetaFunction = () => {
    return [{ title: "API Tokens · 轻统计" }];
};

export async function loader({ request, context, params }: LoaderFunctionArgs) {
    await requireAuth(request, context.cloudflare.env);
    const siteId = params.siteId || "";
    const db = context.cloudflare.env.DB;
    if (!db) {
        throw new Response("D1 not configured", { status: 501 });
    }
    const site = await getSite(db, siteId);
    if (!site) {
        throw new Response("Site not found", { status: 404 });
    }
    const tokens = await listApiTokens(db, siteId);
    return { site, tokens };
}

type ActionData =
    | { ok: true; message: string; plaintextToken?: string }
    | { ok: false; error: string };

export async function action({
    request,
    context,
    params,
}: ActionFunctionArgs): Promise<ActionData> {
    await requireAuth(request, context.cloudflare.env);
    const db = context.cloudflare.env.DB;
    if (!db) return { ok: false, error: "D1 not configured" };
    const siteId = params.siteId || "";
    const form = await request.formData();
    const intent = String(form.get("intent") || "");

    try {
        if (intent === "create") {
            const result = await createApiToken(db, {
                siteId,
                name: String(form.get("name") || ""),
            });
            return {
                ok: true,
                message: "Token created — copy it now; it will not be shown again.",
                plaintextToken: result.token,
            };
        }
        if (intent === "revoke") {
            const tokenId = String(form.get("tokenId") || "");
            const ok = await revokeApiToken(db, tokenId, siteId);
            if (!ok) return { ok: false, error: "Token not found" };
            return { ok: true, message: "Token revoked" };
        }
        return { ok: false, error: `Unknown intent: ${intent}` };
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : "Error",
        };
    }
}

function TokenRow({ token }: { token: ApiToken }) {
    const navigation = useNavigation();
    const busy = navigation.state === "submitting";
    const revoked = Boolean(token.revokedAt) || !token.enabled;

    return (
        <div className="border border-border/60 rounded-xl p-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium truncate">{token.name}</span>
                    {revoked ? (
                        <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium">
                            revoked
                        </span>
                    ) : (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 px-2 py-0.5 text-xs font-medium">
                            active
                        </span>
                    )}
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                    {token.tokenPrefix}…
                </div>
                <div className="text-xs text-muted-foreground">
                    created {token.createdAt}
                    {token.lastUsedAt ? ` · last used ${token.lastUsedAt}` : ""}
                    {token.revokedAt ? ` · revoked ${token.revokedAt}` : ""}
                </div>
            </div>
            {!revoked ? (
                <div className="flex gap-2 shrink-0">
                    <Form method="post">
                        <input type="hidden" name="intent" value="revoke" />
                        <input
                            type="hidden"
                            name="tokenId"
                            value={token.tokenId}
                        />
                        <Button
                            type="submit"
                            variant="outline"
                            size="sm"
                            className="rounded-xl"
                            disabled={busy}
                        >
                            Revoke
                        </Button>
                    </Form>
                </div>
            ) : null}
        </div>
    );
}

export default function ConsoleSiteApiTokens() {
    const { site, tokens } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const busy = navigation.state === "submitting";

    const reportList = V1_REPORT_OPTIONS.map((r) => r.id).join("|");
    const curlExample = `curl -sS -H "Authorization: Bearer qs_YOUR_TOKEN" \\
  "https://YOUR_HOST/api/v1/sites/${encodeURIComponent(site.siteId)}/reports/paths?interval=7d&timezone=UTC"`;

    return (
        <div className="max-w-3xl space-y-6">
            <div>
                <p className="text-sm text-muted-foreground mb-1">
                    <Link
                        to="/console/sites"
                        className="underline hover:text-foreground"
                    >
                        Sites
                    </Link>
                    {" / "}
                    <Link
                        to={`/console/sites/${encodeURIComponent(site.siteId)}`}
                        className="underline hover:text-foreground"
                    >
                        {site.name}
                    </Link>
                    {" / "}
                    <span>API</span>
                </p>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    API Tokens
                </h1>
                <p className="text-muted-foreground mt-1 text-sm">
                    Site-scoped read-only tokens for{" "}
                    <code className="bg-muted px-1 rounded">/api/v1/…</code>.
                    Secrets are hashed at rest; plaintext is shown only once at
                    creation. Rate limit: 60 requests / minute per token
                    (per-isolate memory).
                </p>
            </div>

            {actionData?.ok === false ? (
                <div
                    className="rounded-2xl border border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100 px-4 py-3 text-sm"
                    role="alert"
                >
                    {actionData.error}
                </div>
            ) : null}

            {actionData?.ok === true ? (
                <div
                    className="rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100 px-4 py-3 text-sm space-y-2"
                    role="status"
                >
                    <p>{actionData.message}</p>
                    {actionData.plaintextToken ? (
                        <div>
                            <p className="font-medium mb-1">
                                Copy this token now:
                            </p>
                            <code className="block break-all bg-background/60 border border-border/60 rounded-lg px-3 py-2 text-xs font-mono">
                                {actionData.plaintextToken}
                            </code>
                        </div>
                    ) : null}
                </div>
            ) : null}

            <Card className="rounded-2xl shadow-sm p-4 space-y-3">
                <h2 className="text-base font-semibold">Create token</h2>
                <Form method="post" className="flex flex-wrap gap-2 items-end">
                    <input type="hidden" name="intent" value="create" />
                    <label className="flex flex-col gap-1 text-sm">
                        <span className="text-muted-foreground">Name</span>
                        <input
                            name="name"
                            required
                            placeholder="CI / dashboard"
                            className="border border-border rounded-xl px-3 py-2 bg-background min-w-[12rem]"
                            disabled={busy}
                        />
                    </label>
                    <Button
                        type="submit"
                        className="rounded-xl"
                        disabled={busy}
                    >
                        Create
                    </Button>
                </Form>
            </Card>

            <Card className="rounded-2xl shadow-sm p-4 space-y-3">
                <h2 className="text-base font-semibold">
                    Tokens ({tokens.length})
                </h2>
                {tokens.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No tokens yet.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {tokens.map((token) => (
                            <TokenRow key={token.tokenId} token={token} />
                        ))}
                    </div>
                )}
            </Card>

            <Card className="rounded-2xl shadow-sm p-4 space-y-3">
                <h2 className="text-base font-semibold">Usage</h2>
                <p className="text-sm text-muted-foreground">
                    Endpoint:{" "}
                    <code className="bg-muted px-1 rounded text-xs">
                        GET /api/v1/sites/:siteId/reports/:report
                    </code>
                </p>
                <p className="text-sm text-muted-foreground">
                    Reports:{" "}
                    <code className="bg-muted px-1 rounded text-xs">
                        {reportList}
                    </code>
                </p>
                <p className="text-sm text-muted-foreground">
                    Query:{" "}
                    <code className="bg-muted px-1 rounded text-xs">
                        interval
                    </code>{" "}
                    (required: today|yesterday|1d|7d|30d|90d), optional{" "}
                    <code className="bg-muted px-1 rounded text-xs">
                        timezone
                    </code>{" "}
                    and dashboard filters (path, referrer, country, …).
                </p>
                <pre className="text-xs bg-muted/60 border border-border/60 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">
                    {curlExample}
                </pre>
            </Card>

            <div>
                <Link
                    to={`/console/sites/${encodeURIComponent(site.siteId)}`}
                    className="text-sm underline text-muted-foreground hover:text-foreground"
                >
                    Back to site
                </Link>
            </div>
        </div>
    );
}
