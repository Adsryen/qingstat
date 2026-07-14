// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import "vitest-dom/extend-expect";

import { ChartShell } from "../ChartShell";
import { DataState } from "../DataState";
import { FilterBar } from "../FilterBar";
import { LivePulse } from "../LivePulse";
import { MetricTile } from "../MetricTile";
import { SectionHeader } from "../SectionHeader";

describe("analytics primitives", () => {
    afterEach(() => cleanup());

    test("renders section header with optional action", () => {
        render(
            <SectionHeader
                eyebrow="Realtime"
                title="Traffic overview"
                description="Selected site summary"
                action={<a href="/x">Open</a>}
            />,
        );

        expect(screen.getByText("Realtime")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Traffic overview" })).toBeInTheDocument();
        expect(screen.getByText("Selected site summary")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/x");
    });

    test("renders metric tile value and loading skeleton", () => {
        const { rerender, container } = render(
            <MetricTile label="Visitors" value="12.4K" hint="Unique" tone="live" />,
        );

        expect(screen.getByText("Visitors")).toBeInTheDocument();
        expect(screen.getByText("12.4K")).toBeInTheDocument();
        expect(screen.getByText("Unique")).toBeInTheDocument();

        rerender(<MetricTile label="Visitors" value="12.4K" loading />);
        expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    });

    test("renders chart shell and state containers", () => {
        render(
            <ChartShell eyebrow="Trend" title="Traffic rhythm" description="Views over time">
                <DataState title="No data" description="Install tracking first" />
            </ChartShell>,
        );

        expect(screen.getByText("Trend")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Traffic rhythm" })).toBeInTheDocument();
        expect(screen.getByText("No data")).toBeInTheDocument();
        expect(screen.getByText("Install tracking first")).toBeInTheDocument();
    });

    test("renders filter bar and live pulse action", () => {
        render(
            <>
                <FilterBar>
                    <button>Range</button>
                </FilterBar>
                <LivePulse
                    eyebrow="Live pulse"
                    title="What is happening now"
                    description="Selected site command strip"
                    actionHref="/console/sites/site-a/realtime"
                    actionLabel="Open realtime"
                    items={[{ label: "Site", value: "site-a" }]}
                />
            </>,
        );

        expect(screen.getByRole("button", { name: "Range" })).toBeInTheDocument();
        expect(screen.getByText("Live pulse")).toBeInTheDocument();
        expect(screen.getByText("site-a")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Open realtime" })).toHaveAttribute(
            "href",
            "/console/sites/site-a/realtime",
        );
    });
});
