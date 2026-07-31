"use client";

import { useMemo, useState } from "react";
import type { RosterPlayer } from "@/lib/types";
import { DataTable } from "./DataTable";

type TeamPlayerStatsProps = {
  headers: string[];
  rows: string[][];
  roster?: RosterPlayer[];
};

function columnKind(header: string): "rank" | "name" | "stat" {
  const h = header.trim().toLowerCase();
  if (h === "#" || h === "rank" || h === "rk" || h === "pos") return "rank";
  if (
    h === "name" ||
    h === "player" ||
    h.includes("name") ||
    h.includes("player")
  ) {
    return "name";
  }
  return "stat";
}

function normalizePerson(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchFargo(
  playerName: string,
  roster: RosterPlayer[] | undefined,
): string {
  if (!roster?.length || !playerName) return "—";
  const target = normalizePerson(playerName);
  const targetParts = target.split(" ").filter(Boolean);

  for (const player of roster) {
    const full = normalizePerson(`${player.firstName} ${player.lastName}`);
    const flipped = normalizePerson(`${player.lastName} ${player.firstName}`);
    const comma = normalizePerson(`${player.lastName}, ${player.firstName}`);
    if (full === target || flipped === target || comma === target) {
      return String(player.fargoRating);
    }
  }

  for (const player of roster) {
    const full = normalizePerson(`${player.firstName} ${player.lastName}`);
    if (
      targetParts.every((part) => full.includes(part)) ||
      full.split(" ").every((part) => target.includes(part))
    ) {
      return String(player.fargoRating);
    }
  }
  return "—";
}

function isKeyHeader(header: string): boolean {
  const h = header.trim().toLowerCase();
  if (columnKind(header) === "rank" || columnKind(header) === "name") {
    return true;
  }
  if (h === "fargo") return true;
  if (h.includes("win") || h.includes("%")) return true;
  if (h === "gms" || h === "games") return true;
  if (h === "pts" || h === "points") return true;
  if (h === "w" || h === "wins") return true;
  return false;
}

export function TeamPlayerStats({
  headers,
  rows,
  roster,
}: TeamPlayerStatsProps) {
  const [showAll, setShowAll] = useState(false);

  const enriched = useMemo(() => {
    const nameIndex = headers.findIndex((header) => columnKind(header) === "name");
    const insertAt = nameIndex >= 0 ? nameIndex + 1 : 1;
    const alreadyHasFargo = headers.some(
      (header) => header.trim().toLowerCase() === "fargo",
    );

    if (alreadyHasFargo) {
      return { headers, rows };
    }

    const nextHeaders = [
      ...headers.slice(0, insertAt),
      "Fargo",
      ...headers.slice(insertAt),
    ];
    const nextRows = rows.map((row) => {
      const playerName = nameIndex >= 0 ? (row[nameIndex] ?? "") : "";
      const fargo = matchFargo(playerName, roster);
      return [...row.slice(0, insertAt), fargo, ...row.slice(insertAt)];
    });
    return { headers: nextHeaders, rows: nextRows };
  }, [headers, rows, roster]);

  const visible = useMemo(() => {
    if (showAll) return enriched;

    const keepIndexes = enriched.headers
      .map((header, index) => (isKeyHeader(header) ? index : -1))
      .filter((index) => index >= 0);

    return {
      headers: keepIndexes.map((index) => enriched.headers[index] ?? ""),
      rows: enriched.rows.map((row) =>
        keepIndexes.map((index) => row[index] ?? ""),
      ),
    };
  }, [enriched, showAll]);

  const hiddenCount = enriched.headers.length - visible.headers.length;

  if (!enriched.rows.length) {
    return (
      <p className="py-6 text-center text-sm text-[var(--muted)]">
        No player stats for this team.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--muted)]">
          Tap a column header to sort. Names stay pinned while you scroll
          sideways.
        </p>
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--line-strong)]"
        >
          {showAll
            ? "Key stats"
            : hiddenCount > 0
              ? `All stats (+${hiddenCount})`
              : "All stats"}
        </button>
      </div>

      <DataTable
        key={showAll ? "all-stats" : "key-stats"}
        headers={visible.headers}
        rows={visible.rows}
        stickyFirst
        compact
        emptyText="No player stats for this team."
      />
    </div>
  );
}
