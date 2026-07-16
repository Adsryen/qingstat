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
import { getSite } from "~/lib/sites";
import {
    createFunnel,
    deleteFunnel,
    listFunnels,
    updateFunnel,
    type Funnel,
} from "~/lib/funnels";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";

export const meta: MetaFunction = () => [{ title: "Funnels · 轻统计" }];

export async function loader({ request, context, params }: LoaderFunctionArgs) {
    await requireAuth(request, context.cloudflare.env);
    const siteId = params.siteId || "";
    const db = context.cloudflare.env.DB;
    if (!db) throw new Response("D1 not configured", { status: 501 });
    const site = await getSite(db, siteId);
    if (!site) throw new Response("Site not found", { status: 404 });
    const funnels = await listFunnels(db, siteId);
    return { site, funnels };
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
            const stepsRaw = String(form.get("steps") || "");
            // lines: url|/path or event|name
            const steps = stepsRaw
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => {
                    const [type, ...rest] = line.split("|");
                    const value = rest.join("|").trim();
                    return {
                        type: (type === "event" ? "event" : "url") as
                            | "url"
                            | "event",
                        value,
                        mode: "exact" as const,
                    };
                });
            await createFunnel(db, {
                siteId,
                name: String(form.get("name") || ""),
                steps,
            });
            return { ok: true, message: "Funnel created" };
        }
        if (intent === "toggle") {
            await updateFunnel(db, String(form.get("funnelId") || ""), {
                enabled: form.get("enabled") === "1",
            });
            return { ok: true, message: "Updated" };
        }
        if (intent === "delete") {
            await deleteFunnel(db, String(form.get("funnelId") || ""));
            return { ok: true, message: "Deleted" };
        }
        return { ok: false, error: `Unknown intent ${intent}` };
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : "Error",
        };
    }
}

function FunnelRow({ funnel }: { funnel: Funnel }) {
    const navigation = useNavigation();
    const busy = navigation.state === "submitting";
    return (
        <div className="border border-border/60 rounded-xl p-3 space-y-2">
            <div className="flex justify-between gap-2 items-start">
                <div>
                    <div className="font-medium">{funnel.name}</div>
                    <ol className="text-xs text-muted-foreground list-decimal ml-4 mt-1">
                        {funnel.steps.map((s, i) => (
                            <li key={i}>
                                {s.type}: <code>{s.value}</code>
                            </li>
                        ))}
                    </ol>
                </div>
                <div className="flex gap-2">
                    <Form method="post">
                        <input type="hidden" name="intent" value="toggle" />
                        <input
                            type="hidden"
                            name="funnelId"
                            value={funnel.funnelId}
                        />
                        <input
                            type="hidden"
                            name="enabled"
                            value={funnel.enabled ? "0" : "1"}
                        />
                        <Button type="submit" size="sm" variant="outline" disabled={busy}>
                            {funnel.enabled ? "Disable" : "Enable"}
                        </Button>
                    </Form>
                    <Form method="post">
                        <input type="hidden" name="intent" value="delete" />
                        <input
                            type="hidden"
                            name="funnelId"
                            value={funnel.funnelId}
                        />
                        <Button type="submit" size="sm" variant="outline" disabled={busy}>
                            Delete
                        </Button>
                    </Form>
                </div>
            </div>
        </div>
    );
}

export default function ConsoleSiteFunnels() {
    const { site, funnels } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const busy = navigation.state === "submitting";

    return (
        <div className="max-w-3xl mx-auto p-4 space-y-6">
            <div className="flex justify-between items-center gap-3">
                <div>
                    <h1 className="text-xl font-semibold">Funnels</h1>
                    <p className="text-sm text-muted-foreground">
                        Site <code>{site.siteId}</code> · 2–5 strict steps
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
                <h2 className="text-sm font-semibold">Create funnel</h2>
                <Form method="post" className="space-y-3">
                    <input type="hidden" name="intent" value="create" />
                    <label className="text-xs block space-y-1">
                        <span className="text-muted-foreground">Name</span>
                        <input
                            name="name"
                            required
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                            placeholder="Signup funnel"
                        />
                    </label>
                    <label className="text-xs block space-y-1">
                        <span className="text-muted-foreground">
                            Steps (one per line:{" "}
                            <code>url|/path</code> or <code>event|name</code>)
                        </span>
                        <textarea
                            name="steps"
                            required
                            rows={5}
                            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono"
                            placeholder={"url|/\nurl|/pricing\nevent|signup_click"}
                        />
                    </label>
                    <Button type="submit" disabled={busy}>
                        Create
                    </Button>
                </Form>
            </Card>

            <div className="space-y-2">
                <h2 className="text-sm font-semibold">
                    Funnels ({funnels.length})
                </h2>
                {funnels.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None yet.</p>
                ) : (
                    funnels.map((f) => (
                        <FunnelRow key={f.funnelId} funnel={f} />
                    ))
                )}
            </div>
        </div>
    );
}
