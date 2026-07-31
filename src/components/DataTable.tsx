"use client";

import { useMemo, useState } from "react";

type SortDirection = "asc" | "desc";

type DataTableProps = {
  headers: string[];
  rows: string[][];
  stickyFirst?: boolean;
  onRowClick?: (row: string[], rowIndex: number) => void;
  /** Prefer content-based selection so sorting doesn't break highlights */
  isRowSelected?: (row: string[]) => boolean;
  selectedRowIndex?: number | null;
  emptyText?: string;
};

type ColumnKind = "rank" | "name" | "stat";

function compareValues(a: string, b: string): number {
  const aTrim = (a ?? "").trim();
  const bTrim = (b ?? "").trim();

  // Percentages: 81%
  const aPct = aTrim.match(/^(-?\d+(?:\.\d+)?)%$/);
  const bPct = bTrim.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (aPct && bPct) {
    return Number(aPct[1]) - Number(bPct[1]);
  }

  // Ratios / records: 65/15 or 317/208
  const aRatio = aTrim.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  const bRatio = bTrim.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (aRatio && bRatio) {
    const aVal = Number(aRatio[1]) - Number(aRatio[2]);
    const bVal = Number(bRatio[1]) - Number(bRatio[2]);
    if (aVal !== bVal) return aVal - bVal;
    return Number(aRatio[1]) - Number(bRatio[1]);
  }

  // Plain numbers (including rank "#")
  const aNum = aTrim.replace(/,/g, "");
  const bNum = bTrim.replace(/,/g, "");
  const aIsNum = /^-?\d+(?:\.\d+)?$/.test(aNum);
  const bIsNum = /^-?\d+(?:\.\d+)?$/.test(bNum);
  if (aIsNum && bIsNum) {
    return Number(aNum) - Number(bNum);
  }

  return aTrim.localeCompare(bTrim, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function columnKind(header: string): ColumnKind {
  const h = header.trim().toLowerCase();
  if (h === "#" || h === "rank" || h === "rk" || h === "pos") return "rank";
  if (
    h === "team" ||
    h === "name" ||
    h === "player" ||
    h.includes("name") ||
    h.includes("team") ||
    h.includes("player")
  ) {
    return "name";
  }
  return "stat";
}

/** Fixed rem widths so short rank cols stay narrow and headers stay readable. */
function columnWidth(header: string, kind: ColumnKind): string {
  if (kind === "rank") return "3rem";
  if (kind === "name") return "14rem";

  const label = header.trim();
  const len = label.length;
  // Room for label + sort chevron + cell padding
  if (len <= 2) return "3.25rem";
  if (len <= 3) return "3.75rem";
  if (len <= 4) return "4.5rem";
  if (len <= 5) return "5.25rem";
  return `${Math.min(len * 0.85 + 1.5, 8)}rem`;
}

function stickyColumnIndex(headers: string[], stickyEnabled: boolean): number {
  if (!stickyEnabled || headers.length === 0) return -1;

  const nameIndex = headers.findIndex((header) => columnKind(header) === "name");
  if (nameIndex >= 0) return nameIndex;

  // Prefer sticking the second column when the first is only a rank index
  if (columnKind(headers[0] ?? "") === "rank" && headers.length > 1) return 1;
  return 0;
}

export function DataTable({
  headers,
  rows,
  stickyFirst = true,
  onRowClick,
  isRowSelected,
  selectedRowIndex = null,
  emptyText = "No data available for this report.",
}: DataTableProps) {
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const columnMeta = useMemo(
    () =>
      headers.map((header) => {
        const kind = columnKind(header);
        return { kind, width: columnWidth(header, kind) };
      }),
    [headers],
  );

  const stickyIndex = useMemo(
    () => stickyColumnIndex(headers, stickyFirst),
    [headers, stickyFirst],
  );

  const tableMinWidth = useMemo(() => {
    const totalRem = columnMeta.reduce((sum, column) => {
      const value = Number.parseFloat(column.width);
      return sum + (Number.isFinite(value) ? value : 4);
    }, 0);
    return `${totalRem}rem`;
  }, [columnMeta]);

  const sortedRows = useMemo(() => {
    if (sortColumn === null) {
      return rows.map((row, index) => ({ row, index }));
    }

    const decorated = rows.map((row, index) => ({ row, index }));
    decorated.sort((left, right) => {
      const result = compareValues(
        left.row[sortColumn] ?? "",
        right.row[sortColumn] ?? "",
      );
      return sortDirection === "asc" ? result : -result;
    });
    return decorated;
  }, [rows, sortColumn, sortDirection]);

  if (!headers.length && !rows.length) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted)]">{emptyText}</p>
    );
  }

  /** Cycle: unsorted → asc → desc → unsorted */
  const toggleSort = (columnIndex: number) => {
    if (sortColumn !== columnIndex) {
      setSortColumn(columnIndex);
      setSortDirection("asc");
      return;
    }
    if (sortDirection === "asc") {
      setSortDirection("desc");
      return;
    }
    setSortColumn(null);
    setSortDirection("asc");
  };

  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--line)] bg-white/85 shadow-[var(--shadow)]">
      <table
        className="w-full table-fixed border-separate border-spacing-0 text-left text-sm"
        style={{ minWidth: tableMinWidth }}
      >
        <colgroup>
          {columnMeta.map((column, index) => (
            <col key={`col-${index}`} style={{ width: column.width }} />
          ))}
        </colgroup>
        <thead className="bg-[var(--felt-deep)] text-white">
          <tr>
            {headers.map((header, index) => {
              const active = sortColumn === index;
              const isSticky = index === stickyIndex;
              const isFirst = index === 0;
              const isLast = index === headers.length - 1;
              return (
                <th
                  key={`${header}-${index}`}
                  aria-sort={
                    active
                      ? sortDirection === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  className={[
                    "border-b border-[var(--felt-deep)] px-2 py-3 font-medium tracking-wide md:px-3",
                    isSticky
                      ? "sticky left-0 z-10 bg-[var(--felt-deep)]"
                      : "bg-[var(--felt-deep)]",
                    isFirst ? "rounded-tl-[calc(var(--radius)-1px)]" : "",
                    isLast ? "rounded-tr-[calc(var(--radius)-1px)]" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(index)}
                    title={
                      active
                        ? sortDirection === "asc"
                          ? "Sorted ascending — click for descending"
                          : "Sorted descending — click to clear sort"
                        : "Sort column"
                    }
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-0.5 py-0.5 transition hover:text-[var(--amber)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <span>{header}</span>
                    <span
                      className={[
                        "shrink-0 text-[10px] leading-none",
                        active ? "opacity-100" : "opacity-45",
                      ].join(" ")}
                      aria-hidden
                    >
                      {active ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map(({ row, index: originalIndex }, displayIndex) => {
            const selected = isRowSelected
              ? isRowSelected(row)
              : selectedRowIndex === originalIndex;
            const clickable = Boolean(onRowClick);
            const rowBg = selected
              ? "bg-[color-mix(in_srgb,var(--felt)_14%,white)]"
              : displayIndex % 2 === 0
                ? "bg-white"
                : "bg-[var(--paper-2)]/55";
            return (
              <tr
                key={`${originalIndex}-${displayIndex}`}
                onClick={
                  onRowClick ? () => onRowClick(row, originalIndex) : undefined
                }
                className={[
                  clickable
                    ? "cursor-pointer transition hover:bg-[color-mix(in_srgb,var(--amber)_12%,white)]"
                    : "",
                ].join(" ")}
              >
                {headers.map((_, cellIndex) => {
                  const kind = columnMeta[cellIndex]?.kind ?? "stat";
                  const isSticky = cellIndex === stickyIndex;
                  const isFirst = cellIndex === 0;
                  const isLastRow = displayIndex === sortedRows.length - 1;
                  return (
                    <td
                      key={cellIndex}
                      className={[
                        "border-b border-[var(--line)] px-2 py-2.5 md:px-3",
                        rowBg,
                        isSticky
                          ? "sticky left-0 z-[1] font-medium text-[var(--ink)]"
                          : kind === "rank"
                            ? "tabular-nums text-[var(--muted)]"
                            : "tabular-nums text-[var(--muted)]",
                        kind === "name"
                          ? "whitespace-normal break-words font-medium text-[var(--ink)]"
                          : "whitespace-nowrap",
                        isLastRow && isFirst
                          ? "rounded-bl-[calc(var(--radius)-1px)]"
                          : "",
                        isLastRow && cellIndex === headers.length - 1
                          ? "rounded-br-[calc(var(--radius)-1px)]"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {row[cellIndex] ?? ""}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
