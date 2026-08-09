"use client";

import { useMemo, useState, type ReactNode } from "react";

type SortDirection = "asc" | "desc";

type DataTableProps = {
  headers: string[];
  rows: string[][];
  stickyFirst?: boolean;
  /** Denser rows for team player grids */
  compact?: boolean;
  /**
   * Drop the outer card chrome so the grid can sit flush inside a parent
   * shell (e.g. Team → Roster standing-style card).
   */
  flush?: boolean;
  /** Filter / controls strip above the column header, inside the same card. */
  toolbar?: ReactNode;
  onRowClick?: (row: string[], rowIndex: number) => void;
  /** Prefer content-based selection so sorting doesn't break highlights */
  isRowSelected?: (row: string[]) => boolean;
  selectedRowIndex?: number | null;
  emptyText?: string;
};

type ColumnKind = "rank" | "name" | "stat";

/** Sticky accent rail width — matches AccentRecordCard’s felt edge. */
const RAIL_REM = 0.25;
const RAIL_STYLE = { width: `${RAIL_REM}rem`, minWidth: `${RAIL_REM}rem` };

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

/**
 * Size name columns from a high percentile of label lengths so one long
 * outlier doesn’t inflate the whole grid. Longer names still truncate with
 * a title tooltip.
 */
function nameColumnWidth(targetChars: number, compact: boolean): string {
  const min = compact ? 5.75 : 7;
  const max = compact ? 11.5 : 13.5;
  // Proportional UI fonts run closer to ~0.45rem/char at table sizes.
  const perChar = compact ? 0.44 : 0.47;
  const pad = compact ? 0.85 : 1.05;
  const width = Math.min(Math.max(targetChars * perChar + pad, min), max);
  return `${width.toFixed(2)}rem`;
}

/** Fixed rem widths so short rank cols stay narrow and headers stay readable. */
function columnWidth(
  header: string,
  kind: ColumnKind,
  compact: boolean,
): string {
  if (kind === "rank") return compact ? "2.5rem" : "3rem";
  if (
    header.trim().toLowerCase() === "fargo" ||
    header.trim().toLowerCase() === "rating"
  ) {
    return compact ? "4rem" : "4.5rem";
  }

  const label = header.trim();
  const len = label.length;
  // Room for label + sort chevron + cell padding
  if (len <= 2) return compact ? "2.85rem" : "3.25rem";
  if (len <= 3) return compact ? "3.35rem" : "3.75rem";
  if (len <= 4) return compact ? "4rem" : "4.5rem";
  if (len <= 5) return compact ? "4.6rem" : "5.25rem";
  return `${Math.min(len * 0.85 + 1.5, compact ? 6.5 : 8)}rem`;
}

