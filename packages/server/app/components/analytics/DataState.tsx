import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

export type DataStateTone = "default" | "live" | "warning" | "error";

const toneClass: Record<DataStateTone, string> = {
    default: "border-border bg-muted/35 text-muted-foreground",
    live: "border-live/30 bg-live/10 text-live-foreground",
    warning: "border-warning/30 bg-warning/10 text-warning-foreground",
    error: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function DataState({
    title,
    description,
    icon,
    tone = "default",
    className,
}: {
    title: ReactNode;
    description?: ReactNode;
    icon?: ReactNode;
    tone?: DataStateTone;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
                toneClass[tone],
                className,
            )}
        >
            {icon ? <div className="mt-0.5 shrink-0">{icon}</div> : null}
            <div className="min-w-0">
                <div className="font-medium text-foreground">{title}</div>
                {description ? <div className="mt-1 leading-6">{description}</div> : null}
            </div>
        </div>
    );
}
