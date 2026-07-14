// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import "vitest-dom/extend-expect";

import { loader } from "../resources.exit-pages";
import { getExitPageSummary } from "~/lib/entry-exit";
import { getDefaultContext } from "./testutils";

vi.mock("~/lib/entry-exit", async () => {
    const actual = await vi.importActual("~/lib/entry-exit");
    return {
        ...actual,
        getExitPageSummary: vi.fn(),
    };
});

describe("Resources/Exit Pages route", () => {
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

    test("returns exit page summary from D1", async () => {
        vi.mocked(getExitPageSummary).mockResolvedValue({
            available: true,
            reason: null,
            countsByProperty: [["/pricing", 3, 3]],
        });

        const context = getDefaultContext().context;
        const db = createDb();
        (context.cloudflare.env as unknown as Env).DB = db;

        const response = await loader({
            context,
            // @ts-expect-error partial request is enough for loader
            request: {
                url: "http://localhost:3000/resources/exit-pages?site=example.com&interval=7d&timezone=UTC&path=/pricing",
            },
        });

        expect(getExitPageSummary).toHaveBeenCalledWith(
            db,
            "example.com",
            expect.objectContaining({
                startDate: expect.any(Date),
                endDate: expect.any(Date),
            }),
            expect.objectContaining({ path: "/pricing" }),
        );
        expect(response).toEqual({
            countsByProperty: [["/pricing", 3, 3]],
            coverage: { available: true, reason: null },
            page: 1,
        });
    });

    test("degrades to empty data when DB is unavailable", async () => {
        const response = await loader({
            ...getDefaultContext(),
            // @ts-expect-error partial request is enough for loader
            request: {
                url: "http://localhost:3000/resources/exit-pages?site=example.com&interval=7d&timezone=UTC",
            },
        });

        expect(getExitPageSummary).not.toHaveBeenCalled();
        expect(response).toEqual({
            countsByProperty: [],
            coverage: { available: false, reason: "db-unavailable" },
            page: 1,
        });
    });
});
