/**
 * Traffic alerts: pure evaluation logic + D1 CRUD for rules/state.
 */

export type AlertMetric = "views" | "visitors";
export type AlertCondition = "drop_pct" | "spike_pct" | "below_abs";
export type AlertStatus = "ok" | "firing";

export const ALERT_METRICS: AlertMetric[] = ["views", "visitors"];
export const ALERT_CONDITIONS: AlertCondition[] = [
    "drop_pct",
    "spike_pct",
    "below_abs",
];
export const ALERT_WINDOW_INTERVALS = [
    "today",
    "yesterday",
    "1d",
    "7d",
    "30d",
    "90d",
] as const;
export type AlertWindowInterval = (typeof ALERT_WINDOW_INTERVALS)[number];

export const DEFAULT_SILENCE_MINUTES = 360;
export const MIN_CONSECUTIVE_BREACHES = 2;
export const MAX_ALERT_RULES_PER_SITE = 20;
export const MIN_SILENCE_MINUTES = 1;
export const MAX_SILENCE_MINUTES = 10080;

export type AlertRule = {
    ruleId: string;
    siteId: string;
    name: string;
    metric: AlertMetric;
    condition: AlertCondition;
    threshold: number;
    windowInterval: AlertWindowInterval;
    webhookUrl: string | null;
    enabled: boolean;
    silenceMinutes: number;
    createdAt: string;
    updatedAt: string;
};

export type AlertRuleInput = {
    siteId: string;
    name: string;
    metric: AlertMetric;
    condition: AlertCondition;
    threshold: number;
    windowInterval?: string;
    webhookUrl?: string | null;
    enabled?: boolean;
    silenceMinutes?: number;
};

export type AlertRulePatch = {
    name?: string;
    metric?: AlertMetric;
    condition?: AlertCondition;
    threshold?: number;
    windowInterval?: string;
    webhookUrl?: string | null;
    enabled?: boolean;
    silenceMinutes?: number;
};

export type AlertState = {
    ruleId: string;
    status: AlertStatus;
    lastEvaluatedAt: string | null;
    lastFiredAt: string | null;
    lastRecoveredAt: string | null;
    lastValue: number | null;
    lastBaseline: number | null;
    lastError: string | null;
    consecutiveBreaches: number;
};

export type AlertStateUpsert = {
    ruleId: string;
    status: AlertStatus;
    lastEvaluatedAt?: string | null;
    lastFiredAt?: string | null;
    lastRecoveredAt?: string | null;
    lastValue?: number | null;
    lastBaseline?: number | null;
    lastError?: string | null;
    consecutiveBreaches: number;
};

type AlertRuleRow = {
    rule_id: string;
    site_id: string;
    name: string;
    metric: string;
    condition: string;
    threshold: number;
    window_interval: string;
    webhook_url: string | null;
    enabled: number;
    silence_minutes: number;
    created_at: string;
    updated_at: string;
};

type AlertStateRow = {
    rule_id: string;
    status: string;
    last_evaluated_at: string | null;
    last_fired_at: string | null;
    last_recovered_at: string | null;
    last_value: number | null;
    last_baseline: number | null;
    last_error: string | null;
    consecutive_breaches: number;
};

function nowIso() {
    return new Date().toISOString();
}

function createId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeAlertMetric(value: string): AlertMetric {
    if (value === "views" || value === "visitors") return value;
    throw new Error("metric must be views|visitors");
}

export function normalizeAlertCondition(value: string): AlertCondition {
    if (
        value === "drop_pct" ||
        value === "spike_pct" ||
        value === "below_abs"
    ) {
        return value;
    }
    throw new Error("condition must be drop_pct|spike_pct|below_abs");
}

export function normalizeWindowInterval(value: string | undefined): AlertWindowInterval {
    const interval = (value || "1d").trim();
    if ((ALERT_WINDOW_INTERVALS as readonly string[]).includes(interval)) {
        return interval as AlertWindowInterval;
    }
    throw new Error(
        "window_interval must be today|yesterday|1d|7d|30d|90d",
    );
}

