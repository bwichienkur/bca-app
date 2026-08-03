"use client";

import { useMemo, useState, type ReactNode } from "react";

type SortDirection = "asc" | "desc";

type ColumnKind = "rank" | "name" | "stat";

type DivisionPlayersListProps = {
  headers: string[];
  rows: string[][];
  emptyText?: string;
  /** Placed above the sort tray inside the same composition well. */
  toolbar?: ReactNode;
};

function compareValues(a: string, b: string): number {
  const aTrim = (a ?? "").trim();
  const bTrim = (b ?? "").trim();

  const aPct = aTrim.match(/^(-?\d+(?:\.\d+)?)%$/);
  const bPct = bTrim.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (aPct && bPct) {
    return Number(aPct[1]) - Number(bPct[1]);
  }

  const aRatio = aTrim.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  const bRatio = bTrim.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (aRatio && bRatio) {
    const aVal = Number(aRatio[1]) - Number(aRatio[2]);
    const bVal = Number(bRatio[1]) - Number(bRatio[2]);
    if (aVal !== bVal) return aVal - bVal;
    return Number(aRatio[1]) - Number(bRatio[1]);
  }

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
    h === "name" ||
    h === "player" ||
    h.includes("player") ||
    (h.includes("name") && !h.includes("team"))
  ) {
    return "name";
  }
  return "stat";
}

function isTeamHeader(header: string): boolean {
  const h = header.trim().toLowerCase();
  return h === "team" || h.includes("team");
}

function shortHeader(header: string): string {
  const h = header.trim().toLowerCase();
  if (h === "#" || h === "rank" || h === "rk" || h === "pos") return "#";
  if (h === "win%" || h === "win %") return "Win%";
  if (h === "rds") return "Rds";
  if (h === "wks") return "Wks";
  if (h === "pts" || h === "points") return "Pts";
  if (h === "gms" || h === "games") return "Gms";
  if (h === "fargo" || h === "rating") return "Rating";
  if (h.includes("pts") && h.includes("for")) return "Pts";
  if (h.includes("gms") && h.includes("for")) return "Gms";
  return header.trim();
}

function isRatingHeader(header: string): boolean {
  const h = header.trim().toLowerCase();
  return h === "rating" || h === "fargo" || h.includes("rating");
}

function parseRank(value: string): number | null {
  const match = value.trim().replace(/^#/, "").match(/^(\d+)/);
  if (!match) return null;
  return Number(match[1]);
}

function RankChip({ value }: { value: string }) {
  const rank = parseRank(value);
  const top =
    rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : null;

  if (top === "gold") {
    return (
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(145deg,var(--amber),#c4843a)] font-[family-name:var(--font-display)] text-sm font-semibold tabular-nums text-[#1a140c] shadow-[0_8px_18px_rgba(224,163,90,0.28)]">
        {rank}
      </span>
    );
  }
  if (top === "silver") {
    return (
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(145deg,var(--felt-deep),var(--chalk))] font-[family-name:var(--font-display)] text-sm font-semibold tabular-nums text-[var(--felt-soft)] shadow-[0_8px_18px_rgba(126,182,209,0.22)]">
        {rank}
      </span>
    );
  }
  if (top === "bronze") {
    return (
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(145deg,var(--felt),var(--felt-soft))] font-[family-name:var(--font-display)] text-sm font-semibold tabular-nums text-white shadow-[0_8px_18px_rgba(29,110,158,0.28)]">
        {rank}
      </span>
    );
  }

  return (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-3)] font-[family-name:var(--font-display)] text-sm font-semibold tabular-nums text-[var(--muted)] ring-1 ring-[var(--line)]">
      {value.trim() || "—"}
    </span>
  );
}

