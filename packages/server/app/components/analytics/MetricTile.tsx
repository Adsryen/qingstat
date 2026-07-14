import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

export type MetricTileTone = "default" | "primary" | "live" | "heat" | "success";

const toneClass: Record<MetricTileTone, string> = {
    default: "border-border bg-card",
    primary: "border-primary/20 bg-primary/5",
    live: "border-live/25 bg-live/10",
    heat: "border-heat/25 bg-heat/10",
    success: "border-success/25 bg-success/10",
};

export function MetricTile({
    label,
    value,
    hint,
    delta,
    tone = "default",
    loading = false,
    className,
}: {
    label: ReactNode;
    value: ReactNode;
    hint?: ReactNode;
    delta?: ReactNode;
    tone?: MetricTileTone;
    loading?: boolean;
    className?: string;
}) {
    return (
        <div className={cn("relative overflow-hidden rounded-xl border p-4", toneClass[tone], className)}>
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {label}
            </div>
            <div className="mt-3 min-h-10 text-3xl font-semibold tracking-[-0.04em] text-foreground tabular-nums sm:text-4xl">
                {loading ? <span className="inline-block h-9 w-24 animate-pulse rounded-md bg-muted" /> : value}
            </div>
            <div className="mt-3 flex min-h-5 items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>{hint}</span>
                {delta ? <span className="rounded-full bg-background/70 px-2 py-0.5 font-medium text-foreground">{delta}</span> : null}
            </div>
        </div>
    );
}
