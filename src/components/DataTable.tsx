"use client";

type DataTableProps = {
  headers: string[];
  rows: string[][];
  stickyFirst?: boolean;
  onRowClick?: (row: string[], rowIndex: number) => void;
  selectedRowIndex?: number | null;
  emptyText?: string;
};

export function DataTable({
  headers,
  rows,
  stickyFirst = true,
  onRowClick,
  selectedRowIndex = null,
  emptyText = "No data available for this report.",
}: DataTableProps) {
  if (!headers.length && !rows.length) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted)]">{emptyText}</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--line)] bg-white/85 shadow-[var(--shadow)]">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="bg-[var(--felt-deep)] text-white">
          <tr>
            {headers.map((header, index) => (
              <th
                key={`${header}-${index}`}
                className={[
                  "whitespace-nowrap px-3 py-3 font-medium tracking-wide md:px-4",
                  index === 0 && stickyFirst
                    ? "sticky left-0 z-10 bg-[var(--felt-deep)]"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const selected = selectedRowIndex === rowIndex;
            const clickable = Boolean(onRowClick);
            return (
              <tr
                key={rowIndex}
                onClick={
                  onRowClick ? () => onRowClick(row, rowIndex) : undefined
                }
                className={[
                  "border-t border-[var(--line)]",
                  selected
                    ? "bg-[color-mix(in_srgb,var(--felt)_14%,white)]"
                    : "odd:bg-white even:bg-[var(--paper-2)]/55",
                  clickable
                    ? "cursor-pointer transition hover:bg-[color-mix(in_srgb,var(--amber)_12%,white)]"
                    : "",
                ].join(" ")}
              >
                {headers.map((_, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={[
                      "whitespace-nowrap px-3 py-2.5 md:px-4",
                      cellIndex === 0 && stickyFirst
                        ? "sticky left-0 z-[1] bg-inherit font-medium text-[var(--ink)]"
                        : "tabular-nums text-[var(--muted)]",
                      cellIndex === 0 ? "max-w-[12rem] truncate md:max-w-none" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {row[cellIndex] ?? ""}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
