/**
 * Tableside-only division links (not saved to LMS).
 * Pair two LMS divisions that share a night (e.g. Beyond Singles + Teams).
 */

import { canonicalizeTeamKey } from "./division-combos";

export type DivisionLinkMode = "teams" | "individuals";

export type DivisionLink = {
  id: string;
  /** Display name players see in the league context picker. */
  name: string;
  leagueId: string;
  primaryDivisionId: string;
  primaryDivisionName: string;
  linkedDivisionId: string;
  linkedDivisionName: string;
  /** How roster equality was validated when the link was saved. */
  mode: DivisionLinkMode;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string | null;
};

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
  missingInPrimary: string[];
  missingInLinked: string[];
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
  if (primary.divisionId === linked.divisionId) {
    return {
      ok: false,
      mode: null,
      message: "Pick two different divisions to link.",
      missingInPrimary: [],
      missingInLinked: [],
    };
  }

  const primaryTeams = teamKeys(primary.teams);
  const linkedTeams = teamKeys(linked.teams);
  const primaryPlayers = playerKeys(primary.players);
  const linkedPlayers = playerKeys(linked.players);

  const teamsMatch =
    primaryTeams.length > 0 &&
    linkedTeams.length > 0 &&
    primaryTeams.length === linkedTeams.length &&
    primaryTeams.every((key, index) => key === linkedTeams[index]);

  if (teamsMatch) {
    return {
      ok: true,
      mode: "teams",
      message: `Team names match (${primaryTeams.length} teams).`,
      missingInPrimary: [],
      missingInLinked: [],
    };
  }

  const individualsMatch =
    primaryPlayers.length > 0 &&
    linkedPlayers.length > 0 &&
    primaryPlayers.length === linkedPlayers.length &&
    primaryPlayers.every((key, index) => key === linkedPlayers[index]);

  if (individualsMatch) {
    return {
      ok: true,
      mode: "individuals",
      message: `Individuals match (${primaryPlayers.length} players).`,
      missingInPrimary: [],
      missingInLinked: [],
    };
  }

  // Prefer explaining team mismatches when both sides have teams.
  if (primaryTeams.length || linkedTeams.length) {
    return {
      ok: false,
      mode: null,
      message:
        "Divisions must have the exact same team names (or the exact same individuals) to link.",
      missingInPrimary: diffKeys(linkedTeams, primaryTeams),
      missingInLinked: diffKeys(primaryTeams, linkedTeams),
    };
  }

  return {
    ok: false,
    mode: null,
    message:
      "Divisions must have the exact same team names (or the exact same individuals) to link.",
    missingInPrimary: diffKeys(linkedPlayers, primaryPlayers),
    missingInLinked: diffKeys(primaryPlayers, linkedPlayers),
  };
}

export function findLinkForDivision(
  links: DivisionLink[],
  divisionId: string | null | undefined,
): DivisionLink | null {
  if (!divisionId) return null;
  return (
    links.find(
      (link) =>
        link.primaryDivisionId === divisionId ||
        link.linkedDivisionId === divisionId,
    ) ?? null
  );
}

export function findLinkById(
  links: DivisionLink[],
  linkId: string | null | undefined,
): DivisionLink | null {
  if (!linkId) return null;
  return links.find((link) => link.id === linkId) ?? null;
}

/** Division ids hidden from the player picker because a named link replaces them. */
export function linkedMemberDivisionIds(links: DivisionLink[]): Set<string> {
  const ids = new Set<string>();
  for (const link of links) {
    ids.add(link.primaryDivisionId);
    ids.add(link.linkedDivisionId);
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
  /** Present when this option is a Tableside division link. */
  link?: DivisionLink;
};

/**
 * Build player-facing division options: named links replace their member
 * divisions so players only pick one entry.
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
      divisions.find((d) => d.id === link.primaryDivisionId) ?? null;
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
