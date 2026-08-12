/**
 * Tableside-only Night Formats (division links) — not saved to LMS.
 * Pair 1..N LMS divisions ("legs") that share a league night
 * (e.g. Beyond Singles + Teams, or a single Tuesday 9-Ball division).
 */

import { canonicalizeTeamKey } from "./division-combos";
import {
  configFromLegs,
  defaultLegsFromPair,
  normalizeDivisionLinkConfig,
  normalizeNightLegs,
  type DivisionLinkConfig,
  type NightLeg,
} from "./division-link-config";

export type DivisionLinkMode = "teams" | "individuals";

export type DivisionLink = {
  id: string;
  /** Display name players see in the league context picker (Night Format name). */
  name: string;
  leagueId: string;
  /**
   * Ordered scored LMS divisions in this night.
   * Always present after normalizeDivisionLink().
   */
  legs: NightLeg[];
  /** Mirror of legs[0] for older clients. */
  primaryDivisionId: string;
  primaryDivisionName: string;
  /** Mirror of legs[1] (or "") for older clients. */
  linkedDivisionId: string;
  linkedDivisionName: string;
  /** How roster equality was validated when the link was saved. */
  mode: DivisionLinkMode;
  /**
   * Legacy primary/linked standing+scoring mirrors (from legs[0]/legs[1]).
   * Prefer reading per-leg standing/scoring on `legs`.
   */
  config: DivisionLinkConfig;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string | null;
};

export type DivisionLinkInput = Omit<
  DivisionLink,
  "id" | "createdAt" | "updatedAt" | "legs" | "config" | "primaryDivisionId" | "primaryDivisionName" | "linkedDivisionId" | "linkedDivisionName"
> & {
  id?: string;
  legs?: NightLeg[] | null;
  config?: DivisionLinkConfig | null;
  primaryDivisionId?: string;
  primaryDivisionName?: string;
  linkedDivisionId?: string;
  linkedDivisionName?: string;
};

/** Ensure legacy stored links have legs[] + standing/scoring config. */
export function normalizeDivisionLink(
  link: Omit<DivisionLink, "legs" | "config"> & {
    legs?: NightLeg[] | null;
    config?: DivisionLinkConfig | null;
    primaryDivisionId?: string;
    primaryDivisionName?: string;
    linkedDivisionId?: string;
    linkedDivisionName?: string;
  },
): DivisionLink {
  let legs = normalizeNightLegs(link.legs);
  if (legs.length === 0) {
    const primaryId = String(link.primaryDivisionId ?? "").trim();
    const linkedId = String(link.linkedDivisionId ?? "").trim();
    const primaryName = String(link.primaryDivisionName ?? "").trim() || primaryId;
    const linkedName = String(link.linkedDivisionName ?? "").trim() || linkedId;
    if (primaryId && linkedId) {
      const config = normalizeDivisionLinkConfig(
        link.config,
        primaryName,
        linkedName,
      );
      legs = [
        {
          id: "singles",
          label: config.standing.primary.role === "singles" ? "Singles" : "Teams",
          divisionId: primaryId,
          divisionName: primaryName,
          standing: config.standing.primary,
          scoring: config.scoring.primary,
        },
        {
          id: "teams",
          label: config.standing.linked.role === "teams" ? "Teams" : "Singles",
          divisionId: linkedId,
          divisionName: linkedName,
          standing: config.standing.linked,
          scoring: config.scoring.linked,
        },
      ];
      // Fix labels/ids from roles
      legs = legs.map((leg, index) => ({
        ...leg,
        id: leg.standing.role || `leg-${index + 1}`,
        label:
          leg.standing.role === "singles"
            ? "Singles"
            : leg.standing.role === "teams"
              ? "Teams"
              : leg.label,
      }));
      // Unique ids if both somehow same role
      if (legs[0] && legs[1] && legs[0].id === legs[1].id) {
        legs[1] = { ...legs[1]!, id: `${legs[1]!.id}-2` };
      }
    } else if (primaryId) {
      legs = defaultLegsFromPair(
        primaryId,
        primaryName,
        linkedId || primaryId,
        linkedName || primaryName,
      ).slice(0, linkedId ? 2 : 1);
    }
  }

  const config = configFromLegs(legs);
  const primary = legs[0];
  const linked = legs[1];

  return {
    id: link.id,
    name: link.name,
    leagueId: link.leagueId,
    legs,
    primaryDivisionId: primary?.divisionId ?? String(link.primaryDivisionId ?? ""),
    primaryDivisionName:
      primary?.divisionName ?? String(link.primaryDivisionName ?? ""),
    linkedDivisionId: linked?.divisionId ?? String(link.linkedDivisionId ?? ""),
    linkedDivisionName:
      linked?.divisionName ?? String(link.linkedDivisionName ?? ""),
    mode: link.mode,
    config,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
    updatedBy: link.updatedBy ?? null,
  };
}

