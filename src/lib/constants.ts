import type { ReportTab, UserPreferences } from "./types";

export const LMS_BASE = "https://lms.fargorate.com";

/** Palm Beach County BCA Pool League — app default */
export const DEFAULT_LEAGUE_ID = "43bbc416-4a09-4e38-be33-aa2b018751c7";
export const DEFAULT_LEAGUE_NAME = "Palm Beach County BCA Pool League";

/** Palm Beach Monday/team formats use 5 players per side */
export const DEFAULT_PLAYERS_PER_TEAM = 5;

export const DEFAULT_PREFERENCES: UserPreferences = {
  leagueId: DEFAULT_LEAGUE_ID,
  leagueName: DEFAULT_LEAGUE_NAME,
  divisionId: null,
  divisionName: null,
  linkedDivisionId: null,
  linkedDivisionName: null,
  playerId: null,
  playerName: null,
  teamId: null,
  teamName: null,
  scoringFormatId: null,
};

export const PREFERENCES_STORAGE_KEY = "tableside.preferences.v1";
export const LINEUP_PRESETS_STORAGE_KEY = "tableside.lineups.v1";
export const MEMBERSHIP_STORAGE_KEY = "tableside.membership.v1";

export const REPORT_TABS: { id: ReportTab; label: string }[] = [
  { id: "my-team", label: "Team" },
  { id: "standings", label: "Standings" },
  { id: "players", label: "Players" },
  { id: "schedule", label: "Schedule" },
  { id: "handicap", label: "Handicap" },
  { id: "events", label: "Events" },
  { id: "score", label: "Score" },
  { id: "lms", label: "Fargo LMS" },
  { id: "create-league", label: "Create league" },
  { id: "search", label: "Search" },
  { id: "account", label: "Account" },
];

/**
 * @deprecated Prefer APP_PILLARS / LEAGUE_SECTIONS from app-nav.
 * Kept for any leftover imports during the shell migration.
 */
export const PRIMARY_NAV_TABS: {
  id: Exclude<ReportTab, "search" | "account">;
  label: string;
}[] = [
  { id: "score", label: "Score" },
  { id: "schedule", label: "Schedule" },
  { id: "standings", label: "Standings" },
  { id: "my-team", label: "Team" },
  { id: "handicap", label: "Handicap" },
  { id: "players", label: "Players" },
  { id: "events", label: "Events" },
  { id: "lms", label: "Fargo LMS" },
];