export function DivisionPlayersList({
  headers,
  rows,
  emptyText = "No players match your filter.",
  toolbar,
}: DivisionPlayersListProps) {
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const kinds = useMemo(() => headers.map(columnKind), [headers]);
  const rankIndex = useMemo(
    () => kinds.findIndex((kind) => kind === "rank"),
    [kinds],
  );
  const nameIndex = useMemo(
    () => kinds.findIndex((kind) => kind === "name"),
    [kinds],
  );
  const ratingIndex = useMemo(
    () => headers.findIndex((header) => isRatingHeader(header)),
    [headers],
  );
  const teamIndex = useMemo(
    () => headers.findIndex((header) => isTeamHeader(header)),
    [headers],
  );
  const statIndexes = useMemo(
    () =>
      headers
        .map((_, index) => index)
        .filter(
          (index) =>
            index !== rankIndex &&
            index !== nameIndex &&
            index !== ratingIndex &&
            index !== teamIndex,
        ),
    [headers, rankIndex, nameIndex, ratingIndex, teamIndex],
  );

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

  if (!headers.length && !rows.length) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted)]">{emptyText}</p>
    );
  }

  return (
    <div className="overflow-hidden rounded-[1.35rem] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
      {toolbar ? (
        <div className="border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--felt)_10%,var(--surface))] px-3 py-3 sm:px-4">
          {toolbar}
        </div>
      ) : null}

      <div
        role="toolbar"
        aria-label="Sort players"
        className="flex gap-1.5 overflow-x-auto border-b border-[var(--line)] bg-[var(--surface-2)]/70 px-2.5 py-2 [scrollbar-width:thin] sm:px-3"
      >
        {headers.map((header, index) => {
          const active = sortColumn === index;
          return (
            <button
              key={`${header}-${index}`}
              type="button"
              onClick={() => toggleSort(index)}
              aria-pressed={active}
              title={
                active
                  ? sortDirection === "asc"
                    ? "Sorted ascending — click for descending"
                    : "Sorted descending — click to clear sort"
                  : `Sort by ${header}`
              }
              className={[
                "inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition",
                active
                  ? "bg-[var(--felt-soft)] text-white shadow-[0_6px_14px_rgba(21,90,130,0.35)]"
                  : "bg-[var(--surface)] text-[var(--muted)] ring-1 ring-[var(--line)] hover:text-[var(--ink)] hover:ring-[var(--line-strong)]",
              ].join(" ")}
            >
              <span>{shortHeader(header)}</span>
              <span
                className={[
                  "text-[10px] leading-none",
                  active ? "opacity-100" : "opacity-40",
                ].join(" ")}
                aria-hidden
              >
                {active ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
              </span>
            </button>
          );
        })}
      </div>

      {sortedRows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-[var(--muted)]">
          {emptyText}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {sortedRows.map(({ row, index: originalIndex }, displayIndex) => {
            const rankValue =
              rankIndex >= 0 ? (row[rankIndex] ?? "").trim() : String(displayIndex + 1);
            const name =
              nameIndex >= 0
                ? (row[nameIndex] ?? "").trim()
                : (row[0] ?? "").trim();
            const team =
              teamIndex >= 0 ? (row[teamIndex] ?? "").trim() : "";
            const rating =
              ratingIndex >= 0 ? (row[ratingIndex] ?? "").trim() : "";

            return (
              <li
                key={`${originalIndex}-${displayIndex}`}
                className="animate-players-row px-3 py-3 transition-colors hover:bg-[color-mix(in_srgb,var(--felt)_8%,transparent)] sm:px-4"
                style={{ animationDelay: `${Math.min(displayIndex, 12) * 28}ms` }}
              >
                <div className="flex items-start gap-3">
                  <RankChip value={rankValue || String(displayIndex + 1)} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          title={name}
                          className="truncate font-[family-name:var(--font-display)] text-lg font-semibold leading-tight tracking-tight text-[var(--ink)]"
                        >
                          {name || "—"}
                        </p>
                        {team ? (
                          <p
                            title={team}
                            className="mt-0.5 truncate text-xs text-[var(--muted)]"
                          >
                            {team}
                          </p>
                        ) : null}
                      </div>
                      {rating ? (
                        <div className="shrink-0 rounded-xl bg-[color-mix(in_srgb,var(--felt)_22%,var(--surface-2))] px-2.5 py-1 text-right ring-1 ring-[color-mix(in_srgb,var(--felt)_40%,transparent)]">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--chalk)]">
                            Rating
                          </p>
                          <p className="font-[family-name:var(--font-display)] text-base font-semibold tabular-nums leading-none text-[var(--felt-deep)]">
                            {rating}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    {statIndexes.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                        {statIndexes.map((statIndex) => {
                          const label = shortHeader(headers[statIndex] ?? "");
                          const value = (row[statIndex] ?? "").trim() || "—";
                          const highlighted = sortColumn === statIndex;
                          return (
                            <span
                              key={statIndex}
                              className={[
                                "inline-flex items-baseline gap-1 text-xs tabular-nums",
                                highlighted
                                  ? "text-[var(--amber)]"
                                  : "text-[var(--muted)]",
                              ].join(" ")}
                            >
                              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] opacity-80">
                                {label}
                              </span>
                              <span
                                className={[
                                  "font-semibold",
                                  highlighted
                                    ? "text-[var(--amber)]"
                                    : "text-[var(--ink)]",
                                ].join(" ")}
                              >
                                {value}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
