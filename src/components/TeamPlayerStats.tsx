"use client";

import { useMemo } from "react";
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

export function TeamPlayerStats({
  headers,
  rows,
  roster,
}: TeamPlayerStatsProps) {
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

  if (!enriched.rows.length) {
    return (
      <p className="py-6 text-center text-sm text-[var(--muted)]">
        No player stats for this team.
      </p>
    );
  }

  return (
    <DataTable
      headers={enriched.headers}
      rows={enriched.rows}
      stickyFirst
      compact
      tone="quiet"
      emptyText="No player stats for this team."
    />
  );
}
