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
  playerId: null,
  playerName: null,
  teamId: null,
  teamName: null,
};

export const PREFERENCES_STORAGE_KEY = "tableside.preferences.v1";
export const LINEUP_PRESETS_STORAGE_KEY = "tableside.lineups.v1";
export const MEMBERSHIP_STORAGE_KEY = "tableside.membership.v1";

export const REPORT_TABS: { id: ReportTab; label: string }[] = [
  { id: "my-team", label: "Team" },
  { id: "standings", label: "League" },
  { id: "players", label: "Players" },
  { id: "schedule", label: "Schedule" },
  { id: "handicap", label: "Handicap" },
  { id: "score", label: "Score" },
  { id: "search", label: "Search" },
];

/** Primary destination nav — Search lives in the header instead. */
export const PRIMARY_NAV_TABS: {
  id: Exclude<ReportTab, "search">;
  label: string;
}[] = [
  { id: "my-team", label: "Team" },
  { id: "standings", label: "League" },
  { id: "players", label: "Players" },
  { id: "schedule", label: "Schedule" },
  { id: "handicap", label: "Handicap" },
  { id: "score", label: "Score" },
];
