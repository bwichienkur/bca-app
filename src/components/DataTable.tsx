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

function columnWidth(index: number, total: number): string {
  if (total <= 1) return "100%";
  if (index === 0) return "28%";
  return `${Math.floor(72 / (total - 1))}%`;
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
      <table className="w-full min-w-[36rem] table-fixed border-separate border-spacing-0 text-left text-sm">
        <colgroup>
          {headers.map((_, index) => (
            <col
              key={`col-${index}`}
              style={{ width: columnWidth(index, headers.length) }}
            />
          ))}
        </colgroup>
        <thead className="bg-[var(--felt-deep)] text-white">
          <tr>
            {headers.map((header, index) => {
              const active = sortColumn === index;
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
                    "border-b border-[var(--felt-deep)] px-3 py-3 font-medium tracking-wide md:px-4",
                    isFirst && stickyFirst
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
                    className="inline-flex max-w-full items-center gap-1.5 rounded-md px-0.5 py-0.5 transition hover:text-[var(--amber)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <span className="truncate">{header}</span>
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
                  const isFirst = cellIndex === 0;
                  const isLastRow = displayIndex === sortedRows.length - 1;
                  return (
                    <td
                      key={cellIndex}
                      className={[
                        "border-b border-[var(--line)] px-3 py-2.5 md:px-4",
                        rowBg,
                        isFirst && stickyFirst
                          ? "sticky left-0 z-[1] font-medium text-[var(--ink)]"
                          : "tabular-nums text-[var(--muted)]",
                        isFirst ? "truncate" : "",
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