/** Prefer ~85th percentile length so typical names fit without outlier stretch. */
function targetNameLength(
  rows: string[][],
  columnIndex: number,
  headerLength: number,
): number {
  const lengths = rows
    .map((row) => (row[columnIndex] ?? "").trim().length)
    .filter((len) => len > 0)
    .sort((a, b) => a - b);

  if (!lengths.length) return Math.max(headerLength, 8);

  const percentileIndex = Math.min(
    lengths.length - 1,
    Math.max(0, Math.ceil(lengths.length * 0.85) - 1),
  );
  return Math.max(lengths[percentileIndex] ?? 8, headerLength, 8);
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
  compact = false,
  flush = false,
  toolbar,
  onRowClick,
  isRowSelected,
  selectedRowIndex = null,
  emptyText = "No data available for this report.",
}: DataTableProps) {
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const columnMeta = useMemo(
    () =>
      headers.map((header, index) => {
        const kind = columnKind(header);
        if (kind === "name") {
          const targetChars = targetNameLength(
            rows,
            index,
            header.trim().length,
          );
          return { kind, width: nameColumnWidth(targetChars, compact) };
        }
        return { kind, width: columnWidth(header, kind, compact) };
      }),
    [headers, rows, compact],
  );

  const stickyIndex = useMemo(
    () => stickyColumnIndex(headers, stickyFirst),
    [headers, stickyFirst],
  );

  const tableMinWidth = useMemo(() => {
    const totalRem = columnMeta.reduce((sum, column) => {
      const value = Number.parseFloat(column.width);
      return sum + (Number.isFinite(value) ? value : 4);
    }, RAIL_REM);
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

  const cellPad = compact ? "px-2 py-1.5 md:px-2.5" : "px-2.5 py-2 md:px-3";
  const tableText = compact
    ? "text-xs md:text-[13px]"
    : "text-[13px] md:text-sm";
  const lastCol = headers.length - 1;
  /** Tiny gap between card-shaped rows (matches dense accent lists). */
  const rowGapRem = 0.2;

  const cardEdge = (selected: boolean) =>
    selected
      ? "border-[color-mix(in_srgb,var(--felt)_45%,var(--line))]"
      : "border-[var(--line)]";

  return (
    <div className={flush ? "min-w-0" : "min-w-0 space-y-1.5"}>
      {toolbar ? (
        <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/55 px-3 py-2.5 sm:px-3.5">
          {toolbar}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table
          className={[
            "w-full table-fixed border-separate text-left",
            tableText,
          ].join(" ")}
          style={{
            minWidth: tableMinWidth,
            borderSpacing: `0 ${rowGapRem}rem`,
          }}
        >
          <colgroup>
            <col style={RAIL_STYLE} />
            {columnMeta.map((column, index) => (
              <col key={`col-${index}`} style={{ width: column.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th
                aria-hidden
                className="sticky left-0 z-20 rounded-l-[var(--radius)] border border-y border-l border-r-0 border-[var(--line)] bg-[var(--surface-2)] p-0"
                style={RAIL_STYLE}
              >
                <span className="block h-full min-h-[2.25rem] w-full" />
              </th>
              {headers.map((header, index) => {
                const active = sortColumn === index;
                const isSticky = index === stickyIndex;
                const isLast = index === lastCol;
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
                      "border-y border-[var(--line)] bg-[var(--surface-2)] font-semibold tracking-wide",
                      isLast
                        ? "rounded-r-[var(--radius)] border-r border-[var(--line)]"
                        : "border-r-0",
                      cellPad,
                      isSticky
                        ? "sticky z-10 shadow-[4px_0_10px_rgba(0,0,0,0.18)]"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={
                      isSticky ? { left: `${RAIL_REM}rem` } : undefined
                    }
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
                      className={[
                        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-0.5 py-0.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felt-soft)]",
                        active
                          ? "text-[var(--felt-deep)]"
                          : "text-[var(--muted)] hover:text-[var(--ink)]",
                      ].join(" ")}
                    >
                      <span className="text-[11px] uppercase tracking-[0.12em]">
                        {header}
                      </span>
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
              const edge = cardEdge(selected);
              const rowBg = selected
                ? "bg-[color-mix(in_srgb,var(--felt)_14%,var(--surface))]"
                : "bg-[color-mix(in_srgb,var(--surface)_88%,transparent)]";
              const stickyBg = selected
                ? "bg-[color-mix(in_srgb,var(--felt)_14%,var(--surface))]"
                : "bg-[color-mix(in_srgb,var(--surface)_96%,var(--paper))]";
              const hoverBg = clickable
                ? "group-hover:bg-[color-mix(in_srgb,var(--felt)_8%,var(--surface))]"
                : "";
              const hoverEdge = clickable
                ? "group-hover:border-[color-mix(in_srgb,var(--felt)_45%,var(--line))]"
                : "";
              return (
                <tr
                  key={`${originalIndex}-${displayIndex}`}
                  onClick={
                    onRowClick
                      ? () => onRowClick(row, originalIndex)
                      : undefined
                  }
                  className={[
                    "group",
                    clickable ? "cursor-pointer" : "",
                  ].join(" ")}
                >
                  <td
                    aria-hidden
                    className={[
                      "sticky left-0 z-[2] rounded-l-[var(--radius)] border border-y border-l border-r-0 p-0 transition-colors",
                      edge,
                      rowBg,
                      hoverBg,
                      hoverEdge,
                    ].join(" ")}
                    style={RAIL_STYLE}
                  >
                    <span className="block h-full min-h-[2.25rem] w-full rounded-l-[calc(var(--radius)-1px)] bg-[var(--felt)]" />
                  </td>
                  {headers.map((_, cellIndex) => {
                    const kind = columnMeta[cellIndex]?.kind ?? "stat";
                    const isSticky = cellIndex === stickyIndex;
                    const isLast = cellIndex === lastCol;
                    const value = row[cellIndex] ?? "";
                    return (
                      <td
                        key={cellIndex}
                        title={kind === "name" ? value : undefined}
                        className={[
                          "border-y border-l-0 border-r-0 transition-colors",
                          edge,
                          isLast ? "rounded-r-[var(--radius)] border-r" : "",
                          cellPad,
                          isSticky ? stickyBg : rowBg,
                          hoverBg,
                          hoverEdge,
                          isSticky
                            ? "sticky z-[1] font-semibold text-[var(--ink)] shadow-[4px_0_10px_rgba(0,0,0,0.16)]"
                            : kind === "rank"
                              ? "tabular-nums font-medium text-[var(--muted)]"
                              : "tabular-nums font-semibold text-[var(--ink)]",
                          kind === "name"
                            ? "truncate whitespace-nowrap font-semibold text-[var(--ink)]"
                            : "whitespace-nowrap",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={
                          isSticky ? { left: `${RAIL_REM}rem` } : undefined
                        }
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
