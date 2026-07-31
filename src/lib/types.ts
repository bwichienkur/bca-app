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

export type UserPreferences = {
  leagueId: string;
  leagueName: string;
  divisionId: string | null;
  divisionName: string | null;
};

export type ReportTab =
  | "teams"
  | "players"
  | "players-by-team"
  | "player-list"
  | "schedule";
