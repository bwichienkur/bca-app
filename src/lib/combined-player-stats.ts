/**
 * Merge LMS players-by-team reports across combined-night legs.
 *
 * Sum shared counters (PTS F/A, BRS, …), keep WKS as max (same weeks),
 * and recalculate percentages from the combined totals.
 */

import { canonicalizeTeamKey } from "./division-combos";
import { personKeys } from "./players";
import type { PlayersByTeamReport } from "./types";

export type PlayersByTeamLeg = {
  label?: string;
  report: PlayersByTeamReport | null | undefined;
};

type ColumnKind =
  | "name"
  | "rank"
  | "weeks"
  | "percent"
  | "average"
  | "ratio"
  | "sum";

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

function columnKind(header: string): ColumnKind {
  const h = normalizeHeader(header);
  if (h === "#" || h === "rank" || h === "rk" || h === "pos") return "rank";
  if (
    h === "name" ||
    h === "player" ||
    h.includes("name") ||
    h.includes("player")
  ) {
    return "name";
  }
  if (h === "wks" || h === "weeks" || h.includes("week")) return "weeks";
  if (h.includes("pct") || h.includes("percent") || h.endsWith("%")) {
    return "percent";
  }
  if (h === "avg" || h === "average" || h.includes("avg")) return "average";
  if (h.includes("f/a") || h.includes("for/against") || h.includes("/")) {
    return "ratio";
  }
  return "sum";
}

function parseNumber(value: string | null | undefined): number {
  if (value == null) return 0;
  const trimmed = value.trim().replace(/,/g, "").replace(/%$/, "");
  if (!trimmed || trimmed === "—" || trimmed === "-") return 0;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : 0;
}

function parseRatio(
  value: string | null | undefined,
): { for: number; against: number } | null {
  if (value == null) return null;
  const match = value
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  return { for: Number(match[1]), against: Number(match[2]) };
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}

function formatPercent(forPts: number, againstPts: number): string {
  const total = forPts + againstPts;
  if (total <= 0) return "0%";
  return `${Math.round((100 * forPts) / total)}%`;
}

function formatAverage(forPts: number, weeks: number, games: number): string {
  // Prefer points per week when weeks exist; otherwise per game from F/A.
  if (weeks > 0) {
    const avg = forPts / weeks;
    return Number.isInteger(avg) ? String(avg) : avg.toFixed(1);
  }
  if (games > 0) {
    const avg = forPts / games;
    return Number.isInteger(avg) ? String(avg) : avg.toFixed(1);
  }
  return "0";
}

function headerKey(header: string): string {
  return normalizeHeader(header);
}

function pickCanonicalHeaders(
  reports: PlayersByTeamReport[],
): string[] {
  const seen = new Set<string>();
  const headers: string[] = [];
  for (const report of reports) {
    for (const header of report.headers) {
      const key = headerKey(header);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      headers.push(header.trim());
    }
  }
  return headers;
}

function indexMap(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((header, index) => {
    map.set(headerKey(header), index);
  });
  return map;
}

type PlayerAgg = {
  displayName: string;
  /** Parallel to canonical headers. */
  sums: number[];
  ratioFor: number[];
  ratioAgainst: number[];
  weeks: number;
  /** Weight for optional AVG fallback (games from F/A). */
  avgWeight: number;
  avgWeightedSum: number;
};

function playerMatchKey(name: string): string {
  const keys = personKeys(name);
  return keys[0] ?? name.trim().toLowerCase();
}

/**
 * Fold N players-by-team reports into one combined report.
 * Empty / single-leg input returns the first usable report unchanged.
 */
