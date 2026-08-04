import { normalizeTeamName } from "./matchups";
import type { TableReport } from "./types";

function isRankHeader(header: string): boolean {
  const h = header.trim().toLowerCase();
  return h === "#" || h === "rank" || h === "rk" || h === "pos";
}

function isNameHeader(header: string): boolean {
  const h = header.trim().toLowerCase();
  return h === "team" || h === "name";
}

/** Map normalized team name → standing rank string (no leading #). */
export function teamRanksFromReport(
  report: TableReport | null | undefined,
): Map<string, string> {
  const ranks = new Map<string, string>();
  if (!report?.headers.length || !report.rows.length) return ranks;

  const nameIndex = report.headers.findIndex(isNameHeader);
  const rankIndex = report.headers.findIndex(isRankHeader);
  if (nameIndex < 0) return ranks;

  report.rows.forEach((row, rowIndex) => {
    const name = normalizeTeamName(row[nameIndex] ?? "");
    if (!name) return;
    const raw =
      rankIndex >= 0 ? (row[rankIndex] ?? "").trim() : String(rowIndex + 1);
    if (raw) ranks.set(name, raw.replace(/^#/, ""));
  });
  return ranks;
}

export function rankForTeam(
  ranks: Map<string, string>,
  teamName: string | null | undefined,
): string | null {
  if (!teamName) return null;
  return ranks.get(normalizeTeamName(teamName)) ?? null;
}