export type DivisionLinkRosterSide = {
  divisionId: string;
  divisionName: string;
  teams: Array<{ id: string; name: string; isBye?: boolean }>;
  /** Flattened players when validating individual-player divisions. */
  players?: Array<{ id: string; name: string }>;
};

export type DivisionLinkValidation = {
  ok: boolean;
  mode: DivisionLinkMode | null;
  message: string;
  /** @deprecated use missingByDivision */
  missingInPrimary: string[];
  /** @deprecated use missingByDivision */
  missingInLinked: string[];
  missingByDivision?: Record<string, string[]>;
};

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function teamKeys(
  teams: Array<{ name: string; isBye?: boolean }>,
): string[] {
  return sortedUnique(
    teams
      .filter((team) => !team.isBye)
      .map((team) => canonicalizeTeamKey(team.name))
      .filter(Boolean),
  );
}

function playerKeys(
  players: Array<{ id: string; name: string }> | undefined,
): string[] {
  if (!players?.length) return [];
  return sortedUnique(
    players.map((player) => {
      const id = player.id.trim().toLowerCase();
      if (id) return `id:${id}`;
      return `name:${canonicalizeTeamKey(player.name)}`;
    }),
  );
}

function diffKeys(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((key) => !rightSet.has(key));
}

/**
 * Two divisions may link only when they share the exact same team names,
 * or (for individual-player divisions) the exact same individuals.
 */
export function validateDivisionLinkRosters(
  primary: DivisionLinkRosterSide,
  linked: DivisionLinkRosterSide,
): DivisionLinkValidation {
  return validateNightFormatRosters([primary, linked]);
}

/**
 * All legs in a Night Format must share the same team names (or individuals).
 * Compared against the first leg as the roster source of truth.
 * A single-leg night is always valid when that division has teams or players.
 */
export function validateNightFormatRosters(
  sides: DivisionLinkRosterSide[],
): DivisionLinkValidation {
  if (sides.length < 1) {
    return {
      ok: false,
      mode: null,
      message: "Add at least one LMS division (leg) to this night.",
      missingInPrimary: [],
      missingInLinked: [],
      missingByDivision: {},
    };
  }

  if (sides.length === 1) {
    const side = sides[0]!;
    const teams = teamKeys(side.teams);
    const players = playerKeys(side.players);
    if (teams.length > 0) {
      return {
        ok: true,
        mode: "teams",
        message: `Single-leg night · ${teams.length} teams.`,
        missingInPrimary: [],
        missingInLinked: [],
        missingByDivision: {},
      };
    }
    if (players.length > 0) {
      return {
        ok: true,
        mode: "individuals",
        message: `Single-leg night · ${players.length} players.`,
        missingInPrimary: [],
        missingInLinked: [],
        missingByDivision: {},
      };
    }
    return {
      ok: false,
      mode: null,
      message: "That division has no teams or players to score.",
      missingInPrimary: [],
      missingInLinked: [],
      missingByDivision: {},
    };
  }

  const ids = sides.map((side) => side.divisionId);
  if (new Set(ids).size !== ids.length) {
    return {
      ok: false,
      mode: null,
      message: "Each leg must use a different LMS division.",
      missingInPrimary: [],
      missingInLinked: [],
      missingByDivision: {},
    };
  }

  const anchor = sides[0]!;
  const anchorTeams = teamKeys(anchor.teams);
  const anchorPlayers = playerKeys(anchor.players);
  const missingByDivision: Record<string, string[]> = {};

  let teamsOk = anchorTeams.length > 0;
  let playersOk = anchorPlayers.length > 0;

  for (let i = 1; i < sides.length; i += 1) {
    const side = sides[i]!;
    const sideTeams = teamKeys(side.teams);
    const sidePlayers = playerKeys(side.players);

    const teamsMatch =
      teamsOk &&
      sideTeams.length > 0 &&
      anchorTeams.length === sideTeams.length &&
      anchorTeams.every((key, index) => key === sideTeams[index]);

    const playersMatch =
      playersOk &&
      sidePlayers.length > 0 &&
      anchorPlayers.length === sidePlayers.length &&
      anchorPlayers.every((key, index) => key === sidePlayers[index]);

    if (teamsMatch) {
      playersOk = false; // prefer teams mode once confirmed
      continue;
    }
    if (playersMatch && !teamsOk) {
      teamsOk = false;
      continue;
    }

    if (anchorTeams.length || sideTeams.length) {
      teamsOk = false;
      missingByDivision[side.divisionId] = diffKeys(anchorTeams, sideTeams);
      missingByDivision[anchor.divisionId] = [
        ...(missingByDivision[anchor.divisionId] ?? []),
        ...diffKeys(sideTeams, anchorTeams),
      ];
    } else {
      playersOk = false;
      missingByDivision[side.divisionId] = diffKeys(anchorPlayers, sidePlayers);
      missingByDivision[anchor.divisionId] = [
        ...(missingByDivision[anchor.divisionId] ?? []),
        ...diffKeys(sidePlayers, anchorPlayers),
      ];
    }
  }

  if (teamsOk && anchorTeams.length > 0) {
    // Verify every side still matches (in case early continue left a mismatch)
    const allTeamsMatch = sides.every((side) => {
      const keys = teamKeys(side.teams);
      return (
        keys.length === anchorTeams.length &&
        keys.every((key, index) => key === anchorTeams[index])
      );
    });
    if (allTeamsMatch) {
      return {
        ok: true,
        mode: "teams",
        message: `Team names match across ${sides.length} legs (${anchorTeams.length} teams).`,
        missingInPrimary: [],
        missingInLinked: [],
        missingByDivision: {},
      };
    }
  }

  if (playersOk && anchorPlayers.length > 0) {
    const allPlayersMatch = sides.every((side) => {
      const keys = playerKeys(side.players);
      return (
        keys.length === anchorPlayers.length &&
        keys.every((key, index) => key === anchorPlayers[index])
      );
    });
    if (allPlayersMatch) {
      return {
        ok: true,
        mode: "individuals",
        message: `Individuals match across ${sides.length} legs (${anchorPlayers.length} players).`,
        missingInPrimary: [],
        missingInLinked: [],
        missingByDivision: {},
      };
    }
  }

  const second = sides[1]!;
  return {
    ok: false,
    mode: null,
    message:
      "All legs must have the exact same team names (or the exact same individuals).",
    missingInPrimary: missingByDivision[anchor.divisionId] ?? [],
    missingInLinked: missingByDivision[second.divisionId] ?? [],
    missingByDivision,
  };
}

