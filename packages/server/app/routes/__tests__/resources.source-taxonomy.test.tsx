// @vitest-environment jsdom
import {
    vi,
    test,
    describe,
    beforeEach,
    afterEach,
    expect,
    Mock,
} from "vitest";
import "vitest-dom/extend-expect";

import { loader } from "../resources.source-taxonomy";
import { createFetchResponse, getDefaultContext } from "./testutils";

describe("Resources/Source Taxonomy route", () => {
    let fetch: Mock;

    beforeEach(() => {
        fetch = global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("loader", () => {
        test("returns traffic source summary data", async () => {
            fetch.mockResolvedValueOnce(
                createFetchResponse({
                    data: [
                        {
                            referrer: "https://www.baidu.com/s?wd=stats",
                            utmSource: "",
                            utmMedium: "",
                            utmCampaign: "",
                            utmTerm: "",
                            utmContent: "",
                            isVisitor: 1,
                            isBounce: 0,
                            count: 3,
                        },
                        {
                            referrer: "",
                            utmSource: "google",
                            utmMedium: "cpc",
                            utmCampaign: "launch",
                            utmTerm: "",
                            utmContent: "",
                            isVisitor: 0,
                            isBounce: 0,
                            count: 8,
                        },
                    ],
                }),
            );

            const response = await loader({
                ...getDefaultContext(),
                // @ts-expect-error we don't need to provide all the properties of the request object
                request: {
                    url: "http://localhost:3000/resources/source-taxonomy?site=example.com&interval=7d&timezone=UTC",
                },
            });

            const json = await response;
            expect(json).toEqual({
                countsByProperty: [
                    ["search", 3, 3],
                    ["ads", 0, 8],
                ],
                page: 1,
            });
        });

        test("passes sourceType URL filter into the derived summary query", async () => {
            fetch.mockResolvedValueOnce(
                createFetchResponse({
                    data: [
                        {
                            referrer: "https://www.baidu.com/s?wd=stats",
                            utmSource: "",
                            utmMedium: "",
                            utmCampaign: "",
                            utmTerm: "",
                            utmContent: "",
                            isVisitor: 1,
                            isBounce: 0,
                            count: 3,
                        },
                        {
                            referrer: "https://example.org/post",
                            utmSource: "",
                            utmMedium: "",
                            utmCampaign: "",
                            utmTerm: "",
                            utmContent: "",
                            isVisitor: 1,
                            isBounce: 0,
                            count: 7,
                        },
                    ],
                }),
            );

            const response = await loader({
                ...getDefaultContext(),
                // @ts-expect-error we don't need to provide all the properties of the request object
                request: {
                    url: "http://localhost:3000/resources/source-taxonomy?site=example.com&interval=7d&timezone=UTC&sourceType=search",
                },
            });

            const json = await response;
            expect(json).toEqual({
                countsByProperty: [["search", 3, 3]],
                page: 1,
            });
        });
    });
});