export function mergeCombinedPlayersByTeam(
  legs: PlayersByTeamLeg[],
): PlayersByTeamReport {
  const reports = legs
    .map((leg) => leg.report)
    .filter((report): report is PlayersByTeamReport =>
      Boolean(report?.headers?.length && report.teams),
    );

  if (reports.length === 0) {
    return { headers: [], teams: [] };
  }
  if (reports.length === 1) {
    return reports[0]!;
  }

  const headers = pickCanonicalHeaders(reports);
  const kinds = headers.map((header) => columnKind(header));
  const nameIdx = kinds.findIndex((kind) => kind === "name");
  const weeksIdx = kinds.findIndex((kind) => kind === "weeks");
  const percentIdx = kinds.findIndex((kind) => kind === "percent");
  const averageIdx = kinds.findIndex((kind) => kind === "average");
  const ratioIdx = kinds.findIndex((kind) => kind === "ratio");

  type TeamAgg = {
    displayName: string;
    players: Map<string, PlayerAgg>;
  };

  const teams = new Map<string, TeamAgg>();

  const ensurePlayer = (team: TeamAgg, name: string): PlayerAgg => {
    const key = playerMatchKey(name);
    const existing = team.players.get(key);
    if (existing) {
      if (!existing.displayName && name.trim()) {
        existing.displayName = name.trim();
      }
      return existing;
    }
    // Also try matching via any personKeys alias already stored.
    for (const [existingKey, player] of team.players) {
      const aliases = new Set(personKeys(player.displayName));
      for (const candidate of personKeys(name)) {
        if (aliases.has(candidate)) {
          team.players.delete(existingKey);
          team.players.set(key, player);
          return player;
        }
      }
    }
    const created: PlayerAgg = {
      displayName: name.trim(),
      sums: headers.map(() => 0),
      ratioFor: headers.map(() => 0),
      ratioAgainst: headers.map(() => 0),
      weeks: 0,
      avgWeight: 0,
      avgWeightedSum: 0,
    };
    team.players.set(key, created);
    return created;
  };

  for (const report of reports) {
    const srcIndex = indexMap(report.headers);
    const srcNameIdx =
      report.headers.findIndex((h) => columnKind(h) === "name") >= 0
        ? report.headers.findIndex((h) => columnKind(h) === "name")
        : 0;

    for (const group of report.teams) {
      const teamName = group.team.replace(/^\((H|A)\)\s*/i, "").trim();
      const teamKey = canonicalizeTeamKey(teamName);
      if (!teamKey || teamKey === "bye") continue;

      const teamAgg = teams.get(teamKey) ?? {
        displayName: teamName,
        players: new Map(),
      };
      if (!teams.has(teamKey)) teams.set(teamKey, teamAgg);

      for (const row of group.rows) {
        const playerName = (row[srcNameIdx] ?? "").trim();
        if (!playerName) continue;
        const player = ensurePlayer(teamAgg, playerName);

        headers.forEach((header, destIdx) => {
          const srcIdx = srcIndex.get(headerKey(header));
          if (srcIdx == null) return;
          const raw = row[srcIdx] ?? "";
          const kind = kinds[destIdx]!;

          if (kind === "name" || kind === "rank") return;

          if (kind === "weeks") {
            player.weeks = Math.max(player.weeks, parseNumber(raw));
            return;
          }

          if (kind === "ratio") {
            const ratio = parseRatio(raw);
            if (!ratio) return;
            player.ratioFor[destIdx] += ratio.for;
            player.ratioAgainst[destIdx] += ratio.against;
            return;
          }

          if (kind === "percent") {
            // Derived later from combined F/A (or left blank until then).
            return;
          }

          if (kind === "average") {
            const avg = parseNumber(raw);
            // Weight by this leg’s F/A games when available on the same row.
            let weight = 1;
            if (ratioIdx >= 0) {
              const ratioHeader = headers[ratioIdx]!;
              const ratioSrc = srcIndex.get(headerKey(ratioHeader));
              const ratio = ratioSrc != null ? parseRatio(row[ratioSrc]) : null;
              if (ratio) weight = Math.max(1, ratio.for + ratio.against);
            } else if (weeksIdx >= 0) {
              const weeksHeader = headers[weeksIdx]!;
              const weeksSrc = srcIndex.get(headerKey(weeksHeader));
              if (weeksSrc != null) {
                weight = Math.max(1, parseNumber(row[weeksSrc]));
              }
            }
            player.avgWeightedSum += avg * weight;
            player.avgWeight += weight;
            return;
          }

          // summable counters: BRS, WZS, TRS, PTS, GMS, …
          player.sums[destIdx] += parseNumber(raw);
        });
      }
    }
  }

  const sortedTeams = Array.from(teams.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );

  return {
    headers,
    teams: sortedTeams.map((team) => {
      const players = Array.from(team.players.values()).map((player) => {
        const cells = headers.map((header, index) => {
          const kind = kinds[index]!;
          if (kind === "name") return player.displayName;
          if (kind === "rank") return "";
          if (kind === "weeks") return formatNumber(player.weeks);

          if (kind === "ratio") {
            return `${formatNumber(player.ratioFor[index]!)}/${formatNumber(player.ratioAgainst[index]!)}`;
          }

          if (kind === "percent") {
            if (ratioIdx >= 0) {
              return formatPercent(
                player.ratioFor[ratioIdx]!,
                player.ratioAgainst[ratioIdx]!,
              );
            }
            return "0%";
          }

          if (kind === "average") {
            // Prefer game-weighted LMS AVG (preserves win-value sheets where
            // AVG is ~1). Fall back to pts ÷ weeks / pts ÷ games.
            if (player.avgWeight > 0) {
              const weighted = player.avgWeightedSum / player.avgWeight;
              return formatNumber(Math.round(weighted * 100) / 100);
            }
            if (ratioIdx >= 0) {
              return formatAverage(
                player.ratioFor[ratioIdx]!,
                player.weeks,
                player.ratioFor[ratioIdx]! + player.ratioAgainst[ratioIdx]!,
              );
            }
            return "0";
          }

          return formatNumber(player.sums[index]!);
        });

        const sortFor = ratioIdx >= 0 ? player.ratioFor[ratioIdx]! : 0;
        const sortAgainst = ratioIdx >= 0 ? player.ratioAgainst[ratioIdx]! : 0;
        const sortPct =
          sortFor + sortAgainst > 0
            ? sortFor / (sortFor + sortAgainst)
            : 0;
        return { cells, sortPct, sortFor };
      });

      players.sort((a, b) => {
        if (b.sortPct !== a.sortPct) return b.sortPct - a.sortPct;
        if (b.sortFor !== a.sortFor) return b.sortFor - a.sortFor;
        const nameA = nameIdx >= 0 ? a.cells[nameIdx]! : "";
        const nameB = nameIdx >= 0 ? b.cells[nameIdx]! : "";
        return nameA.localeCompare(nameB);
      });

      const rankIdx = kinds.findIndex((kind) => kind === "rank");
      const rows = players.map((player, index) => {
        const row = [...player.cells];
        if (rankIdx >= 0) row[rankIdx] = String(index + 1);
        return row;
      });

      return { team: team.displayName, rows };
    }),
  };
}