export function normalizeSilenceMinutes(value: number | undefined): number {
    const n =
        value === undefined || value === null
            ? DEFAULT_SILENCE_MINUTES
            : Number(value);
    if (!Number.isFinite(n) || n < MIN_SILENCE_MINUTES || n > MAX_SILENCE_MINUTES) {
        throw new Error(
            `silence_minutes must be ${MIN_SILENCE_MINUTES}..${MAX_SILENCE_MINUTES}`,
        );
    }
    return Math.floor(n);
}

export function validateThreshold(
    condition: AlertCondition,
    threshold: number,
): number {
    if (!Number.isFinite(threshold)) {
        throw new Error("threshold must be a number");
    }
    if (condition === "below_abs") {
        if (threshold < 0) throw new Error("threshold must be >= 0 for below_abs");
        return threshold;
    }
    if (threshold <= 0) {
        throw new Error("threshold must be > 0 for percent conditions");
    }
    return threshold;
}

export function normalizeWebhookUrl(
    value: string | null | undefined,
): string | null {
    if (value === undefined || value === null) return null;
    const url = value.trim();
    if (!url) return null;
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error("webhook_url must be a valid HTTPS URL");
    }
    if (parsed.protocol !== "https:") {
        throw new Error("webhook_url must be HTTPS");
    }
    return url;
}

/** Safe hostname for error logs — never the full webhook URL. */
export function webhookHostname(url: string | null | undefined): string {
    if (!url) return "unknown";
    try {
        return new URL(url).hostname || "unknown";
    } catch {
        return "unknown";
    }
}

export function isBreaching(input: {
    condition: AlertCondition;
    threshold: number;
    current: number;
    baseline: number;
}): boolean {
    const { condition, threshold, current, baseline } = input;
    if (condition === "below_abs") {
        return current < threshold;
    }
    // Avoid div0 / cold start for percent conditions
    if (!(baseline > 0)) return false;
    if (condition === "drop_pct") {
        return ((baseline - current) / baseline) * 100 >= threshold;
    }
    if (condition === "spike_pct") {
        return ((current - baseline) / baseline) * 100 >= threshold;
    }
    return false;
}

export function nextAlertTransition(input: {
    status: AlertStatus;
    breaching: boolean;
    consecutiveBreaches: number; // value BEFORE this evaluation is applied
    minConsecutive?: number;
    /** Stored for future re-notify; MVP does not re-notify while firing. */
    silenceMinutes?: number;
    lastFiredAt?: string | null;
    now?: Date;
}): {
    status: AlertStatus;
    consecutiveBreaches: number;
    notify: "fire" | "resolve" | null;
} {
    const minConsecutive = input.minConsecutive ?? MIN_CONSECUTIVE_BREACHES;
    const consecutive = input.breaching
        ? input.consecutiveBreaches + 1
        : 0;

    // silenceMinutes / lastFiredAt / now reserved for future re-notify policy
    void input.silenceMinutes;
    void input.lastFiredAt;
    void input.now;

    if (input.status === "ok") {
        if (input.breaching && consecutive >= minConsecutive) {
            return {
                status: "firing",
                consecutiveBreaches: consecutive,
                notify: "fire",
            };
        }
        return {
            status: "ok",
            consecutiveBreaches: consecutive,
            notify: null,
        };
    }

    // firing
    if (!input.breaching) {
        return {
            status: "ok",
            consecutiveBreaches: 0,
            notify: "resolve",
        };
    }

    // Stay firing; MVP: no re-notify while firing (silence reserved for future re-notify)
    return {
        status: "firing",
        consecutiveBreaches: consecutive,
        notify: null,
    };
}

