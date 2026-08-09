export type DivisionEntry = {
  LeagueName: string;
  LeagueId: string;
  State: string;
  LeagueYear: string;
  DivisionName: string;
  DivisionId: string;
  DivisionReportUrl: string;
};

export type LeagueSummary = {
  id: string;
  name: string;
  state: string;
  years: string[];
  divisionCount: number;
};

export type DivisionSummary = {
  id: string;
  name: string;
  year: string;
  leagueId: string;
  leagueName: string;
  state: string;
  reportUrl: string;
};

export type TableReport = {
  headers: string[];
  rows: string[][];
};

export type PlayersByTeamReport = {
  headers: string[];
  teams: {
    team: string;
    rows: string[][];
  }[];
};

export type ScheduleMatch = {
  matchId: string | null;
  home: string;
  away: string;
  location: string;
  url: string | null;
};

export type ScheduleDay = {
  date: string;
  matches: ScheduleMatch[];
};

export type RosterPlayer = {
  id: string;
  readableId: number;
  firstName: string;
  lastName: string;
  nickname: string | null;
  fargoRating: number;
  robustness: string | null;
  provisionalRating: number | null;
  handicap: number | null;
  showOnRoster: boolean;
  teamId: string;
  teamName: string;
};

export type DivisionTeam = {
  id: string;
  name: string;
  isBye: boolean;
  locationId: string | null;
  players: RosterPlayer[];
};

export type CalculatorMatchup = {
  matchId: string;
  date: string;
  location: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
};

export type LineupPreset = {
  id: string;
  name: string;
  divisionId: string;
  teamId: string;
  playerIds: string[];
  updatedAt: string;
};

export type UserPreferences = {
  leagueId: string;
  leagueName: string;
  divisionId: string | null;
  divisionName: string | null;
  playerId: string | null;
  playerName: string | null;
  teamId: string | null;
  teamName: string | null;
  /**
   * League night scoring preset id (see `scoring-formats.ts`).
   * null = infer from division name, else Palm Beach 5-player default.
   */
  scoringFormatId?: string | null;
};

export type PlayerSearchResult = {
  id: string;
  readableId: string | null;
  membershipId: string | null;
  firstName: string;
  lastName: string;
  name: string;
  location: string | null;
  rating: number | null;
  effectiveRating: number | null;
  provisionalRating: number | null;
  robustness: number | null;
  robustnessStatus: "starter" | "preliminary" | "established";
};

export type ReportTab =
  | "my-team"
  | "standings"
  | "players"
  | "schedule"
  | "handicap"
  | "events"
  | "search"
  | "score"
  | "lms"
  | "account";

/** Top-level app pillars (mobile bottom bar / desktop side rail). */
export type AppPillar = "home" | "league" | "manage" | "account";

export type MembershipTeam = {
  teamId: string;
  teamName: string;
  divisionId: string;
  divisionName: string;
  leagueId: string;
  leagueName: string;
  state: string;
  year: string;
};

export type MembershipSnapshot = {
  playerId: string;
  teams: MembershipTeam[];
  leagues: LeagueSummary[];
  divisions: DivisionSummary[];
};
