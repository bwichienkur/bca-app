/**
 * Combined LMS divisions that together form one league night.
 *
 * Beyond Monday is split in LMS into Singles (3 race sets) + Teams (RR race)
 * because LMS cannot encode both formats in one division. Tableside links them
 * for standings / schedule / score display while still submitting each half to
 * its own LMS division.
 */

import { normalizeTeamName } from "./matchups";
import type { ScheduleDay, ScheduleMatch, TableReport } from "./types";

export type DivisionComboRole = "singles" | "teams";

export type DivisionComboPart = {
  role: DivisionComboRole;
  label: string;
  /** Multiply LMS PTS when folding into the combined night total. */
  pointsMultiplier: number;
  maxNightPoints: number;
};

export type KnownDivisionCombo = {
  id: string;
  label: string;
  description: string;
  seasonKeyFromName: (name: string) => string | null;
  roleFromName: (name: string) => DivisionComboRole | null;
  parts: Record<DivisionComboRole, DivisionComboPart>;
};

/**
 * Beyond Monday night: 3 singles races (1 pt each) + team RR winner (2 pts)
 * = 5 possible points. LMS stores Teams PointsForWin as 1, so Tableside
 * multiplies Teams PTS × 2 for the combined night total.
 */
export const BEYOND_MONDAY_COMBO: KnownDivisionCombo = {
  id: "beyond-monday",
  label: "Beyond Monday",
  description:
    "3 singles races (1 pt each) plus a team round-robin race (2 pts) — 5 pts per night.",
  seasonKeyFromName(name) {
    const m = name.match(/\(?\s*(20\d{2}\.\d)\s*\)?/i);
    return m?.[1] ?? null;
  },
  roleFromName(name) {
    const n = name.toLowerCase();
    if (!n.includes("beyond")) return null;
    if (n.includes("playoff")) return null;
    if (/\bsingles?\b/.test(n)) return "singles";
    if (/\bteams?\b/.test(n)) return "teams";
    return null;
  },
  parts: {
    singles: {
      role: "singles",
      label: "Singles",
      pointsMultiplier: 1,
      maxNightPoints: 3,
    },
    teams: {
      role: "teams",
      label: "Teams",
      pointsMultiplier: 2,
      maxNightPoints: 2,
    },
  },
};

export const KNOWN_DIVISION_COMBOS: KnownDivisionCombo[] = [BEYOND_MONDAY_COMBO];

/** Strip punctuation/spaces so "Spaceballs(The pool team)" matches "Space balls…". */
export function canonicalizeTeamKey(name: string): string {
  return normalizeTeamName(name).replace(/[^a-z0-9]+/g, "");
}

export function teamsMatchByName(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  return canonicalizeTeamKey(a) === canonicalizeTeamKey(b);
}

export function findKnownComboForDivisionName(
  divisionName: string | null | undefined,
): KnownDivisionCombo | null {
  if (!divisionName) return null;
  for (const combo of KNOWN_DIVISION_COMBOS) {
    if (combo.roleFromName(divisionName)) return combo;
  }
  return null;
}

export function comboRoleForDivisionName(
  divisionName: string | null | undefined,
): DivisionComboRole | null {
  if (!divisionName) return null;
  for (const combo of KNOWN_DIVISION_COMBOS) {
    const role = combo.roleFromName(divisionName);
    if (role) return role;
  }
  return null;
}

export function comboPartLabel(
  divisionName: string | null | undefined,
): string | null {
  const role = comboRoleForDivisionName(divisionName);
  if (!role) return null;
  const combo = findKnownComboForDivisionName(divisionName);
  return combo?.parts[role].label ?? null;
}

/**
 * Find the sister division that completes a known combo (same season key,
 * opposite Singles/Teams role).
 */
export function findSisterDivision<T extends { id: string; name: string }>(
  primary: T,
  candidates: T[],
): { sister: T; combo: KnownDivisionCombo; primaryRole: DivisionComboRole } | null {
  for (const combo of KNOWN_DIVISION_COMBOS) {
    const primaryRole = combo.roleFromName(primary.name);
    if (!primaryRole) continue;
    const season = combo.seasonKeyFromName(primary.name);
    if (!season) continue;
    const wantRole: DivisionComboRole =
      primaryRole === "singles" ? "teams" : "singles";
    const sister = candidates.find((item) => {
      if (item.id === primary.id) return false;
      if (combo.roleFromName(item.name) !== wantRole) return false;
      return combo.seasonKeyFromName(item.name) === season;
    });
    if (sister) return { sister, combo, primaryRole };
  }
  return null;
}

function columnIndex(headers: string[], aliases: string[]): number {
  const lowered = headers.map((h) => h.trim().toLowerCase());
  for (const alias of aliases) {
    const idx = lowered.indexOf(alias);
    if (idx >= 0) return idx;
  }
  return -1;
}

