import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

export function SectionHeader({
    eyebrow,
    title,
    description,
    action,
    className,
}: {
    eyebrow?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
            <div className="min-w-0 space-y-1">
                {eyebrow ? (
                    <div className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-live">
                        {eyebrow}
                    </div>
                ) : null}
                <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                    {title}
                </h2>
                {description ? (
                    <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                        {description}
                    </p>
                ) : null}
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
        </div>
    );
}
