// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import "vitest-dom/extend-expect";

import { loader } from "../resources.new-returning";
import { getNewReturningSummary } from "~/lib/new-return";
import { getDefaultContext } from "./testutils";

vi.mock("~/lib/new-return", async () => {
    const actual = await vi.importActual("~/lib/new-return");
    return {
        ...actual,
        getNewReturningSummary: vi.fn(),
    };
});

describe("Resources/New Returning route", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    function createDb() {
        const stmt = {
            bind() {
                return stmt;
            },
            async first<T>() {
                return null as T | null;
            },
            async all<T>() {
                return { results: [] as T[] };
            },
            async run() {
                return { meta: { changes: 0 } };
            },
        };
        return {
            prepare() {
                return stmt;
            },
        } as unknown as D1Database;
    }

    test("returns new/returning summary from D1", async () => {
        vi.mocked(getNewReturningSummary).mockResolvedValue({
            available: true,
            reason: null,
            coverageStartedAt: "2026-07-13T09:00:00.000Z",
            classifiedVisitors: 10,
            newVisitors: 4,
            returningVisitors: 6,
            unclassifiedVisitors: 1,
            newVisitorRate: 0.4,
            returningVisitorRate: 0.6,
            unsupportedFilters: ["deviceType"],
            trend: [
                {
                    bucket: "2026-07-14T00:00:00.000Z",
                    newVisitors: 4,
                    returningVisitors: 6,
                },
            ],
        });

        const context = getDefaultContext().context;
        const db = createDb();
        (context.cloudflare.env as unknown as Env).DB = db;

        const response = await loader({
            context,
            // @ts-expect-error partial request is enough for loader
            request: {
                url: "http://localhost:3000/resources/new-returning?site=example.com&interval=7d&timezone=UTC&deviceType=Mobile",
            },
        });

        expect(getNewReturningSummary).toHaveBeenCalledWith(
            db,
            "example.com",
            expect.objectContaining({
                startDate: expect.any(Date),
                endDate: expect.any(Date),
            }),
            expect.objectContaining({
                intervalType: "DAY",
                timezone: "UTC",
                filters: expect.objectContaining({ deviceType: "Mobile" }),
            }),
        );
        expect(response).toEqual({
            summary: {
                available: true,
                reason: null,
                coverageStartedAt: "2026-07-13T09:00:00.000Z",
                classifiedVisitors: 10,
                newVisitors: 4,
                returningVisitors: 6,
                unclassifiedVisitors: 1,
                newVisitorRate: 0.4,
                returningVisitorRate: 0.6,
                unsupportedFilters: ["deviceType"],
                trend: [
                    {
                        bucket: "2026-07-14T00:00:00.000Z",
                        newVisitors: 4,
                        returningVisitors: 6,
                    },
                ],
            },
        });
    });

    test("degrades to unavailable summary when DB is unavailable", async () => {
        const response = await loader({
            ...getDefaultContext(),
            // @ts-expect-error partial request is enough for loader
            request: {
                url: "http://localhost:3000/resources/new-returning?site=example.com&interval=7d&timezone=UTC",
            },
        });

        expect(getNewReturningSummary).not.toHaveBeenCalled();
        expect(response).toEqual({
            summary: {
                available: false,
                reason: "db-unavailable",
                coverageStartedAt: null,
                classifiedVisitors: 0,
                newVisitors: 0,
                returningVisitors: 0,
                unclassifiedVisitors: 0,
                newVisitorRate: null,
                returningVisitorRate: null,
                unsupportedFilters: [],
                trend: [],
            },
        });
    });
});