function parsePts(value: string | undefined): number {
  if (!value) return 0;
  const n = Number.parseFloat(value.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

export type CombinedStandingRow = {
  team: string;
  singlesPts: number;
  teamsPts: number;
  /** Night total after applying combo multipliers. */
  combinedPts: number;
  singlesRds: number;
  teamsRds: number;
  weeks: number;
};

/**
 * Merge two LMS team-standings reports by team name into a combined night table.
 * Teams PTS are multiplied per the combo definition (Beyond Teams × 2).
 */
export function mergeCombinedStandings(args: {
  singles: TableReport | null | undefined;
  teams: TableReport | null | undefined;
  combo?: KnownDivisionCombo;
}): TableReport {
  const combo = args.combo ?? BEYOND_MONDAY_COMBO;
  const singlesMult = combo.parts.singles.pointsMultiplier;
  const teamsMult = combo.parts.teams.pointsMultiplier;

  const byKey = new Map<
    string,
    {
      displayName: string;
      singlesPts: number;
      teamsPts: number;
      singlesRds: number;
      teamsRds: number;
      weeks: number;
    }
  >();

  const ingest = (
    report: TableReport | null | undefined,
    role: DivisionComboRole,
  ) => {
    if (!report?.headers.length) return;
    const nameIdx = columnIndex(report.headers, ["team", "name"]);
    const ptsIdx = columnIndex(report.headers, ["pts", "points"]);
    const rdsIdx = columnIndex(report.headers, ["rds", "rounds"]);
    const wksIdx = columnIndex(report.headers, ["wks", "weeks"]);
    if (nameIdx < 0) return;
    for (const row of report.rows) {
      const rawName = (row[nameIdx] ?? "").trim();
      if (!rawName) continue;
      const key = canonicalizeTeamKey(rawName);
      if (!key || key === "bye") continue;
      const existing = byKey.get(key) ?? {
        displayName: rawName.replace(/^\((H|A)\)\s*/i, "").trim(),
        singlesPts: 0,
        teamsPts: 0,
        singlesRds: 0,
        teamsRds: 0,
        weeks: 0,
      };
      const pts = parsePts(row[ptsIdx]);
      const rds = parsePts(row[rdsIdx]);
      const wks = parsePts(row[wksIdx]);
      if (role === "singles") {
        existing.singlesPts = pts;
        existing.singlesRds = rds;
      } else {
        existing.teamsPts = pts;
        existing.teamsRds = rds;
      }
      existing.weeks = Math.max(existing.weeks, wks);
      byKey.set(key, existing);
    }
  };

  ingest(args.singles, "singles");
  ingest(args.teams, "teams");

  const rows = Array.from(byKey.values())
    .map((item) => {
      const combinedPts =
        item.singlesPts * singlesMult + item.teamsPts * teamsMult;
      return {
        ...item,
        combinedPts,
      };
    })
    .sort((a, b) => {
      if (b.combinedPts !== a.combinedPts) return b.combinedPts - a.combinedPts;
      return a.displayName.localeCompare(b.displayName);
    });

  return {
    headers: ["#", "TEAM", "NIGHT", "SINGLES", "TEAMS", "RDS", "WKS"],
    rows: rows.map((item, index) => [
      String(index + 1),
      item.displayName,
      formatPts(item.combinedPts),
      formatPts(item.singlesPts * singlesMult),
      formatPts(item.teamsPts * teamsMult),
      formatPts(item.singlesRds + item.teamsRds),
      formatPts(item.weeks),
    ]),
  };
}

function formatPts(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 10) / 10);
}

export type TaggedScheduleMatch = ScheduleMatch & {
  divisionId?: string | null;
  divisionName?: string | null;
  partLabel?: string | null;
};

/**
 * Merge schedule days from two divisions, tagging each match with its part.
 */
export function mergeCombinedSchedule(args: {
  primary: { divisionId: string; divisionName: string; days: ScheduleDay[] };
  linked: { divisionId: string; divisionName: string; days: ScheduleDay[] };
}): ScheduleDay[] {
  const byDate = new Map<string, TaggedScheduleMatch[]>();

  const ingest = (block: {
    divisionId: string;
    divisionName: string;
    days: ScheduleDay[];
  }) => {
    const partLabel = comboPartLabel(block.divisionName);
    for (const day of block.days) {
      const key = day.date.trim();
      const list = byDate.get(key) ?? [];
      for (const match of day.matches) {
        list.push({
          ...match,
          divisionId: block.divisionId,
          divisionName: block.divisionName,
          partLabel,
        });
      }
      byDate.set(key, list);
    }
  };

  ingest(args.primary);
  ingest(args.linked);

  const roleOrder = (label: string | null | undefined) => {
    const l = (label ?? "").toLowerCase();
    if (l === "singles") return 0;
    if (l === "teams") return 1;
    return 2;
  };

  return Array.from(byDate.entries())
    .map(([date, matches]) => ({
      date,
      matches: matches.sort((a, b) => {
        const role = roleOrder(a.partLabel) - roleOrder(b.partLabel);
        if (role !== 0) return role;
        return a.home.localeCompare(b.home);
      }),
    }))
    .sort((a, b) => {
      // Keep LMS schedule order loosely chronological via Date parse when possible.
      const da = Date.parse(a.date);
      const db = Date.parse(b.date);
      if (!Number.isNaN(da) && !Number.isNaN(db) && da !== db) return da - db;
      return a.date.localeCompare(b.date);
    });
}

export function comboNightHint(
  combo: KnownDivisionCombo | null | undefined,
): string | null {
  if (!combo) return null;
  const singles = combo.parts.singles;
  const teams = combo.parts.teams;
  return `${singles.maxNightPoints} from ${singles.label.toLowerCase()} + ${teams.maxNightPoints} from ${teams.label.toLowerCase()} = ${singles.maxNightPoints + teams.maxNightPoints} pts/night. Score each LMS sheet separately.`;
}
