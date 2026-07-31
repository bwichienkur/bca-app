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

export type UserPreferences = {
  leagueId: string;
  leagueName: string;
  divisionId: string | null;
  divisionName: string | null;
  playerId: string | null;
  playerName: string | null;
  teamId: string | null;
  teamName: string | null;
};

export type ReportTab =
  | "teams"
  | "players"
  | "players-by-team"
  | "player-list"
  | "schedule"
  | "handicap";
