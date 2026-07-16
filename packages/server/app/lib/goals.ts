/**
 * Conversion goals: config CRUD + match helpers.
 * Completions are computed from AE (paths / custom events), not stored per-hit.
 */

export type GoalType = "url" | "event";
export type GoalMatchMode = "exact" | "prefix" | "contains";

export type Goal = {
    goalId: string;
    siteId: string;
    name: string;
    goalType: GoalType;
    matchValue: string;
    matchMode: GoalMatchMode;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
};

export type GoalInput = {
    siteId: string;
    name: string;
    goalType: GoalType;
    matchValue: string;
    matchMode?: GoalMatchMode;
    enabled?: boolean;
};

export type GoalPatch = {
    name?: string;
    matchValue?: string;
    matchMode?: GoalMatchMode;
    enabled?: boolean;
};

type GoalRow = {
    goal_id: string;
    site_id: string;
    name: string;
    goal_type: string;
    match_value: string;
    match_mode: string;
    enabled: number;
    created_at: string;
    updated_at: string;
};

function nowIso() {
    return new Date().toISOString();
}

function createId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function rowToGoal(row: GoalRow): Goal {
    return {
        goalId: row.goal_id,
        siteId: row.site_id,
        name: row.name,
        goalType: row.goal_type as GoalType,
        matchValue: row.match_value,
        matchMode: (row.match_mode as GoalMatchMode) || "exact",
        enabled: row.enabled === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function normalizeGoalType(value: string): GoalType {
    if (value === "url" || value === "event") return value;
    throw new Error("goalType must be 'url' or 'event'");
}

export function normalizeMatchMode(value: string | undefined): GoalMatchMode {
    const mode = value || "exact";
    if (mode === "exact" || mode === "prefix" || mode === "contains") return mode;
    throw new Error("matchMode must be exact|prefix|contains");
}

/** Pure path matcher for URL goals. */
export function pathMatchesGoal(
    path: string,
    matchValue: string,
    mode: GoalMatchMode,
): boolean {
    const p = (path || "").trim() || "/";
    const m = (matchValue || "").trim();
    if (!m) return false;
    if (mode === "exact") return p === m;
    if (mode === "prefix") return p === m || p.startsWith(m.endsWith("/") ? m : m + "/") || p.startsWith(m);
    // contains
    return p.includes(m);
}

/** Event name from /__event__/{name} path. */
export function eventNameFromPath(path: string): string | null {
    const p = path || "";
    if (!p.startsWith("/__event__/")) return null;
    const name = p.slice("/__event__/".length).trim();
    return name || null;
}

export function eventMatchesGoal(eventName: string, matchValue: string): boolean {
    return (eventName || "").trim() === (matchValue || "").trim();
}

const SELECT = `SELECT goal_id, site_id, name, goal_type, match_value, match_mode, enabled, created_at, updated_at FROM goals`;

export async function listGoals(
    db: D1Database,
    siteId: string,
): Promise<Goal[]> {
    const result = await db
        .prepare(`${SELECT} WHERE site_id = ? ORDER BY created_at ASC`)
        .bind(siteId)
        .all<GoalRow>();
    return (result.results ?? []).map(rowToGoal);
}

export async function getGoal(
    db: D1Database,
    goalId: string,
): Promise<Goal | null> {
    const row = await db
        .prepare(`${SELECT} WHERE goal_id = ?`)
        .bind(goalId)
        .first<GoalRow>();
    return row ? rowToGoal(row) : null;
}

export async function createGoal(
    db: D1Database,
    input: GoalInput,
): Promise<Goal> {
    const name = input.name.trim();
    const matchValue = input.matchValue.trim();
    if (!name) throw new Error("Name is required");
    if (!matchValue) throw new Error("matchValue is required");
    const goalType = normalizeGoalType(input.goalType);
    const matchMode =
        goalType === "url"
            ? normalizeMatchMode(input.matchMode)
            : "exact";
    const ts = nowIso();
    const goalId = createId();
    const enabled = input.enabled === false ? 0 : 1;

    await db
        .prepare(
            `INSERT INTO goals (goal_id, site_id, name, goal_type, match_value, match_mode, enabled, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
            goalId,
            input.siteId,
            name,
            goalType,
            matchValue,
            matchMode,
            enabled,
            ts,
            ts,
        )
        .run();

    const created = await getGoal(db, goalId);
    if (!created) throw new Error("Failed to read goal after create");
    return created;
}

export async function updateGoal(
    db: D1Database,
    goalId: string,
    patch: GoalPatch,
): Promise<Goal> {
    const current = await getGoal(db, goalId);
    if (!current) throw new Error(`Goal not found: ${goalId}`);

    const name = patch.name !== undefined ? patch.name.trim() : current.name;
    if (!name) throw new Error("Name is required");
    const matchValue =
        patch.matchValue !== undefined
            ? patch.matchValue.trim()
            : current.matchValue;
    if (!matchValue) throw new Error("matchValue is required");
    const matchMode =
        current.goalType === "url"
            ? normalizeMatchMode(patch.matchMode ?? current.matchMode)
            : "exact";
    const enabled =
        patch.enabled !== undefined ? patch.enabled : current.enabled;
    const ts = nowIso();

    await db
        .prepare(
            `UPDATE goals
             SET name = ?, match_value = ?, match_mode = ?, enabled = ?, updated_at = ?
             WHERE goal_id = ?`,
        )
        .bind(name, matchValue, matchMode, enabled ? 1 : 0, ts, goalId)
        .run();

    const updated = await getGoal(db, goalId);
    if (!updated) throw new Error("Failed to read goal after update");
    return updated;
}

export async function deleteGoal(db: D1Database, goalId: string): Promise<void> {
    const result = await db
        .prepare(`DELETE FROM goals WHERE goal_id = ?`)
        .bind(goalId)
        .run();
    if (result.meta?.changes === 0) {
        throw new Error(`Goal not found: ${goalId}`);
    }
}

export type GoalCompletion = {
    goal: Goal;
    completions: number;
    /** Completions / views in range when available */
    conversionRate: number | null;
};

/**
 * Sum AE counts for paths matching a URL goal or event name.
 * rows: [path, count][] from path or event aggregates.
 */
export function computeGoalCompletions(
    goal: Goal,
    pathCounts: [string, number][],
): number {
    let total = 0;
    for (const [path, count] of pathCounts) {
        if (goal.goalType === "url") {
            if (pathMatchesGoal(path, goal.matchValue, goal.matchMode)) {
                total += count;
            }
        } else {
            const en = eventNameFromPath(path) ?? path;
            if (eventMatchesGoal(en, goal.matchValue)) {
                total += count;
            }
        }
    }
    return total;
}