export function linkLegDivisionIds(link: DivisionLink): string[] {
  if (link.legs?.length) return link.legs.map((leg) => leg.divisionId);
  return [link.primaryDivisionId, link.linkedDivisionId].filter(Boolean);
}

export function findLinkForDivision(
  links: DivisionLink[],
  divisionId: string | null | undefined,
): DivisionLink | null {
  if (!divisionId) return null;
  return (
    links.find((link) => linkLegDivisionIds(link).includes(divisionId)) ?? null
  );
}

export function findLinkById(
  links: DivisionLink[],
  linkId: string | null | undefined,
): DivisionLink | null {
  if (!linkId) return null;
  return links.find((link) => link.id === linkId) ?? null;
}

/** Division ids hidden from the player picker because a named night replaces them. */
export function linkedMemberDivisionIds(links: DivisionLink[]): Set<string> {
  const ids = new Set<string>();
  for (const link of links) {
    for (const id of linkLegDivisionIds(link)) ids.add(id);
  }
  return ids;
}

export type PickerDivisionOption = {
  id: string;
  name: string;
  year: string;
  leagueId: string;
  leagueName: string;
  state: string;
  reportUrl: string;
  /** Present when this option is a Tableside Night Format (division link). */
  link?: DivisionLink;
};

/**
 * Build player-facing division options: named nights replace their member
 * LMS divisions so players only pick one entry.
 */
export function buildLinkedDivisionPickerOptions<
  T extends {
    id: string;
    name: string;
    year: string;
    leagueId: string;
    leagueName: string;
    state: string;
    reportUrl: string;
  },
>(divisions: T[], links: DivisionLink[]): PickerDivisionOption[] {
  const memberIds = linkedMemberDivisionIds(links);
  const options: PickerDivisionOption[] = [];

  for (const link of links) {
    const primary =
      divisions.find((d) => d.id === link.primaryDivisionId) ??
      divisions.find((d) => linkLegDivisionIds(link).includes(d.id)) ??
      null;
    options.push({
      id: `link:${link.id}`,
      name: link.name,
      year: primary?.year ?? "",
      leagueId: link.leagueId,
      leagueName: primary?.leagueName ?? "",
      state: primary?.state ?? "",
      reportUrl: primary?.reportUrl ?? "",
      link,
    });
  }

  for (const division of divisions) {
    if (memberIds.has(division.id)) continue;
    options.push({ ...division });
  }

  return options.sort((a, b) => a.name.localeCompare(b.name));
}
