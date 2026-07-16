/**
 * Hourly traffic alert evaluation: AE counts → pure transitions → webhook.
 */

import { buildComparisonWindows } from "../analytics/comparison";
import { AnalyticsEngineAPI } from "../analytics/query";
import {
    getAlertState,
    isBreaching,
    listEnabledAlertRules,
    MIN_CONSECUTIVE_BREACHES,
    nextAlertTransition,
    upsertAlertState,
    webhookHostname,
    type AlertMetric,
    type AlertRule,
} from "./alerts";

export type AlertWebhookEvent = "alert.fired" | "alert.resolved";

export type AlertWebhookPayload = {
    event: AlertWebhookEvent;
    siteId: string;
    ruleId: string;
    name: string;
    metric: AlertMetric;
    condition: string;
    threshold: number;
    current: number;
    baseline: number;
    windowInterval: string;
    at: string;
};

const WEBHOOK_TIMEOUT_MS = 8000;

type MetricCounts = {
    viewsCurrent: number;
    viewsBaseline: number;
    visitorsCurrent: number;
    visitorsBaseline: number;
};

export async function deliverWebhook(
    url: string,
    payload: AlertWebhookPayload,
): Promise<{ ok: boolean; error: string | null }> {
    const host = webhookHostname(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        if (!res.ok) {
            return {
                ok: false,
                error: `webhook HTTP ${res.status} (${host})`,
            };
        }
        return { ok: true, error: null };
    } catch (err) {
        const name = err instanceof Error ? err.name : "";
        if (name === "AbortError") {
            return { ok: false, error: `webhook timeout (${host})` };
        }
        return { ok: false, error: `webhook network (${host})` };
    } finally {
        clearTimeout(timer);
    }
}

