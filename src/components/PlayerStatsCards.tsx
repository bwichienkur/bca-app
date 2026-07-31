"use client";

import { useMemo } from "react";
import type { RosterPlayer } from "@/lib/types";

type PlayerStatsCardsProps = {
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
): number | null {
  if (!roster?.length || !playerName) return null;
  const target = normalizePerson(playerName);
  const targetParts = target.split(" ").filter(Boolean);

  for (const player of roster) {
    const full = normalizePerson(`${player.firstName} ${player.lastName}`);
    const flipped = normalizePerson(`${player.lastName} ${player.firstName}`);
    const comma = normalizePerson(`${player.lastName}, ${player.firstName}`);
    if (full === target || flipped === target || comma === target) {
      return player.fargoRating;
    }
  }

  // Loose contains match for nicknames / ordering differences
  for (const player of roster) {
    const full = normalizePerson(`${player.firstName} ${player.lastName}`);
    if (
      targetParts.every((part) => full.includes(part)) ||
      full.split(" ").every((part) => target.includes(part))
    ) {
      return player.fargoRating;
    }
  }
  return null;
}

function isPrimaryStat(header: string): boolean {
  const h = header.trim().toLowerCase();
  return (
    h.includes("win") ||
    h.includes("%") ||
    h === "gms" ||
    h === "games" ||
    h === "pts" ||
    h === "points" ||
    h === "w" ||
    h === "wins" ||
    h === "rds" ||
    h === "wks"
  );
}

export function PlayerStatsCards({
  headers,
  rows,
  roster,
}: PlayerStatsCardsProps) {
  const meta = useMemo(() => {
    const rankIndex = headers.findIndex((h) => columnKind(h) === "rank");
    const nameIndex = headers.findIndex((h) => columnKind(h) === "name");
    const statIndexes = headers
      .map((header, index) => ({ header, index }))
      .filter(
        ({ index }) => index !== rankIndex && index !== nameIndex,
      );
    return { rankIndex, nameIndex, statIndexes };
  }, [headers]);

  if (!rows.length) {
    return (
      <p className="py-6 text-center text-sm text-[var(--muted)]">
        No player stats for this team.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((row, rowIndex) => {
        const name =
          (meta.nameIndex >= 0 ? row[meta.nameIndex] : "")?.trim() ||
          `Player ${rowIndex + 1}`;
        const rank =
          meta.rankIndex >= 0 ? (row[meta.rankIndex] ?? "").trim() : "";
        const fargo = matchFargo(name, roster);
        const primary = meta.statIndexes.filter(({ header }) =>
          isPrimaryStat(header),
        );
        const secondary = meta.statIndexes.filter(
          ({ header }) => !isPrimaryStat(header),
        );

        return (
          <li
            key={`${name}-${rowIndex}`}
            className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3.5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {rank ? (
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--felt)]/20 px-2 text-xs font-semibold text-[var(--felt-deep)]">
                      #{rank}
                    </span>
                  ) : null}
                  <h5 className="truncate text-base font-semibold text-[var(--ink)]">
                    {name}
                  </h5>
                </div>
              </div>
              {fargo != null ? (
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    Fargo
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-[var(--felt)]">
                    {fargo}
                  </p>
                </div>
              ) : null}
            </div>

            {primary.length ? (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {primary.map(({ header, index }) => (
                  <div
                    key={`${header}-${index}`}
                    className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      {header}
                    </p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums leading-tight text-[var(--ink)]">
                      {row[index] || "—"}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            {secondary.length ? (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {secondary.map(({ header, index }) => (
                  <div
                    key={`${header}-${index}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      {header}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-[var(--ink)]">
                      {row[index] || "—"}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
