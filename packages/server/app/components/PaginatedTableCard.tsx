import { useEffect, useState } from "react";
import type { FetcherWithComponents } from "react-router";
import TableCard, { type CountByProperty } from "~/components/TableCard";

import { Card } from "./ui/card";
import PaginationButtons from "./PaginationButtons";
import { SearchFilters } from "~/lib/types";

type PaginatedFetcherData = {
    countsByProperty?: CountByProperty;
};

interface PaginatedTableCardProps {
    siteId: string;
    interval: string;
    dataFetcher: FetcherWithComponents<PaginatedFetcherData>;
    columnHeaders: string[];
    filters?: SearchFilters;
    loaderUrl: string;
    onClick?: (key: string) => void;
    timezone?: string;
    labelFormatter?: (label: string) => string;
}

const PaginatedTableCard = ({
    siteId,
    interval,
    dataFetcher,
    columnHeaders,
    filters,
    loaderUrl,
    onClick,
    timezone,
    labelFormatter,
}: PaginatedTableCardProps) => {
    const countsByProperty = dataFetcher.data?.countsByProperty || [];
    const [page, setPage] = useState(1);

    useEffect(() => {
        const params = new URLSearchParams({
            site: siteId,
            interval,
            page: String(page),
        });

        if (timezone) {
            params.set("timezone", timezone);
        }

        Object.entries(filters ?? {}).forEach(([key, value]) => {
            if (value !== undefined) {
                params.set(key, value);
            }
        });

        dataFetcher.submit(params, {
            method: "get",
            action: loaderUrl,
        });
        // NOTE: dataFetcher is intentionally omitted from the useEffect dependency array
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loaderUrl, siteId, interval, filters, timezone, page]); //

    function handlePagination(page: number) {
        setPage(page);
    }

    const hasMore = countsByProperty.length === 10;
    return (
        <Card
            className={
                dataFetcher.state === "loading"
                    ? "overflow-hidden rounded-[1.35rem] border-border/70 opacity-60 shadow-sm"
                    : "overflow-hidden rounded-[1.35rem] border-border/70 shadow-sm"
            }
        >
            {countsByProperty ? (
                <div className="grid h-full grid-rows-[auto,40px]">
                    <TableCard
                        countByProperty={countsByProperty}
                        columnHeaders={columnHeaders}
                        onClick={onClick}
                        labelFormatter={labelFormatter}
                    />
                    <PaginationButtons
                        page={page}
                        hasMore={hasMore}
                        handlePagination={handlePagination}
                    />
                </div>
            ) : null}
        </Card>
    );
};

export default PaginatedTableCard;
