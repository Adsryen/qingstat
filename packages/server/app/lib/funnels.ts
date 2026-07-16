/**
 * Conversion funnels: 2–5 ordered steps (URL path or custom event).
 * Completion is computed from D1 pageviews (+ synthetic event paths when present in AE-only is approximate).
 * MVP: D1-only visit sequences using path pageviews; event steps match /__event__/name if recorded as paths (not typically in D1).
 * Event steps fall back to AE event counts for single-step display; multi-step strict order uses D1 path steps only when possible.
 */

import {
    eventNameFromPath,
    eventMatchesGoal,
    pathMatchesGoal,
    type GoalMatchMode,
} from "./goals";

export type FunnelStepType = "url" | "event";

export type FunnelStep = {
    type: FunnelStepType;
    value: string;
    mode?: GoalMatchMode;
};

export type Funnel = {
    funnelId: string;
    siteId: string;
    name: string;
    steps: FunnelStep[];
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
};

export type FunnelInput = {
    siteId: string;
    name: string;
    steps: FunnelStep[];
    enabled?: boolean;
};

export type FunnelStepResult = {
    index: number;
    step: FunnelStep;
    visitors: number;
    dropOff: number | null;
    conversionFromStart: number | null;
    conversionFromPrev: number | null;
};

export type FunnelResult = {
    funnel: Funnel;
    steps: FunnelStepResult[];
    note: string;
};

type FunnelRow = {
    funnel_id: string;
    site_id: string;
    name: string;
    steps_json: string;
    enabled: number;
    created_at: string;
    updated_at: string;
};

const MIN_STEPS = 2;
const MAX_STEPS = 5;
const MAX_VISITS_SCAN = 5000;

function nowIso() {
    return new Date().toISOString();
}

function createId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeSteps(steps: FunnelStep[]): FunnelStep[] {
    if (!Array.isArray(steps)) throw new Error("steps must be an array");
    if (steps.length < MIN_STEPS || steps.length > MAX_STEPS) {
        throw new Error(`funnel must have ${MIN_STEPS}-${MAX_STEPS} steps`);
    }
    return steps.map((s, i) => {
        const type = s.type === "event" ? "event" : s.type === "url" ? "url" : null;
        if (!type) throw new Error(`step ${i + 1}: type must be url|event`);
        const value = (s.value || "").trim();
        if (!value) throw new Error(`step ${i + 1}: value required`);
        const mode =
            type === "url"
                ? s.mode === "prefix" || s.mode === "contains"
                    ? s.mode
                    : "exact"
                : "exact";
        return { type, value, mode };
    });
}

function parseSteps(json: string): FunnelStep[] {
    try {
        return normalizeSteps(JSON.parse(json) as FunnelStep[]);
    } catch {
        return [];
    }
}

