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
import { requireAuth, requirePermission } from "~/lib/auth";
import {
    ALERT_CONDITIONS,
    ALERT_METRICS,
    ALERT_WINDOW_INTERVALS,
    createAlertRule,
    deleteAlertRule,
    getAlertRule,
    listAlertRules,
    listAlertStates,
    updateAlertRule,
    type AlertRule,
    type AlertState,
} from "~/lib/alerts";
import { getSite } from "~/lib/sites";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";

export const meta: MetaFunction = () => {
    return [{ title: "Alerts · 轻统计" }];
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
    const rules = await listAlertRules(db, siteId);
    const states = await listAlertStates(
        db,
        rules.map((r) => r.ruleId),
    );
    return {
        site,
        rules,
        states: Object.fromEntries(states.entries()) as Record<
            string,
            AlertState
        >,
    };
}

type ActionData =
    | { ok: true; message: string }
    | { ok: false; error: string };

export async function action({
    request,
    context,
    params,
}: ActionFunctionArgs): Promise<ActionData> {
    await requirePermission(request, context.cloudflare.env, "alerts.write");
    const db = context.cloudflare.env.DB;
    if (!db) return { ok: false, error: "D1 not configured" };
    const siteId = params.siteId || "";
    const form = await request.formData();
    const intent = String(form.get("intent") || "");

    try {
        if (intent === "create") {
            await createAlertRule(db, {
                siteId,
                name: String(form.get("name") || ""),
                metric: String(form.get("metric") || "views") as
                    | "views"
                    | "visitors",
                condition: String(form.get("condition") || "drop_pct") as
                    | "drop_pct"
                    | "spike_pct"
                    | "below_abs",
                threshold: Number(form.get("threshold")),
                windowInterval: String(form.get("windowInterval") || "1d"),
                webhookUrl: String(form.get("webhookUrl") || "") || null,
                silenceMinutes: form.get("silenceMinutes")
                    ? Number(form.get("silenceMinutes"))
                    : undefined,
                enabled: form.get("enabled") !== "off",
            });
            return { ok: true, message: "Alert rule created" };
        }
        if (intent === "toggle") {
            const ruleId = String(form.get("ruleId") || "");
            const existing = await getAlertRule(db, ruleId);
            if (!existing || existing.siteId !== siteId) {
                return { ok: false, error: "Alert rule not found" };
            }
            const enabled = form.get("enabled") === "1";
            await updateAlertRule(db, ruleId, { enabled });
            return { ok: true, message: enabled ? "Enabled" : "Disabled" };
        }
        if (intent === "delete") {
            const ruleId = String(form.get("ruleId") || "");
            const existing = await getAlertRule(db, ruleId);
            if (!existing || existing.siteId !== siteId) {
                return { ok: false, error: "Alert rule not found" };
            }
            await deleteAlertRule(db, ruleId);
            return { ok: true, message: "Deleted" };
        }
        return { ok: false, error: `Unknown intent: ${intent}` };
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : "Error",
        };
    }
}

function statusBadge(status: string | undefined) {
    if (status === "firing") {
        return (
            <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200 px-2 py-0.5 text-xs font-medium">
                firing
            </span>
        );
    }
    return (
        <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 px-2 py-0.5 text-xs font-medium">
            ok
        </span>
    );
}

