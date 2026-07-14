import type { ReactNode } from "react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export function LivePulse({
    eyebrow,
    title,
    description,
    items,
    actionHref,
    actionLabel,
    className,
}: {
    eyebrow: ReactNode;
    title: ReactNode;
    description: ReactNode;
    items: Array<{ label: ReactNode; value: ReactNode }>;
    actionHref?: string;
    actionLabel?: ReactNode;
    className?: string;
}) {
    return (
        <section
            className={cn(
                "relative overflow-hidden rounded-[1.65rem] border border-live/25 bg-gradient-to-br from-live/15 via-card to-heat/10 p-5 shadow-sm sm:p-6",
                className,
            )}
        >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-live to-transparent" />
            <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-live/20 blur-3xl" />
            <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr),auto] lg:items-center">
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-live-foreground dark:text-live">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-70 motion-reduce:animate-none" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-live" />
                        </span>
                        {eyebrow}
                    </div>
                    <div>
                        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-foreground sm:text-3xl">
                            {title}
                        </h2>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                            {description}
                        </p>
                    </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row lg:items-center">
                    <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[28rem]">
                        {items.map((item, index) => (
                            <div
                                key={index}
                                className="rounded-xl border border-background/60 bg-background/70 px-3 py-2 backdrop-blur"
                            >
                                <div className="text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
                                    {item.label}
                                </div>
                                <div className="mt-1 truncate text-sm font-semibold tabular-nums text-foreground">
                                    {item.value}
                                </div>
                            </div>
                        ))}
                    </div>
                    {actionHref && actionLabel ? (
                        <Button asChild className="rounded-xl">
                            <a href={actionHref}>{actionLabel}</a>
                        </Button>
                    ) : null}
                </div>
            </div>
        </section>
    );
}
