import type { ReactNode } from "react";

import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import { SectionHeader } from "./SectionHeader";

export function ChartShell({
    eyebrow,
    title,
    description,
    action,
    loading = false,
    children,
    className,
    contentClassName,
}: {
    eyebrow?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    loading?: boolean;
    children: ReactNode;
    className?: string;
    contentClassName?: string;
}) {
    return (
        <Card
            className={cn(
                "overflow-hidden rounded-[1.35rem] border-border/70 bg-card/95 shadow-sm transition-opacity",
                loading && "opacity-60",
                className,
            )}
        >
            <CardHeader className="border-b border-border/60 bg-muted/15 p-5 sm:p-6">
                <SectionHeader
                    eyebrow={eyebrow}
                    title={title}
                    description={description}
                    action={action}
                />
            </CardHeader>
            <CardContent className={cn("p-5 sm:p-6", contentClassName)}>
                {children}
            </CardContent>
        </Card>
    );
}
