import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

export function FilterBar({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex flex-wrap items-center gap-3 rounded-[1.35rem] border border-border/70 bg-card/85 p-3 shadow-sm backdrop-blur",
                className,
            )}
        >
            {children}
        </div>
    );
}
