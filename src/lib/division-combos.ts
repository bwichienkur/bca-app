/**
 * Combined LMS divisions that together form one league night.
 *
 * Beyond Monday is split in LMS into Singles (3 race sets) + Teams (RR race)
 * because LMS cannot encode both formats in one division. Tableside links them
 * for standings / schedule / score display while still submitting each half to
 * its own LMS division.
 */

import { normalizeTeamName } from "./matchups";
import type {
  DivisionLinkConfig,
  DivisionLinkStandingSide,
  NightLeg,
  StandingScoreMetric,
} from "./division-link-config";
import {
  defaultDivisionLinkConfig,
  legsNightHint,
  linkConfigNightHint,
  standingRawColumnHeaders,
  standingRawColumnHeadersForLegs,
} from "./division-link-config";
import type { ScheduleDay, ScheduleMatch, TableReport } from "./types";

export type DivisionComboRole = "singles" | "teams";

export type DivisionComboPart = {
  role: DivisionComboRole;
  label: string;
  /** Multiply the chosen LMS metric when folding into the night total. */
  pointsMultiplier: number;
  maxNightPoints: number;
  /** LMS standings column that contributes to night points. */
  standingMetric: StandingScoreMetric;
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
 * Beyond Monday night: Singles SETS (race wins, 1 pt each) + Teams RDS × 2
 * = 5 possible points. LMS ranks Singles by SETS and Teams by RDS; PTS is
 * games won and must not feed the combined night total.
 */
export const BEYOND_MONDAY_COMBO: KnownDivisionCombo = {
  id: "beyond-monday",
  label: "Beyond Monday",
  description:
    "3 singles race wins (SETS) plus a team round-robin win (RDS×2) — 5 pts per night.",
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
      standingMetric: "sets",
    },
    teams: {
      role: "teams",
      label: "Teams",
      pointsMultiplier: 2,
      maxNightPoints: 2,
      standingMetric: "rds",
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

function metricAliases(metric: StandingScoreMetric): string[] {
  if (metric === "sets") return ["sets", "set"];
  if (metric === "rds") return ["rds", "rounds", "round"];
  return ["pts", "points"];
}

function readMetric(
  headers: string[],
  row: string[],
  metric: StandingScoreMetric,
): number {
  const idx = columnIndex(headers, metricAliases(metric));
  if (idx < 0) return 0;
  return parsePts(row[idx]);
}

export type CombinedStandingRow = {
  team: string;
  singlesPts: number;
  teamsPts: number;
  /** Night total after applying combo multipliers. */
  combinedPts: number;
  singlesRaw: number;
  teamsRaw: number;
  weeks: number;
};

/** Standing sides used by the merge (from link config or Beyond defaults). */
export function standingSidesFromConfig(
  config: DivisionLinkConfig | null | undefined,
  primaryName?: string,
  linkedName?: string,
): { singles: DivisionLinkStandingSide; teams: DivisionLinkStandingSide } {
  const resolved =
    config ??
    defaultDivisionLinkConfig(
      primaryName ?? "Singles",
      linkedName ?? "Teams",
    );
  const sides = [resolved.standing.primary, resolved.standing.linked];
  const singles =
    sides.find((side) => side.role === "singles") ??
    defaultDivisionLinkConfig("Singles", "Teams").standing.primary;
  const teams =
    sides.find((side) => side.role === "teams") ??
    defaultDivisionLinkConfig("Singles", "Teams").standing.linked;
  return { singles, teams };
}

export function standingSidesFromCombo(
  combo: KnownDivisionCombo = BEYOND_MONDAY_COMBO,
): { singles: DivisionLinkStandingSide; teams: DivisionLinkStandingSide } {
  return {
    singles: {
      role: "singles",
      metric: combo.parts.singles.standingMetric,
      multiplier: combo.parts.singles.pointsMultiplier,
      maxNightPoints: combo.parts.singles.maxNightPoints,
    },
    teams: {
      role: "teams",
      metric: combo.parts.teams.standingMetric,
      multiplier: combo.parts.teams.pointsMultiplier,
      maxNightPoints: combo.parts.teams.maxNightPoints,
    },
  };
}

/**
 * Merge N LMS team-standings reports by team name into a combined table.
 *
 * Output columns:
 * - STANDING — combined rank total (each leg’s metric × its multiplier)
 * - raw LMS columns — one per leg (e.g. SETS, RDS, …)
 * - WKS
 *
 * Beyond default: STANDING = SETS×1 + RDS×2.
 */
export function mergeCombinedStandings(args: {
  /** Preferred: ordered legs with their LMS reports. */
  legs?: Array<{
    leg: NightLeg | { id: string; standing: DivisionLinkStandingSide };
    report: TableReport | null | undefined;
  }>;
  /** Legacy 2-role API. */
  singles?: TableReport | null | undefined;
  teams?: TableReport | null | undefined;
  combo?: KnownDivisionCombo;
  /** Preferred when using singles/teams args: link-level standing config. */
  config?: DivisionLinkConfig | null;
}): TableReport {
  let legRows = args.legs ?? [];

  if (legRows.length === 0) {
    const roleSides = args.config
      ? standingSidesFromConfig(args.config)
      : standingSidesFromCombo(args.combo ?? BEYOND_MONDAY_COMBO);
    const columnOrder = args.config
      ? [args.config.standing.primary, args.config.standing.linked]
      : [roleSides.singles, roleSides.teams];

    // Map reports onto column order by role.
    legRows = columnOrder.map((side, index) => {
      const report =
        side.role === "singles" ? args.singles : args.teams;
      return {
        leg: {
          id: side.role || `leg-${index + 1}`,
          standing: side,
        },
        report,
      };
    });
  }

  if (legRows.length === 0) {
    return { headers: ["#", "TEAM", "STANDING", "WKS"], rows: [] };
  }

  const headers = standingRawColumnHeadersForLegs(
    legRows.map((row, index) => ({
      id: row.leg.id,
      label: "label" in row.leg ? String((row.leg as NightLeg).label ?? row.leg.id) : row.leg.id,
      divisionId: "divisionId" in row.leg ? String((row.leg as NightLeg).divisionId ?? row.leg.id) : row.leg.id,
      divisionName: "divisionName" in row.leg ? String((row.leg as NightLeg).divisionName ?? "") : "",
      standing: row.leg.standing,
      scoring: "scoring" in row.leg ? (row.leg as NightLeg).scoring : {},
    })),
  );

  type TeamAgg = {
    displayName: string;
    rawByLeg: number[];
    weeks: number;
  };

  const byKey = new Map<string, TeamAgg>();

  legRows.forEach((legRow, legIndex) => {
    const report = legRow.report;
    if (!report?.headers.length) return;
    const nameIdx = columnIndex(report.headers, ["team", "name"]);
    const wksIdx = columnIndex(report.headers, ["wks", "weeks"]);
    if (nameIdx < 0) return;
    for (const row of report.rows) {
      const rawName = (row[nameIdx] ?? "").trim();
      if (!rawName) continue;
      const key = canonicalizeTeamKey(rawName);
      if (!key || key === "bye") continue;
      const existing = byKey.get(key) ?? {
        displayName: rawName.replace(/^\((H|A)\)\s*/i, "").trim(),
        rawByLeg: legRows.map(() => 0),
        weeks: 0,
      };
      existing.rawByLeg[legIndex] = readMetric(
        report.headers,
        row,
        legRow.leg.standing.metric,
      );
      existing.weeks = Math.max(existing.weeks, parsePts(row[wksIdx]));
      byKey.set(key, existing);
    }
  });

  const rows = Array.from(byKey.values())
    .map((item) => {
      const legPts = item.rawByLeg.map(
        (raw, i) => raw * legRows[i]!.leg.standing.multiplier,
      );
      const combinedPts = legPts.reduce((sum, n) => sum + n, 0);
      return { ...item, legPts, combinedPts };
    })
    .sort((a, b) => {
      if (b.combinedPts !== a.combinedPts) return b.combinedPts - a.combinedPts;
      if ((b.legPts[0] ?? 0) !== (a.legPts[0] ?? 0)) {
        return (b.legPts[0] ?? 0) - (a.legPts[0] ?? 0);
      }
      return a.displayName.localeCompare(b.displayName);
    });

  return {
    headers: ["#", "TEAM", "STANDING", ...headers, "WKS"],
    rows: rows.map((item, index) => [
      String(index + 1),
      item.displayName,
      formatPts(item.combinedPts),
      ...item.rawByLeg.map((raw) => formatPts(raw)),
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
 * Merge schedule days from N divisions, tagging each match with its leg label.
 */
export function mergeCombinedSchedule(args: {
  /** Preferred: one entry per night leg. */
  parts?: Array<{
    divisionId: string;
    divisionName: string;
    days: ScheduleDay[];
    partLabel?: string | null;
  }>;
  /** Legacy 2-division API. */
  primary?: { divisionId: string; divisionName: string; days: ScheduleDay[] };
  linked?: { divisionId: string; divisionName: string; days: ScheduleDay[] };
}): ScheduleDay[] {
  const parts =
    args.parts ??
    ([args.primary, args.linked].filter(Boolean) as Array<{
      divisionId: string;
      divisionName: string;
      days: ScheduleDay[];
      partLabel?: string | null;
    }>);

  const byDate = new Map<string, TaggedScheduleMatch[]>();

  const ingest = (
    block: {
      divisionId: string;
      divisionName: string;
      days: ScheduleDay[];
      partLabel?: string | null;
    },
    index: number,
  ) => {
    const partLabel =
      block.partLabel?.trim() ||
      comboPartLabel(block.divisionName) ||
      `Leg ${index + 1}`;
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

  parts.forEach((part, index) => ingest(part, index));

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
      const da = Date.parse(a.date);
      const db = Date.parse(b.date);
      if (!Number.isNaN(da) && !Number.isNaN(db) && da !== db) return da - db;
      return a.date.localeCompare(b.date);
    });
}

export function comboNightHint(
  combo: KnownDivisionCombo | null | undefined,
  config?: DivisionLinkConfig | null,
  legs?: NightLeg[] | null,
): string | null {
  if (legs?.length) return legsNightHint(legs);
  if (config) return linkConfigNightHint(config);
  if (!combo) return null;
  const singles = combo.parts.singles;
  const teams = combo.parts.teams;
  return `${singles.maxNightPoints} from ${singles.label.toLowerCase()} (${singles.standingMetric}×${singles.pointsMultiplier}) + ${teams.maxNightPoints} from ${teams.label.toLowerCase()} (${teams.standingMetric}×${teams.pointsMultiplier}) = ${singles.maxNightPoints + teams.maxNightPoints} pts/night. Score each LMS sheet separately.`;
}
