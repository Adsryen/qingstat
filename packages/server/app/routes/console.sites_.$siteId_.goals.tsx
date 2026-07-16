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
    createGoal,
    deleteGoal,
    listGoals,
    updateGoal,
    type Goal,
} from "~/lib/goals";
import { getSite } from "~/lib/sites";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";

export const meta: MetaFunction = () => {
    return [{ title: "Goals · 轻统计" }];
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
    const goals = await listGoals(db, siteId);
    return { site, goals };
}

type ActionData =
    | { ok: true; message: string }
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
            await createGoal(db, {
                siteId,
                name: String(form.get("name") || ""),
                goalType: String(form.get("goalType") || "url") as "url" | "event",
                matchValue: String(form.get("matchValue") || ""),
                matchMode: String(form.get("matchMode") || "exact") as
                    | "exact"
                    | "prefix"
                    | "contains",
                enabled: form.get("enabled") !== "off",
            });
            return { ok: true, message: "Goal created" };
        }
        if (intent === "update") {
            const goalId = String(form.get("goalId") || "");
            await updateGoal(db, goalId, {
                name: String(form.get("name") || undefined) || undefined,
                matchValue:
                    String(form.get("matchValue") || undefined) || undefined,
                matchMode: String(form.get("matchMode") || undefined) as
                    | "exact"
                    | "prefix"
                    | "contains"
                    | undefined,
                enabled: form.has("enabled")
                    ? form.get("enabled") === "on"
                    : undefined,
            });
            return { ok: true, message: "Goal updated" };
        }
        if (intent === "toggle") {
            const goalId = String(form.get("goalId") || "");
            const enabled = form.get("enabled") === "1";
            await updateGoal(db, goalId, { enabled });
            return { ok: true, message: enabled ? "Enabled" : "Disabled" };
        }
        if (intent === "delete") {
            await deleteGoal(db, String(form.get("goalId") || ""));
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

function GoalRow({ goal }: { goal: Goal }) {
    const navigation = useNavigation();
    const busy = navigation.state === "submitting";
    return (
        <div className="border border-border/60 rounded-xl p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
                <div className="font-medium truncate">{goal.name}</div>
                <div className="text-xs text-muted-foreground">
                    {goal.goalType === "url" ? "URL" : "Event"} ·{" "}
                    <code className="text-xs">{goal.matchValue}</code>
                    {goal.goalType === "url" ? ` · ${goal.matchMode}` : ""}
                    {!goal.enabled ? " · disabled" : ""}
                </div>
            </div>
            <div className="flex gap-2 shrink-0">
                <Form method="post">
                    <input type="hidden" name="intent" value="toggle" />
                    <input type="hidden" name="goalId" value={goal.goalId} />
                    <input
                        type="hidden"
                        name="enabled"
                        value={goal.enabled ? "0" : "1"}
                    />
                    <Button type="submit" variant="outline" size="sm" disabled={busy}>
                        {goal.enabled ? "Disable" : "Enable"}
                    </Button>
                </Form>
                <Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="goalId" value={goal.goalId} />
                    <Button type="submit" variant="outline" size="sm" disabled={busy}>
                        Delete
                    </Button>
                </Form>
            </div>
        </div>
    );
}

export default function ConsoleSiteGoals() {
    const { site, goals } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const busy = navigation.state === "submitting";

    return (
        <div className="max-w-3xl mx-auto p-4 space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold">Conversion goals</h1>
                    <p className="text-sm text-muted-foreground">
                        Site <code>{site.siteId}</code> · URL arrivals &amp; custom
                        events
                    </p>
                </div>
                <Button asChild variant="outline" size="sm">
                    <Link to={`/console/sites/${encodeURIComponent(site.siteId)}`}>
                        Back
                    </Link>
                </Button>
            </div>

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
                <h2 className="text-sm font-semibold">Add goal</h2>
                <Form method="post" className="grid gap-3 md:grid-cols-2">
                    <input type="hidden" name="intent" value="create" />
                    <label className="text-xs space-y-1">
                        <span className="text-muted-foreground">Name</span>
                        <input name="name" required placeholder="Signup complete" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" />
                    </label>
                    <label className="text-xs space-y-1">
                        <span className="text-muted-foreground">Type</span>
                        <select
                            name="goalType"
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                            defaultValue="url"
                        >
                            <option value="url">URL arrival</option>
                            <option value="event">Custom event</option>
                        </select>
                    </label>
                    <label className="text-xs space-y-1 md:col-span-2">
                        <span className="text-muted-foreground">
                            Match value (path or event name)
                        </span>
                        <input
                            name="matchValue"
                            required
                            placeholder="/thanks or signup_click"
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                        />
                    </label>
                    <label className="text-xs space-y-1">
                        <span className="text-muted-foreground">
                            URL match mode
                        </span>
                        <select
                            name="matchMode"
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                            defaultValue="exact"
                        >
                            <option value="exact">Exact</option>
                            <option value="prefix">Prefix</option>
                            <option value="contains">Contains</option>
                        </select>
                    </label>
                    <div className="flex items-end">
                        <Button type="submit" disabled={busy}>
                            Create goal
                        </Button>
                    </div>
                </Form>
            </Card>

            <div className="space-y-2">
                <h2 className="text-sm font-semibold">
                    Goals ({goals.length})
                </h2>
                {goals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No goals yet. Completions appear on the analytics page
                        after events/pageviews match.
                    </p>
                ) : (
                    goals.map((g) => <GoalRow key={g.goalId} goal={g} />)
                )}
            </div>
        </div>
    );
}
