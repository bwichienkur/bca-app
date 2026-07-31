type DataTableProps = {
  headers: string[];
  rows: string[][];
  stickyFirst?: boolean;
};

export function DataTable({
  headers,
  rows,
  stickyFirst = true,
}: DataTableProps) {
  if (!headers.length && !rows.length) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted)]">
        No data available for this report.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--line)] bg-white/80 shadow-[var(--shadow)]">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="bg-[var(--felt-deep)] text-white">
          <tr>
            {headers.map((header, index) => (
              <th
                key={`${header}-${index}`}
                className={[
                  "whitespace-nowrap px-3 py-3 font-medium tracking-wide",
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
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="border-t border-[var(--line)] odd:bg-white even:bg-[var(--paper-2)]/60"
            >
              {headers.map((_, cellIndex) => (
                <td
                  key={cellIndex}
                  className={[
                    "whitespace-nowrap px-3 py-2.5 text-[var(--ink)]",
                    cellIndex === 0 && stickyFirst
                      ? "sticky left-0 z-[1] bg-inherit font-medium"
                      : "tabular-nums text-[var(--muted)]",
                    cellIndex === 0 ? "max-w-[10rem] truncate" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {row[cellIndex] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
