/**
 * Merge LMS player reports across combined-night legs.
 *
 * Sum shared counters (PTS F/A, BRS, …), keep WKS as max (same weeks),
 * and recalculate percentages from the combined totals.
 */

import { canonicalizeTeamKey } from "./division-combos";
import { personKeys } from "./players";
import type { PlayersByTeamReport, TableReport } from "./types";

export type PlayersByTeamLeg = {
  label?: string;
  report: PlayersByTeamReport | null | undefined;
};

export type PlayerStandingsLeg = {
  label?: string;
  report: TableReport | null | undefined;
};

type ColumnKind =
  | "name"
  | "team"
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
    (h.includes("name") && !h.includes("team")) ||
    (h.includes("player") && !h.includes("team"))
  ) {
    return "name";
  }
  if (h === "team" || h.includes("team")) return "team";
  if (h === "wks" || h === "weeks" || h.includes("week")) return "weeks";
  if (h.includes("pct") || h.includes("percent") || h.endsWith("%")) {
    return "percent";
  }
  if (h === "avg" || h === "average" || h.includes("avg")) return "average";
  if (h.includes("f/a") || h.includes("for/against") || /\//.test(h)) {
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
  headerLists: string[][],
): string[] {
  const seen = new Set<string>();
  const headers: string[] = [];
  for (const list of headerLists) {
    for (const header of list) {
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
  teamName: string;
  sums: number[];
  ratioFor: number[];
  ratioAgainst: number[];
  weeks: number;
  avgWeight: number;
  avgWeightedSum: number;
};

function playerMatchKey(name: string): string {
  const keys = personKeys(name);
  return keys[0] ?? name.trim().toLowerCase();
}

function emptyPlayer(headers: string[], name: string): PlayerAgg {
  return {
    displayName: name.trim(),
    teamName: "",
    sums: headers.map(() => 0),
    ratioFor: headers.map(() => 0),
    ratioAgainst: headers.map(() => 0),
    weeks: 0,
    avgWeight: 0,
    avgWeightedSum: 0,
  };
}

function findOrCreatePlayer(
  players: Map<string, PlayerAgg>,
  headers: string[],
  name: string,
): PlayerAgg {
  const key = playerMatchKey(name);
  const existing = players.get(key);
  if (existing) {
    if (!existing.displayName && name.trim()) {
      existing.displayName = name.trim();
    }
    return existing;
  }
  for (const [existingKey, player] of players) {
    const aliases = new Set(personKeys(player.displayName));
    for (const candidate of personKeys(name)) {
      if (aliases.has(candidate)) {
        players.delete(existingKey);
        players.set(key, player);
        return player;
      }
    }
  }
  const created = emptyPlayer(headers, name);
  players.set(key, created);
  return created;
}

function accumulateRow(args: {
  player: PlayerAgg;
  row: string[];
  srcHeaders: string[];
  destHeaders: string[];
  kinds: ColumnKind[];
  ratioIdx: number;
  weeksIdx: number;
}): void {
  const srcIndex = indexMap(args.srcHeaders);
  args.destHeaders.forEach((header, destIdx) => {
    const srcIdx = srcIndex.get(headerKey(header));
    if (srcIdx == null) return;
    const raw = args.row[srcIdx] ?? "";
    const kind = args.kinds[destIdx]!;

    if (kind === "name" || kind === "rank") return;

    if (kind === "team") {
      const team = raw.replace(/^\((H|A)\)\s*/i, "").trim();
      if (team && !args.player.teamName) args.player.teamName = team;
      return;
    }

    if (kind === "weeks") {
      args.player.weeks = Math.max(args.player.weeks, parseNumber(raw));
      return;
    }

    if (kind === "ratio") {
      const ratio = parseRatio(raw);
      if (!ratio) return;
      args.player.ratioFor[destIdx] += ratio.for;
      args.player.ratioAgainst[destIdx] += ratio.against;
      return;
    }

    if (kind === "percent") return;

    if (kind === "average") {
      const avg = parseNumber(raw);
      let weight = 1;
      if (args.ratioIdx >= 0) {
        const ratioHeader = args.destHeaders[args.ratioIdx]!;
        const ratioSrc = srcIndex.get(headerKey(ratioHeader));
        const ratio = ratioSrc != null ? parseRatio(args.row[ratioSrc]) : null;
        if (ratio) weight = Math.max(1, ratio.for + ratio.against);
      } else if (args.weeksIdx >= 0) {
        const weeksHeader = args.destHeaders[args.weeksIdx]!;
        const weeksSrc = srcIndex.get(headerKey(weeksHeader));
        if (weeksSrc != null) {
          weight = Math.max(1, parseNumber(args.row[weeksSrc]));
        }
      }
      args.player.avgWeightedSum += avg * weight;
      args.player.avgWeight += weight;
      return;
    }

    args.player.sums[destIdx] += parseNumber(raw);
  });
}

function finalizePlayerRows(args: {
  players: PlayerAgg[];
  headers: string[];
  kinds: ColumnKind[];
  nameIdx: number;
  ratioIdx: number;
}): string[][] {
  const { headers, kinds, nameIdx, ratioIdx } = args;

  const ranked = args.players.map((player) => {
    const cells = headers.map((_, index) => {
      const kind = kinds[index]!;
      if (kind === "name") return player.displayName;
      if (kind === "team") return player.teamName;
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
      sortFor + sortAgainst > 0 ? sortFor / (sortFor + sortAgainst) : 0;
    return { cells, sortPct, sortFor };
  });

  ranked.sort((a, b) => {
    if (b.sortPct !== a.sortPct) return b.sortPct - a.sortPct;
    if (b.sortFor !== a.sortFor) return b.sortFor - a.sortFor;
    const nameA = nameIdx >= 0 ? a.cells[nameIdx]! : "";
    const nameB = nameIdx >= 0 ? b.cells[nameIdx]! : "";
    return nameA.localeCompare(nameB);
  });

  const rankIdx = kinds.findIndex((kind) => kind === "rank");
  return ranked.map((player, index) => {
    const row = [...player.cells];
    if (rankIdx >= 0) row[rankIdx] = String(index + 1);
    return row;
  });
}

/**
 * Fold N division player-standings reports into one combined table.
 */
export function mergeCombinedPlayerStandings(
  legs: PlayerStandingsLeg[],
): TableReport {
  const reports = legs
    .map((leg) => leg.report)
    .filter((report): report is TableReport =>
      Boolean(report?.headers?.length),
    );

  if (reports.length === 0) {
    return { headers: [], rows: [] };
  }
  if (reports.length === 1) {
    return reports[0]!;
  }

  const headers = pickCanonicalHeaders(reports.map((r) => r.headers));
  const kinds = headers.map((header) => columnKind(header));
  const nameIdx = kinds.findIndex((kind) => kind === "name");
  const weeksIdx = kinds.findIndex((kind) => kind === "weeks");
  const ratioIdx = kinds.findIndex((kind) => kind === "ratio");

  const players = new Map<string, PlayerAgg>();

  for (const report of reports) {
    const srcNameIdx = report.headers.findIndex(
      (h) => columnKind(h) === "name",
    );
    if (srcNameIdx < 0) continue;

    for (const row of report.rows) {
      const playerName = (row[srcNameIdx] ?? "").trim();
      if (!playerName) continue;
      const player = findOrCreatePlayer(players, headers, playerName);
      accumulateRow({
        player,
        row,
        srcHeaders: report.headers,
        destHeaders: headers,
        kinds,
        ratioIdx,
        weeksIdx,
      });
    }
  }

  return {
    headers,
    rows: finalizePlayerRows({
      players: Array.from(players.values()),
      headers,
      kinds,
      nameIdx,
      ratioIdx,
    }),
  };
}

/**
 * Fold N players-by-team reports into one combined report.
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

  const headers = pickCanonicalHeaders(reports.map((r) => r.headers));
  const kinds = headers.map((header) => columnKind(header));
  const nameIdx = kinds.findIndex((kind) => kind === "name");
  const weeksIdx = kinds.findIndex((kind) => kind === "weeks");
  const ratioIdx = kinds.findIndex((kind) => kind === "ratio");

  type TeamAgg = {
    displayName: string;
    players: Map<string, PlayerAgg>;
  };

  const teams = new Map<string, TeamAgg>();

  for (const report of reports) {
    const srcNameIdx = report.headers.findIndex(
      (h) => columnKind(h) === "name",
    );
    const resolvedNameIdx = srcNameIdx >= 0 ? srcNameIdx : 0;

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
        const playerName = (row[resolvedNameIdx] ?? "").trim();
        if (!playerName) continue;
        const player = findOrCreatePlayer(
          teamAgg.players,
          headers,
          playerName,
        );
        if (!player.teamName) player.teamName = teamName;
        accumulateRow({
          player,
          row,
          srcHeaders: report.headers,
          destHeaders: headers,
          kinds,
          ratioIdx,
          weeksIdx,
        });
      }
    }
  }

  const sortedTeams = Array.from(teams.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );

  return {
    headers,
    teams: sortedTeams.map((team) => ({
      team: team.displayName,
      rows: finalizePlayerRows({
        players: Array.from(team.players.values()),
        headers,
        kinds,
        nameIdx,
        ratioIdx,
      }),
    })),
  };
}