export async function runAlertEvaluation(
    env: {
        DB: D1Database;
        CF_ACCOUNT_ID: string;
        CF_BEARER_TOKEN: string;
    },
    now: Date = new Date(),
): Promise<{ evaluated: number; notified: number; errors: number }> {
    const db = env.DB;
    if (!db) {
        return { evaluated: 0, notified: 0, errors: 0 };
    }

    const rules = await listEnabledAlertRules(db);
    if (rules.length === 0) {
        return { evaluated: 0, notified: 0, errors: 0 };
    }

    const analyticsEngine = new AnalyticsEngineAPI(
        env.CF_ACCOUNT_ID,
        env.CF_BEARER_TOKEN,
    );

    // Group by (siteId, windowInterval) to reuse AE fetches
    const groups = new Map<string, AlertRule[]>();
    for (const rule of rules) {
        const key = `${rule.siteId}\0${rule.windowInterval}`;
        const list = groups.get(key) ?? [];
        list.push(rule);
        groups.set(key, list);
    }

    const countsCache = new Map<string, MetricCounts | null>();

    async function loadMetricCounts(
        siteId: string,
        windowInterval: string,
    ): Promise<MetricCounts | null> {
        const key = `${siteId}\0${windowInterval}`;
        if (countsCache.has(key)) {
            return countsCache.get(key) ?? null;
        }
        try {
            const windows = buildComparisonWindows(
                windowInterval,
                "UTC",
                now,
            );
            const [currentCounts, previousCounts] = await Promise.all([
                analyticsEngine.getCountsForDateRange(
                    siteId,
                    windows.current.startDate,
                    windows.current.endDate,
                    "UTC",
                ),
                analyticsEngine.getCountsForDateRange(
                    siteId,
                    windows.previous.startDate,
                    windows.previous.endDate,
                    "UTC",
                ),
            ]);
            const stored: MetricCounts = {
                viewsCurrent: currentCounts.views,
                viewsBaseline: previousCounts.views,
                visitorsCurrent: currentCounts.visitors,
                visitorsBaseline: previousCounts.visitors,
            };
            countsCache.set(key, stored);
            return stored;
        } catch (err) {
            console.error(
                "alert AE fetch failed",
                siteId,
                windowInterval,
                err instanceof Error ? err.message : err,
            );
            countsCache.set(key, null);
            return null;
        }
    }

    let evaluated = 0;
    let notified = 0;
    let errors = 0;
    const nowIso = now.toISOString();

    for (const [, groupRules] of groups) {
        const first = groupRules[0];
        const metricCounts = await loadMetricCounts(
            first.siteId,
            first.windowInterval,
        );

        for (const rule of groupRules) {
            evaluated += 1;
            try {
                const prevState = (await getAlertState(db, rule.ruleId)) ?? {
                    ruleId: rule.ruleId,
                    status: "ok" as const,
                    lastEvaluatedAt: null,
                    lastFiredAt: null,
                    lastRecoveredAt: null,
                    lastValue: null,
                    lastBaseline: null,
                    lastError: null,
                    consecutiveBreaches: 0,
                };

                if (!metricCounts) {
                    errors += 1;
                    await upsertAlertState(db, {
                        ruleId: rule.ruleId,
                        status: prevState.status,
                        lastEvaluatedAt: nowIso,
                        lastFiredAt: null,
                        lastRecoveredAt: null,
                        lastValue: prevState.lastValue,
                        lastBaseline: prevState.lastBaseline,
                        lastError: "ae query failed",
                        consecutiveBreaches: prevState.consecutiveBreaches,
                    });
                    continue;
                }

                const current =
                    rule.metric === "visitors"
                        ? metricCounts.visitorsCurrent
                        : metricCounts.viewsCurrent;
                const baseline =
                    rule.metric === "visitors"
                        ? metricCounts.visitorsBaseline
                        : metricCounts.viewsBaseline;

                const breaching = isBreaching({
                    condition: rule.condition,
                    threshold: rule.threshold,
                    current,
                    baseline,
                });

                const transition = nextAlertTransition({
                    status: prevState.status,
                    breaching,
                    consecutiveBreaches: prevState.consecutiveBreaches,
                    minConsecutive: MIN_CONSECUTIVE_BREACHES,
                    silenceMinutes: rule.silenceMinutes,
                    lastFiredAt: prevState.lastFiredAt,
                    now,
                });

                let lastError: string | null = null;
                let lastFiredAt: string | null = null;
                let lastRecoveredAt: string | null = null;

                if (transition.notify) {
                    const event: AlertWebhookEvent =
                        transition.notify === "fire"
                            ? "alert.fired"
                            : "alert.resolved";
                    if (rule.webhookUrl) {
                        const payload: AlertWebhookPayload = {
                            event,
                            siteId: rule.siteId,
                            ruleId: rule.ruleId,
                            name: rule.name,
                            metric: rule.metric,
                            condition: rule.condition,
                            threshold: rule.threshold,
                            current,
                            baseline,
                            windowInterval: rule.windowInterval,
                            at: nowIso,
                        };
                        const result = await deliverWebhook(
                            rule.webhookUrl,
                            payload,
                        );
                        if (result.ok) {
                            notified += 1;
                        } else {
                            errors += 1;
                            lastError = result.error;
                        }
                    } else {
                        // No webhook configured; still count state transition
                        notified += 1;
                    }
                    if (transition.notify === "fire") {
                        lastFiredAt = nowIso;
                    } else {
                        lastRecoveredAt = nowIso;
                    }
                }

                await upsertAlertState(db, {
                    ruleId: rule.ruleId,
                    status: transition.status,
                    lastEvaluatedAt: nowIso,
                    lastFiredAt,
                    lastRecoveredAt,
                    lastValue: current,
                    lastBaseline: baseline,
                    lastError,
                    consecutiveBreaches: transition.consecutiveBreaches,
                });
            } catch (err) {
                errors += 1;
                console.error(
                    "alert rule evaluation failed",
                    rule.ruleId,
                    err instanceof Error ? err.message : err,
                );
            }
        }
    }

    return { evaluated, notified, errors };
}
