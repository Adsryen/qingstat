import { ExternalLink } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";

export type CountByPropertyLabel = string | [key: string, label: string];
export type CountByPropertyValue = string | number;
export type CountByPropertyRow = [
    label: CountByPropertyLabel,
    count: CountByPropertyValue,
    secondaryCount?: CountByPropertyValue,
];
export type CountByProperty = CountByPropertyRow[];

function calculateCountPercentages(countByProperty: CountByProperty) {
    const totalCount = countByProperty.reduce(
        (sum, row) => sum + Number(row[1]),
        0,
    );

    return countByProperty.map((row) => {
        const count = Number(row[1]);
        if (totalCount <= 0) {
            return "0%";
        }

        const percentage = ((count / totalCount) * 100).toFixed(2);
        return `${percentage}%`;
    });
}
export default function TableCard({
    countByProperty,
    columnHeaders,
    onClick,
    labelFormatter,
}: {
    countByProperty: CountByProperty;
    columnHeaders: string[];
    onClick?: (key: string) => void;
    labelFormatter?: (label: string) => string;
}) {
    const barChartPercentages = calculateCountPercentages(countByProperty);

    const countFormatter = Intl.NumberFormat("en", { notation: "compact" });

    const gridCols =
        (columnHeaders || []).length === 3
            ? "grid-cols-[minmax(0,1fr),minmax(0,8ch),minmax(0,8ch)]"
            : "grid-cols-[minmax(0,1fr),minmax(0,8ch)]";

    return (
        <Table className="overflow-hidden">
            <TableHeader>
                <TableRow className={`${gridCols} bg-muted/25`}>
                    {(columnHeaders || []).map((header: string, index) => (
                        <TableHead
                            key={header}
                            className={
                                index === 0
                                    ? "text-left text-xs uppercase tracking-[0.14em]"
                                    : "text-right pr-4 pl-0 text-xs uppercase tracking-[0.14em]"
                            }
                        >
                            {header}
                        </TableHead>
                    ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {(countByProperty || []).map((item, index) => {
                    const desc = item[0];

                    // the description can be either a single string (that is both the key and the label),
                    // or a tuple of type [key, label]
                    const [key, label] = Array.isArray(desc)
                        ? [desc[0], desc[1] || "(unknown)"]
                        : [desc, desc || "(unknown)"];

                    const formattedLabel =
                        labelFormatter && typeof label === "string"
                            ? labelFormatter(label)
                            : label;

                    return (
                        <TableRow
                            key={key}
                            className={`group border-border/50 transition-colors hover:bg-muted/30 [&_td]:last:rounded-b-md ${gridCols}`}
                            width={barChartPercentages[index]}
                        >
                            <TableCell className="overflow-hidden font-medium min-w-48 whitespace-normal relative flex items-center justify-start gap-2">
                                {/^https?:\/\//.test(label) ? (
                                    <>
                                        <img
                                            src={`/favicon?url=${encodeURIComponent(label)}`}
                                            alt="Favicon"
                                            className="w-5 h-5 mr-1 bg-white p-0.5 rounded-full"
                                            onError={(e) => {
                                                // Fallback to external link icon if favicon fails to load
                                                const target =
                                                    e.target as HTMLImageElement;
                                                target.style.display = "none";
                                            }}
                                        />
                                        {onClick ? (
                                            <button
                                                onClick={() =>
                                                    onClick(key as string)
                                                }
                                                className="hover:underline select-text text-left truncate decoration-live/60 underline-offset-4"
                                            >
                                                {formattedLabel}
                                            </button>
                                        ) : (
                                            formattedLabel
                                        )}
                                        <a
                                            href={label}
                                            target={"_blank"}
                                            rel="noreferrer"
                                            aria-hidden="true"
                                            className="inline whitespace-nowrap ml-1 text-muted-foreground transition-colors group-hover:text-live"
                                        >
                                            <ExternalLink size={16} />
                                        </a>
                                    </>
                                ) : (
                                    <>
                                        {onClick ? (
                                            <button
                                                onClick={() =>
                                                    onClick(key as string)
                                                }
                                                className="hover:underline select-text text-left truncate decoration-live/60 underline-offset-4"
                                            >
                                                {formattedLabel}
                                            </button>
                                        ) : (
                                            formattedLabel
                                        )}
                                    </>
                                )}
                            </TableCell>

                            <TableCell className="text-right min-w-16 tabular-nums font-medium">
                                {countFormatter.format(Number(item[1]))}
                            </TableCell>

                            {item.length > 2 && item[2] !== undefined && (
                                <TableCell className="text-right min-w-16 tabular-nums font-medium">
                                    {countFormatter.format(Number(item[2]))}
                                </TableCell>
                            )}
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}
