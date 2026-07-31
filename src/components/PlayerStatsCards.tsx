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

function statPriority(header: string): number {
  const h = header.trim().toLowerCase();
  if (h.includes("win") && h.includes("%")) return 0;
  if (h === "win%" || h === "win %") return 0;
  if (h.includes("%")) return 1;
  if (h === "gms" || h === "games") return 2;
  if (h === "pts" || h === "points") return 3;
  if (h === "w" || h === "wins") return 4;
  if (h === "rds" || h === "wks") return 5;
  return 10;
}

function isPrimaryStat(header: string): boolean {
  return statPriority(header) < 10;
}

function parsePercent(value: string): number | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)%$/);
  if (!match) return null;
  return Number(match[1]);
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
      .map((header, index) => ({ header, index, priority: statPriority(header) }))
      .filter(({ index }) => index !== rankIndex && index !== nameIndex)
      .sort((a, b) => a.priority - b.priority || a.index - b.index);
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
    <ul className="space-y-4">
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
        const winStat = primary.find(({ header }) => {
          const h = header.toLowerCase();
          return h.includes("win") || h.includes("%");
        });
        const winValue = winStat ? (row[winStat.index] ?? "").trim() : "";
        const winPct = winValue ? parsePercent(winValue) : null;
        const otherPrimary = primary.filter(
          (item) => item.index !== winStat?.index,
        );

        return (
          <li
            key={`${name}-${rowIndex}`}
            className="overflow-hidden rounded-[1.35rem] border border-[var(--line)] bg-[linear-gradient(165deg,var(--surface-2)_0%,var(--surface)_70%)] shadow-[var(--shadow)]"
          >
            <div className="flex items-stretch">
              <div className="w-1.5 shrink-0 bg-[linear-gradient(180deg,var(--felt)_0%,var(--amber)_100%)]" />
              <div className="min-w-0 flex-1 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {rank ? (
                        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--felt)] px-2 text-xs font-bold text-white">
                          #{rank}
                        </span>
                      ) : null}
                      <h5 className="truncate font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--felt-deep)]">
                        {name}
                      </h5>
                    </div>
                  </div>
                  {fargo != null ? (
                    <div className="shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                        Fargo
                      </p>
                      <p className="mt-0.5 text-2xl font-bold tabular-nums leading-none text-[var(--felt)]">
                        {fargo}
                      </p>
                    </div>
                  ) : null}
                </div>

                {winStat ? (
                  <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]/80 px-3.5 py-3">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
                          {winStat.header}
                        </p>
                        <p className="mt-1 font-[family-name:var(--font-display)] text-4xl font-bold tabular-nums leading-none text-[var(--ink)]">
                          {winValue || "—"}
                        </p>
                      </div>
                      {winPct != null ? (
                        <p className="pb-1 text-xs text-[var(--muted)]">
                          {winPct >= 60
                            ? "Hot streak"
                            : winPct >= 45
                              ? "Solid form"
                              : "Building up"}
                        </p>
                      ) : null}
                    </div>
                    {winPct != null ? (
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface)]">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,var(--felt-soft),var(--felt))]"
                          style={{
                            width: `${Math.max(0, Math.min(winPct, 100))}%`,
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {otherPrimary.length ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {otherPrimary.map(({ header, index }) => (
                      <div
                        key={`${header}-${index}`}
                        className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5"
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                          {header}
                        </p>
                        <p className="mt-1 text-2xl font-bold tabular-nums leading-none text-[var(--ink)]">
                          {row[index] || "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {secondary.length ? (
                  <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                    {secondary.map(({ header, index }) => (
                      <div
                        key={`${header}-${index}`}
                        className="rounded-xl bg-[var(--surface)]/70 px-2 py-2 text-center"
                      >
                        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                          {header}
                        </p>
                        <p className="mt-1 text-sm font-semibold tabular-nums text-[var(--ink)]">
                          {row[index] || "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