function rowToRule(row: AlertRuleRow): AlertRule {
    return {
        ruleId: row.rule_id,
        siteId: row.site_id,
        name: row.name,
        metric: row.metric as AlertMetric,
        condition: row.condition as AlertCondition,
        threshold: row.threshold,
        windowInterval: row.window_interval as AlertWindowInterval,
        webhookUrl: row.webhook_url,
        enabled: row.enabled === 1,
        silenceMinutes: row.silence_minutes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function rowToState(row: AlertStateRow): AlertState {
    return {
        ruleId: row.rule_id,
        status: row.status === "firing" ? "firing" : "ok",
        lastEvaluatedAt: row.last_evaluated_at,
        lastFiredAt: row.last_fired_at,
        lastRecoveredAt: row.last_recovered_at,
        lastValue: row.last_value,
        lastBaseline: row.last_baseline,
        lastError: row.last_error,
        consecutiveBreaches: row.consecutive_breaches ?? 0,
    };
}

const SELECT_RULE = `SELECT rule_id, site_id, name, metric, condition, threshold, window_interval, webhook_url, enabled, silence_minutes, created_at, updated_at FROM alert_rules`;
const SELECT_STATE = `SELECT rule_id, status, last_evaluated_at, last_fired_at, last_recovered_at, last_value, last_baseline, last_error, consecutive_breaches FROM alert_state`;

export async function listAlertRules(
    db: D1Database,
    siteId: string,
): Promise<AlertRule[]> {
    const result = await db
        .prepare(`${SELECT_RULE} WHERE site_id = ? ORDER BY created_at ASC`)
        .bind(siteId)
        .all<AlertRuleRow>();
    return (result.results ?? []).map(rowToRule);
}

export async function listEnabledAlertRules(
    db: D1Database,
): Promise<AlertRule[]> {
    const result = await db
        .prepare(`${SELECT_RULE} WHERE enabled = 1 ORDER BY site_id, created_at ASC`)
        .all<AlertRuleRow>();
    return (result.results ?? []).map(rowToRule);
}

export async function getAlertRule(
    db: D1Database,
    ruleId: string,
): Promise<AlertRule | null> {
    const row = await db
        .prepare(`${SELECT_RULE} WHERE rule_id = ?`)
        .bind(ruleId)
        .first<AlertRuleRow>();
    return row ? rowToRule(row) : null;
}

export async function countAlertRulesForSite(
    db: D1Database,
    siteId: string,
): Promise<number> {
    const row = await db
        .prepare(`SELECT COUNT(*) as c FROM alert_rules WHERE site_id = ?`)
        .bind(siteId)
        .first<{ c: number }>();
    return row?.c ?? 0;
}

export async function createAlertRule(
    db: D1Database,
    input: AlertRuleInput,
): Promise<AlertRule> {
    const name = input.name.trim();
    if (!name) throw new Error("Name is required");
    const siteId = input.siteId.trim();
    if (!siteId) throw new Error("siteId is required");

    const metric = normalizeAlertMetric(input.metric);
    const condition = normalizeAlertCondition(input.condition);
    const threshold = validateThreshold(condition, Number(input.threshold));
    const windowInterval = normalizeWindowInterval(input.windowInterval);
    const webhookUrl = normalizeWebhookUrl(input.webhookUrl);
    const silenceMinutes = normalizeSilenceMinutes(input.silenceMinutes);
    const enabled = input.enabled === false ? 0 : 1;

    const existing = await countAlertRulesForSite(db, siteId);
    if (existing >= MAX_ALERT_RULES_PER_SITE) {
        throw new Error(
            `Maximum ${MAX_ALERT_RULES_PER_SITE} alert rules per site`,
        );
    }

    const ts = nowIso();
    const ruleId = createId();

    await db
        .prepare(
            `INSERT INTO alert_rules (
                rule_id, site_id, name, metric, condition, threshold,
                window_interval, webhook_url, enabled, silence_minutes,
                created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
            ruleId,
            siteId,
            name,
            metric,
            condition,
            threshold,
            windowInterval,
            webhookUrl,
            enabled,
            silenceMinutes,
            ts,
            ts,
        )
        .run();

    // Ensure state row exists
    await db
        .prepare(
            `INSERT OR IGNORE INTO alert_state (rule_id, status, consecutive_breaches)
             VALUES (?, 'ok', 0)`,
        )
        .bind(ruleId)
        .run();

    const created = await getAlertRule(db, ruleId);
    if (!created) throw new Error("Failed to read alert rule after create");
    return created;
}

export async function updateAlertRule(
    db: D1Database,
    ruleId: string,
    patch: AlertRulePatch,
): Promise<AlertRule> {
    const current = await getAlertRule(db, ruleId);
    if (!current) throw new Error(`Alert rule not found: ${ruleId}`);

    const name =
        patch.name !== undefined ? patch.name.trim() : current.name;
    if (!name) throw new Error("Name is required");

    const metric =
        patch.metric !== undefined
            ? normalizeAlertMetric(patch.metric)
            : current.metric;
    const condition =
        patch.condition !== undefined
            ? normalizeAlertCondition(patch.condition)
            : current.condition;
    const threshold =
        patch.threshold !== undefined
            ? validateThreshold(condition, Number(patch.threshold))
            : validateThreshold(condition, current.threshold);
    const windowInterval =
        patch.windowInterval !== undefined
            ? normalizeWindowInterval(patch.windowInterval)
            : current.windowInterval;
    const webhookUrl =
        patch.webhookUrl !== undefined
            ? normalizeWebhookUrl(patch.webhookUrl)
            : current.webhookUrl;
    const silenceMinutes =
        patch.silenceMinutes !== undefined
            ? normalizeSilenceMinutes(patch.silenceMinutes)
            : current.silenceMinutes;
    const enabled =
        patch.enabled !== undefined ? patch.enabled : current.enabled;
    const ts = nowIso();

    await db
        .prepare(
            `UPDATE alert_rules
             SET name = ?, metric = ?, condition = ?, threshold = ?,
                 window_interval = ?, webhook_url = ?, enabled = ?,
                 silence_minutes = ?, updated_at = ?
             WHERE rule_id = ?`,
        )
        .bind(
            name,
            metric,
            condition,
            threshold,
            windowInterval,
            webhookUrl,
            enabled ? 1 : 0,
            silenceMinutes,
            ts,
            ruleId,
        )
        .run();

    const updated = await getAlertRule(db, ruleId);
    if (!updated) throw new Error("Failed to read alert rule after update");
    return updated;
}

export async function deleteAlertRule(
    db: D1Database,
    ruleId: string,
): Promise<void> {
    const result = await db
        .prepare(`DELETE FROM alert_rules WHERE rule_id = ?`)
        .bind(ruleId)
        .run();
    if (result.meta?.changes === 0) {
        throw new Error(`Alert rule not found: ${ruleId}`);
    }
    // Explicit cleanup in case FK cascade is not enforced on the D1 connection
    await db
        .prepare(`DELETE FROM alert_state WHERE rule_id = ?`)
        .bind(ruleId)
        .run();
}

export async function getAlertState(
    db: D1Database,
    ruleId: string,
): Promise<AlertState | null> {
    const row = await db
        .prepare(`${SELECT_STATE} WHERE rule_id = ?`)
        .bind(ruleId)
        .first<AlertStateRow>();
    return row ? rowToState(row) : null;
}

export async function listAlertStates(
    db: D1Database,
    ruleIds: string[],
): Promise<Map<string, AlertState>> {
    const map = new Map<string, AlertState>();
    if (ruleIds.length === 0) return map;
    // D1 has no array bind; query one-by-one or IN with placeholders
    const placeholders = ruleIds.map(() => "?").join(",");
    const result = await db
        .prepare(`${SELECT_STATE} WHERE rule_id IN (${placeholders})`)
        .bind(...ruleIds)
        .all<AlertStateRow>();
    for (const row of result.results ?? []) {
        map.set(row.rule_id, rowToState(row));
    }
    return map;
}

export async function upsertAlertState(
    db: D1Database,
    state: AlertStateUpsert,
): Promise<void> {
    await db
        .prepare(
            `INSERT INTO alert_state (
                rule_id, status, last_evaluated_at, last_fired_at,
                last_recovered_at, last_value, last_baseline, last_error,
                consecutive_breaches
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(rule_id) DO UPDATE SET
                status = excluded.status,
                last_evaluated_at = excluded.last_evaluated_at,
                last_fired_at = COALESCE(excluded.last_fired_at, alert_state.last_fired_at),
                last_recovered_at = COALESCE(excluded.last_recovered_at, alert_state.last_recovered_at),
                last_value = excluded.last_value,
                last_baseline = excluded.last_baseline,
                last_error = excluded.last_error,
                consecutive_breaches = excluded.consecutive_breaches`,
        )
        .bind(
            state.ruleId,
            state.status,
            state.lastEvaluatedAt ?? null,
            state.lastFiredAt ?? null,
            state.lastRecoveredAt ?? null,
            state.lastValue ?? null,
            state.lastBaseline ?? null,
            state.lastError ?? null,
            state.consecutiveBreaches,
        )
        .run();
}