function RuleRow({
    rule,
    state,
}: {
    rule: AlertRule;
    state: AlertState | undefined;
}) {
    const navigation = useNavigation();
    const busy = navigation.state === "submitting";
    return (
        <div className="border border-border/60 rounded-xl p-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium truncate">{rule.name}</span>
                    {statusBadge(state?.status)}
                    {!rule.enabled ? (
                        <span className="text-xs text-muted-foreground">
                            disabled
                        </span>
                    ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                    {rule.metric} · {rule.condition} · threshold{" "}
                    {rule.threshold}
                    {" · "}
                    window {rule.windowInterval}
                    {" · "}
                    silence {rule.silenceMinutes}m
                    {rule.webhookUrl ? " · webhook set" : " · no webhook"}
                </div>
                {state ? (
                    <div className="text-xs text-muted-foreground">
                        last value:{" "}
                        {state.lastValue === null || state.lastValue === undefined
                            ? "—"
                            : state.lastValue}
                        {" / baseline: "}
                        {state.lastBaseline === null ||
                        state.lastBaseline === undefined
                            ? "—"
                            : state.lastBaseline}
                        {" · consecutive: "}
                        {state.consecutiveBreaches}
                        {state.lastEvaluatedAt
                            ? ` · evaluated ${state.lastEvaluatedAt}`
                            : ""}
                    </div>
                ) : null}
                {state?.lastError ? (
                    <div className="text-xs text-amber-700 dark:text-amber-400">
                        last error: {state.lastError}
                    </div>
                ) : null}
            </div>
            <div className="flex gap-2 shrink-0">
                <Form method="post">
                    <input type="hidden" name="intent" value="toggle" />
                    <input type="hidden" name="ruleId" value={rule.ruleId} />
                    <input
                        type="hidden"
                        name="enabled"
                        value={rule.enabled ? "0" : "1"}
                    />
                    <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                    >
                        {rule.enabled ? "Disable" : "Enable"}
                    </Button>
                </Form>
                <Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="ruleId" value={rule.ruleId} />
                    <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                    >
                        Delete
                    </Button>
                </Form>
            </div>
        </div>
    );
}

export default function ConsoleSiteAlerts() {
    const { site, rules, states } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const busy = navigation.state === "submitting";

    return (
        <div className="max-w-3xl mx-auto p-4 space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold">Traffic alerts</h1>
                    <p className="text-sm text-muted-foreground">
                        Site <code>{site.siteId}</code> · PV/UV thresholds via
                        HTTPS webhook
                    </p>
                </div>
                <Button asChild variant="outline" size="sm">
                    <Link
                        to={`/console/sites/${encodeURIComponent(site.siteId)}`}
                    >
                        Back
                    </Link>
                </Button>
            </div>

            <p className="text-xs text-muted-foreground rounded-xl border border-border/60 px-3 py-2">
                Evaluation runs hourly in UTC (cron minute 20). A rule must
                breach for 2 consecutive checks before firing (reduces AE lag
                false positives). AE query results may lag real traffic by
                minutes.
            </p>

            {actionData ? (
                <p
                    className={
                        actionData.ok
                            ? "text-sm text-green-600"
                            : "text-sm text-red-600"
                    }
                >
                    {actionData.ok ? actionData.message : actionData.error}
                </p>
            ) : null}

            <Card className="p-4 space-y-3">
                <h2 className="text-sm font-semibold">Add alert rule</h2>
                <Form method="post" className="grid gap-3 md:grid-cols-2">
                    <input type="hidden" name="intent" value="create" />
                    <label className="text-xs space-y-1">
                        <span className="text-muted-foreground">Name</span>
                        <input
                            name="name"
                            required
                            placeholder="PV drop 50%"
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                        />
                    </label>
                    <label className="text-xs space-y-1">
                        <span className="text-muted-foreground">Metric</span>
                        <select
                            name="metric"
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                            defaultValue="views"
                        >
                            {ALERT_METRICS.map((m) => (
                                <option key={m} value={m}>
                                    {m}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="text-xs space-y-1">
                        <span className="text-muted-foreground">Condition</span>
                        <select
                            name="condition"
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                            defaultValue="drop_pct"
                        >
                            {ALERT_CONDITIONS.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="text-xs space-y-1">
                        <span className="text-muted-foreground">
                            Threshold (% or absolute)
                        </span>
                        <input
                            name="threshold"
                            type="number"
                            required
                            step="any"
                            min="0"
                            defaultValue={50}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                        />
                    </label>
                    <label className="text-xs space-y-1">
                        <span className="text-muted-foreground">Window</span>
                        <select
                            name="windowInterval"
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                            defaultValue="1d"
                        >
                            {ALERT_WINDOW_INTERVALS.map((w) => (
                                <option key={w} value={w}>
                                    {w}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="text-xs space-y-1">
                        <span className="text-muted-foreground">
                            Silence minutes
                        </span>
                        <input
                            name="silenceMinutes"
                            type="number"
                            min={1}
                            max={10080}
                            defaultValue={360}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                        />
                    </label>
                    <label className="text-xs space-y-1 md:col-span-2">
                        <span className="text-muted-foreground">
                            Webhook URL (HTTPS, optional)
                        </span>
                        <input
                            name="webhookUrl"
                            type="url"
                            placeholder="https://hooks.example.com/..."
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                        />
                    </label>
                    <div className="flex items-end">
                        <Button type="submit" disabled={busy}>
                            Create rule
                        </Button>
                    </div>
                </Form>
            </Card>

            <div className="space-y-2">
                <h2 className="text-sm font-semibold">
                    Rules ({rules.length})
                </h2>
                {rules.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No alert rules yet. Add a rule above; evaluation runs
                        on the hourly cron.
                    </p>
                ) : (
                    rules.map((r) => (
                        <RuleRow
                            key={r.ruleId}
                            rule={r}
                            state={states[r.ruleId]}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