function rowToFunnel(row: FunnelRow): Funnel {
    return {
        funnelId: row.funnel_id,
        siteId: row.site_id,
        name: row.name,
        steps: parseSteps(row.steps_json),
        enabled: row.enabled === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

const SELECT = `SELECT funnel_id, site_id, name, steps_json, enabled, created_at, updated_at FROM funnels`;

export async function listFunnels(db: D1Database, siteId: string): Promise<Funnel[]> {
    const result = await db
        .prepare(`${SELECT} WHERE site_id = ? ORDER BY created_at ASC`)
        .bind(siteId)
        .all<FunnelRow>();
    return (result.results ?? []).map(rowToFunnel);
}

export async function getFunnel(db: D1Database, funnelId: string): Promise<Funnel | null> {
    const row = await db
        .prepare(`${SELECT} WHERE funnel_id = ?`)
        .bind(funnelId)
        .first<FunnelRow>();
    return row ? rowToFunnel(row) : null;
}

export async function createFunnel(db: D1Database, input: FunnelInput): Promise<Funnel> {
    const name = input.name.trim();
    if (!name) throw new Error("Name is required");
    const steps = normalizeSteps(input.steps);
    const ts = nowIso();
    const funnelId = createId();
    await db
        .prepare(
            `INSERT INTO funnels (funnel_id, site_id, name, steps_json, enabled, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
            funnelId,
            input.siteId,
            name,
            JSON.stringify(steps),
            input.enabled === false ? 0 : 1,
            ts,
            ts,
        )
        .run();
    const created = await getFunnel(db, funnelId);
    if (!created) throw new Error("Failed to read funnel after create");
    return created;
}

export async function updateFunnel(
    db: D1Database,
    funnelId: string,
    patch: { name?: string; steps?: FunnelStep[]; enabled?: boolean },
): Promise<Funnel> {
    const current = await getFunnel(db, funnelId);
    if (!current) throw new Error(`Funnel not found: ${funnelId}`);
    const name = patch.name !== undefined ? patch.name.trim() : current.name;
    if (!name) throw new Error("Name is required");
    const steps = patch.steps ? normalizeSteps(patch.steps) : current.steps;
    const enabled = patch.enabled !== undefined ? patch.enabled : current.enabled;
    const ts = nowIso();
    await db
        .prepare(
            `UPDATE funnels SET name = ?, steps_json = ?, enabled = ?, updated_at = ? WHERE funnel_id = ?`,
        )
        .bind(name, JSON.stringify(steps), enabled ? 1 : 0, ts, funnelId)
        .run();
    const updated = await getFunnel(db, funnelId);
    if (!updated) throw new Error("Failed to read funnel after update");
    return updated;
}

export async function deleteFunnel(db: D1Database, funnelId: string): Promise<void> {
    const result = await db
        .prepare(`DELETE FROM funnels WHERE funnel_id = ?`)
        .bind(funnelId)
        .run();
    if (result.meta?.changes === 0) throw new Error(`Funnel not found: ${funnelId}`);
}

function stepMatches(path: string, step: FunnelStep): boolean {
    if (step.type === "url") {
        return pathMatchesGoal(path, step.value, step.mode || "exact");
    }
    const en = eventNameFromPath(path);
    if (en) return eventMatchesGoal(en, step.value);
    // D1 pageviews won't have events; also allow raw path match for synthetic
    return path === `/__event__/${step.value}`;
}

/**
 * Strict ordered funnel: visitor must hit step i only after having hit all previous steps
 * (first occurrence times increasing). Counts unique visitor_id (or visit_id fallback).
 */
export function computeFunnelFromSequences(
    steps: FunnelStep[],
    sequences: Array<{ id: string; paths: Array<{ path: string; at: string }> }>,
): FunnelStepResult[] {
    const reached = new Array(steps.length).fill(0) as number[];

    for (const seq of sequences) {
        const sorted = [...seq.paths].sort((a, b) => a.at.localeCompare(b.at));
        let next = 0;
        for (const hit of sorted) {
            if (next >= steps.length) break;
            if (stepMatches(hit.path, steps[next])) {
                reached[next] += 1;
                next += 1;
            }
        }
    }

    return steps.map((step, index) => {
        const visitors = reached[index];
        const prev = index === 0 ? null : reached[index - 1];
        const start = reached[0] || 0;
        return {
            index,
            step,
            visitors,
            dropOff: prev === null ? null : Math.max(0, prev - visitors),
            conversionFromStart: start > 0 ? visitors / start : null,
            conversionFromPrev: prev && prev > 0 ? visitors / prev : null,
        };
    });
}

export async function computeFunnelResult(
    db: D1Database,
    funnel: Funnel,
    range: { startDate: Date; endDate: Date },
): Promise<FunnelResult> {
    const start = range.startDate.toISOString();
    const end = range.endDate.toISOString();

    // Load pageviews with visit/visitor in range (capped)
    const result = await db
        .prepare(
            `SELECT p.visit_id as visit_id,
                    v.visitor_id as visitor_id,
                    p.path as path,
                    p.occurred_at as occurred_at
             FROM pageviews p
             LEFT JOIN visits v
               ON v.site_id = p.site_id AND v.visit_id = p.visit_id
             WHERE p.site_id = ?
               AND p.occurred_at >= ?
               AND p.occurred_at < ?
             ORDER BY p.occurred_at ASC
             LIMIT ?`,
        )
        .bind(funnel.siteId, start, end, MAX_VISITS_SCAN)
        .all<{
            visit_id: string;
            visitor_id: string | null;
            path: string | null;
            occurred_at: string;
        }>();

    const byId = new Map<string, Array<{ path: string; at: string }>>();
    for (const row of result.results ?? []) {
        const id = (row.visitor_id && row.visitor_id.trim()) || row.visit_id;
        if (!id) continue;
        const list = byId.get(id) || [];
        list.push({ path: row.path || "", at: row.occurred_at });
        byId.set(id, list);
    }

    const sequences = Array.from(byId.entries()).map(([id, paths]) => ({
        id,
        paths,
    }));

    const stepResults = computeFunnelFromSequences(funnel.steps, sequences);

    return {
        funnel,
        steps: stepResults,
        note:
            "Strict order · D1 pageview sequences (visitor_id or visit_id). Event steps only count if recorded as paths. Scan capped at 5000 pageviews.",
    };
}
