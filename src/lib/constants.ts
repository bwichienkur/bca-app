import type { UserPreferences } from "./types";

export const LMS_BASE = "https://lms.fargorate.com";

/** Palm Beach County BCA Pool League — app default */
export const DEFAULT_LEAGUE_ID = "43bbc416-4a09-4e38-be33-aa2b018751c7";
export const DEFAULT_LEAGUE_NAME = "Palm Beach County BCA Pool League";

export const DEFAULT_PREFERENCES: UserPreferences = {
  leagueId: DEFAULT_LEAGUE_ID,
  leagueName: DEFAULT_LEAGUE_NAME,
  divisionId: null,
  divisionName: null,
};

export const PREFERENCES_STORAGE_KEY = "tableside.preferences.v1";

export const REPORT_TABS = [
  { id: "teams", label: "Teams" },
  { id: "players", label: "Players" },
  { id: "players-by-team", label: "By Team" },
  { id: "player-list", label: "Ratings" },
  { id: "schedule", label: "Schedule" },
] as const;
