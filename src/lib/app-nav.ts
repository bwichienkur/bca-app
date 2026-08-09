/**
 * Four-pillar information architecture for Tableside.
 *
 * Home — public discovery (events)
 * League — player/captain night tools
 * Manage — operators / league creators (Fargo LMS today; APA/TAP later)
 * Account — settings, connections, memberships
 */

import type { AppPillar, ReportTab } from "@/lib/types";

export type PillarDef = {
  id: AppPillar;
  label: string;
  description: string;
};

export type NavSection = {
  id: ReportTab;
  label: string;
  shortLabel?: string;
};

export const APP_PILLARS: PillarDef[] = [
  {
    id: "home",
    label: "Home",
    description: "Events and discovery without a league context",
  },
  {
    id: "league",
    label: "League",
    description: "Standings, schedule, handicap, and night scoring",
  },
  {
    id: "manage",
    label: "Manage",
    description: "Run or create leagues (operator tools)",
  },
  {
    id: "account",
    label: "Account",
    description: "Profile, connections, and defaults",
  },
];

/** Home leaf destinations. */
export const HOME_SECTIONS: NavSection[] = [
  { id: "events", label: "Events" },
  { id: "search", label: "Search", shortLabel: "Search" },
];

/**
 * League night tools — Score first for tableside use.
 * Search stays in the header / Home.
 */
export const LEAGUE_SECTIONS: NavSection[] = [
  { id: "score", label: "Score" },
  { id: "schedule", label: "Schedule" },
  { id: "standings", label: "Standings" },
  { id: "my-team", label: "My team", shortLabel: "Team" },
  { id: "handicap", label: "Handicap" },
  { id: "players", label: "Players" },
];

/** Manage leaf destinations — LMS is the primary Manage surface. */
export const MANAGE_SECTIONS: NavSection[] = [
  { id: "lms", label: "Fargo LMS", shortLabel: "LMS" },
];

export const ACCOUNT_SECTIONS: NavSection[] = [
  { id: "account", label: "Settings" },
];

const TAB_TO_PILLAR: Record<ReportTab, AppPillar> = {
  events: "home",
  search: "home",
  score: "league",
  schedule: "league",
  standings: "league",
  "my-team": "league",
  handicap: "league",
  players: "league",
  lms: "manage",
  "create-league": "manage",
  account: "account",
};

export function pillarForTab(tab: ReportTab): AppPillar {
  return TAB_TO_PILLAR[tab] ?? "league";
}

export function sectionsForPillar(pillar: AppPillar): NavSection[] {
  switch (pillar) {
    case "home":
      return HOME_SECTIONS;
    case "league":
      return LEAGUE_SECTIONS;
    case "manage":
      return MANAGE_SECTIONS;
    case "account":
      return ACCOUNT_SECTIONS;
  }
}

export type DefaultTabOptions = {
  hasDivision?: boolean;
  hasTeam?: boolean;
  canManage?: boolean;
  /** Division schedule includes a match for tonight (optionally for my team). */
  hasMatchTonight?: boolean;
};

/** Default leaf when entering a pillar (or when current tab is outside it). */
export function defaultTabForPillar(
  pillar: AppPillar,
  options?: DefaultTabOptions,
): ReportTab {
  switch (pillar) {
    case "home":
      return "events";
    case "league":
      if (options?.hasMatchTonight) return "score";
      if (options?.hasDivision) return "schedule";
      return "standings";
    case "manage":
      return "lms";
    case "account":
      return "account";
  }
}

export function tabBelongsToPillar(tab: ReportTab, pillar: AppPillar): boolean {
  return pillarForTab(tab) === pillar;
}

/** Context card (league/division/team) is for League play, not Home/Account. */
export function pillarShowsPlayContext(pillar: AppPillar): boolean {
  return pillar === "league";
}

/** Tabs that don't use NavTabIcon leaf map. */
export function sectionUsesLeafIcon(tab: ReportTab): boolean {
  return tab !== "search" && tab !== "account" && tab !== "create-league";
}
