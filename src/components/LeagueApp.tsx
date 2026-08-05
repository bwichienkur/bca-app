"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  DEFAULT_LEAGUE_ID,
  DEFAULT_PLAYERS_PER_TEAM,
  PRIMARY_NAV_TABS,
} from "@/lib/constants";
import { normalizeTeamName } from "@/lib/matchups";
import { enrichPlayersWithRatings } from "@/lib/players";
import {
  clearStoredMembership,
  loadPreferences,
  loadStoredMembership,
  savePreferences,
  saveStoredMembership,
} from "@/lib/preferences";
import {
  fetchSharedPreferences,
  pushSharedPreferences,
} from "@/lib/prefs-sync";
import { useViewportAnchor } from "@/lib/use-viewport-anchor";
import type {
  DivisionSummary,
  DivisionTeam,
  LeagueSummary,
  MembershipSnapshot,
  PlayersByTeamReport,
  ReportTab,
  ScheduleDay,
  ScheduleMatch,
  TableReport,
  UserPreferences,
} from "@/lib/types";
import { DataTable } from "./DataTable";
import { EmptyState } from "./EmptyState";
import { HandicapCalculator } from "./HandicapCalculator";
import { LoadingState } from "./LoadingState";
import { LoginScreen, type AuthUser } from "./LoginScreen";
import { MatchScoring } from "./MatchScoring";
import { NavTabIcon, SearchIcon } from "./NavIcons";
import { PlayerSearch } from "./PlayerSearch";
import { ScheduleList } from "./ScheduleList";
import { ScheduleMatchDetail } from "./ScheduleMatchDetail";
import { SearchField } from "./SearchField";
import { SettingsScreen } from "./SettingsScreen";
import { TeamDetail } from "./TeamDetail";
import { TeamLineupTemplates } from "./TeamLineupTemplates";
import { SectionCard } from "./SectionCard";
import { TeamStandingSummary } from "./TeamStandingSummary";
import { Tournaments } from "./Tournaments";
import { Typeahead, type TypeaheadOption } from "./Typeahead";

type AppScreen = "main" | "login" | "settings";
type MyTeamSubTab = "standing" | "roster" | "lineups";

function ResyncIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 0 0-15.5-6.36" />
      <path d="M3 4v5h5" />
      <path d="M3 12a9 9 0 0 0 15.5 6.36" />
      <path d="M21 20v-5h-5" />
    </svg>
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function filterRows(rows: string[][], query: string): string[][] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(q)));
}

function teamNameIndex(headers: string[]): number {
  const index = headers.findIndex((header) =>
    ["team", "name"].includes(header.toLowerCase()),
  );
  return index >= 0 ? index : 0;
}

function standingCellsForTeam(
  teamReport: TableReport | null,
  teamName: string | null | undefined,
) {
  if (!teamReport || !teamName) return null;
  const nameIndex = teamNameIndex(teamReport.headers);
  const row = teamReport.rows.find(
    (item) =>
      normalizeTeamName(item[nameIndex] ?? "") ===
      normalizeTeamName(teamName),
  );
  if (!row) return null;
  return teamReport.headers.map((header, index) => ({
    label: header,
    value: row[index] ?? "—",
  }));
}

export function LeagueApp() {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [leagueQuery, setLeagueQuery] = useState("Palm Beach");
  const [leagues, setLeagues] = useState<LeagueSummary[]>([]);
  const [divisions, setDivisions] = useState<DivisionSummary[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<LeagueSummary | null>(
    null,
  );
  const [selectedDivision, setSelectedDivision] =
    useState<DivisionSummary | null>(null);
  const [tab, setTab] = useState<ReportTab>("standings");
  const [playerSearchQuery, setPlayerSearchQuery] = useState("");
  const [screen, setScreen] = useState<AppScreen>("main");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [membership, setMembership] = useState<MembershipSnapshot | null>(null);
  const [loadingMembership, setLoadingMembership] = useState(false);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [loadingDivisions, setLoadingDivisions] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [teamReport, setTeamReport] = useState<TableReport | null>(null);
  const [playerReport, setPlayerReport] = useState<TableReport | null>(null);
  const [playersByTeam, setPlayersByTeam] =
    useState<PlayersByTeamReport | null>(null);
  const [playerList, setPlayerList] = useState<TableReport | null>(null);
  const [schedule, setSchedule] = useState<ScheduleDay[] | null>(null);
  const [divisionTeams, setDivisionTeams] = useState<DivisionTeam[]>([]);
  const [filterQuery, setFilterQuery] = useState("");
  const [selectedTeamName, setSelectedTeamName] = useState<string | null>(null);
  const [selectedScheduleMatch, setSelectedScheduleMatch] = useState<{
    match: ScheduleMatch;
    date: string;
  } | null>(null);
  const [contextOpen, setContextOpen] = useState(true);
  const [myTeamSubTab, setMyTeamSubTab] = useState<MyTeamSubTab>("standing");
  const [refreshToken, setRefreshToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const didAutoCollapseContext = useRef(false);
  const teamReportKeyRef = useRef<string | null>(null);
  const playerReportKeyRef = useRef<string | null>(null);
  const scheduleKeyRef = useRef<string | null>(null);
  const [, startTransition] = useTransition();
  const filterAnchor = useViewportAnchor<HTMLDivElement>();

  const persist = (next: UserPreferences) => {
    setPrefs(next);
    savePreferences(next);
    if (user) void pushSharedPreferences(next);
  };

  const loadMembership = async (options?: {
    fresh?: boolean;
    prefsOverride?: UserPreferences | null;
  }) => {
    const base = options?.prefsOverride ?? prefs;
    const scopedLeagueId =
      (base?.leagueId || DEFAULT_LEAGUE_ID).trim() || DEFAULT_LEAGUE_ID;
    setLoadingMembership(true);
    setMembershipError(null);
    try {
      const params = new URLSearchParams({ leagueId: scopedLeagueId });
      if (options?.fresh) params.set("fresh", "1");
      if (base?.divisionId) params.set("divisionId", base.divisionId);
      if (base?.teamId) params.set("teamId", base.teamId);
      if (base?.teamName) params.set("teamName", base.teamName);
      const data = await fetchJson<{ membership: MembershipSnapshot }>(
        `/api/scoring/membership?${params.toString()}`,
      );
      setMembership(data.membership);
      if (data.membership.teams.length) {
        saveStoredMembership(data.membership);
      }
      return data.membership;
    } catch (err) {
      setMembershipError(
        err instanceof Error ? err.message : "Failed to load memberships.",
      );
      return null;
    } finally {
      setLoadingMembership(false);
    }
  };

  const applyMembershipDefaults = (
    nextMembership: MembershipSnapshot,
    basePrefs: UserPreferences,
    playerName?: string | null,
  ) => {
    const preferredTeam =
      nextMembership.teams.find((team) => team.teamId === basePrefs.teamId) ??
      nextMembership.teams.find(
        (team) => team.divisionId === basePrefs.divisionId,
      ) ??
      nextMembership.teams[0] ??
      null;
    const preferredDivision =
      nextMembership.divisions.find(
        (division) =>
          division.id === (preferredTeam?.divisionId ?? basePrefs.divisionId),
      ) ??
      nextMembership.divisions[0] ??
      null;
    const preferredLeague =
      nextMembership.leagues.find(
        (league) =>
          league.id === (preferredDivision?.leagueId ?? basePrefs.leagueId),
      ) ??
      nextMembership.leagues[0] ??
      null;

    if (preferredLeague) {
      setSelectedLeague(preferredLeague);
      setLeagues(nextMembership.leagues);
      setLeagueQuery(preferredLeague.name);
    }
    if (preferredDivision) {
      setSelectedDivision(preferredDivision);
      setDivisions(
        nextMembership.divisions.filter(
          (division) => division.leagueId === preferredDivision.leagueId,
        ),
      );
    } else {
      setSelectedDivision(null);
      setDivisions([]);
    }

    const nextPrefs: UserPreferences = {
      ...basePrefs,
      playerId: nextMembership.playerId,
      playerName: playerName ?? basePrefs.playerName,
      leagueId: preferredLeague?.id ?? basePrefs.leagueId,
      leagueName: preferredLeague?.name ?? basePrefs.leagueName,
      divisionId: preferredDivision?.id ?? null,
      divisionName: preferredDivision?.name ?? null,
      teamId: preferredTeam?.teamId ?? null,
      teamName: preferredTeam?.teamName ?? null,
    };
    persist(nextPrefs);
  };

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setMembership(null);
    setMembershipError(null);
    clearStoredMembership();
    setScreen("main");
  };

  const refreshCachedData = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await fetchJson<{ ok: boolean }>("/api/cache/lms/refresh", {
        method: "POST",
      });
      // Clear client-held report state so loaders don't keep stale UI.
      setTeamReport(null);
      setPlayerReport(null);
      setPlayerList(null);
      setSchedule(null);
      setPlayersByTeam(null);
      setDivisionTeams([]);

      const leagueQ = selectedLeague?.name ?? leagueQuery;
      const leagueData = await fetchJson<{ leagues: LeagueSummary[] }>(
        `/api/leagues?q=${encodeURIComponent(leagueQ)}`,
      );
      setLeagues(leagueData.leagues);
      if (selectedLeague) {
        const still =
          leagueData.leagues.find((item) => item.id === selectedLeague.id) ??
          null;
        if (still) setSelectedLeague(still);
        const divisionData = await fetchJson<{
          divisions: DivisionSummary[];
        }>(`/api/leagues/${selectedLeague.id}/divisions`);
        setDivisions(divisionData.divisions);
        if (selectedDivision) {
          const nextDivision =
            divisionData.divisions.find(
              (item) => item.id === selectedDivision.id,
            ) ?? null;
          if (nextDivision) setSelectedDivision(nextDivision);
        }
      }
      setRefreshToken((value) => value + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to refresh league data.",
      );
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const saved = loadPreferences();
      setPrefs(saved);
      setLeagueQuery(saved.leagueName.split(" ").slice(0, 2).join(" "));
      setBooting(true);
      setError(null);
      try {
        const sessionData = await fetchJson<{ user: AuthUser | null }>(
          "/api/auth/session",
        );
        if (cancelled) return;
        setUser(sessionData.user);
        setAuthLoading(false);

        let effectivePrefs = saved;
        const hasFargo = Boolean(sessionData.user?.lmsId);
        if (sessionData.user && hasFargo) {
          const shared = await fetchSharedPreferences();
          if (cancelled) return;
          if (shared) {
            effectivePrefs = {
              ...saved,
              ...shared,
              playerId: sessionData.user.lmsId,
              playerName: sessionData.user.name ?? shared.playerName,
            };
            setPrefs(effectivePrefs);
            savePreferences(effectivePrefs);
            setLeagueQuery(
              effectivePrefs.leagueName.split(" ").slice(0, 2).join(" "),
            );
          } else {
            void pushSharedPreferences({
              ...saved,
              playerId: sessionData.user.lmsId,
              playerName: sessionData.user.name ?? saved.playerName,
            });
          }
        }

        // Instant filter from last successful membership scan.
        const cachedMembership =
          sessionData.user?.lmsId
            ? loadStoredMembership(sessionData.user.lmsId)
            : null;
        if (sessionData.user && cachedMembership?.teams.length) {
          setMembership(cachedMembership);
          applyMembershipDefaults(
            cachedMembership,
            effectivePrefs,
            sessionData.user.name,
          );
        } else {
          const data = await fetchJson<{ leagues: LeagueSummary[] }>(
            `/api/leagues?q=${encodeURIComponent(effectivePrefs.leagueName)}`,
          );
          if (cancelled) return;
          setLeagues(data.leagues);
          const league =
            data.leagues.find((item) => item.id === effectivePrefs.leagueId) ??
            data.leagues[0] ??
            null;
          setSelectedLeague(league);
          if (league) {
            const divisionData = await fetchJson<{
              divisions: DivisionSummary[];
            }>(`/api/leagues/${league.id}/divisions`);
            if (cancelled) return;
            setDivisions(divisionData.divisions);
            const division =
              divisionData.divisions.find(
                (item) => item.id === effectivePrefs.divisionId,
              ) ?? null;
            if (division) {
              setSelectedDivision(division);
            }
          }
        }

        // Refresh membership in the background.
        if (sessionData.user) {
          void loadMembership({
            fresh: false,
            prefsOverride: effectivePrefs,
          }).then((nextMembership) => {
            if (cancelled || !nextMembership?.teams.length) return;
            applyMembershipDefaults(
              nextMembership,
              loadPreferences(),
              sessionData.user!.name,
            );
          });
        }
      } catch (err) {
        if (!cancelled) {
          setAuthLoading(false);
          setError(err instanceof Error ? err.message : "Failed to start app");
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (booting || user) return;
    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      setLoadingLeagues(true);
      try {
        const data = await fetchJson<{ leagues: LeagueSummary[] }>(
          `/api/leagues?q=${encodeURIComponent(leagueQuery)}`,
        );
        if (!controller.signal.aborted) setLeagues(data.leagues);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Failed to load leagues");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingLeagues(false);
      }
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [leagueQuery, booting, user]);

  useEffect(() => {
    if (!selectedDivision) return;
    let cancelled = false;

    async function loadDivisionBundle() {
      setLoadingContext(true);
      setPlayersByTeam(null);
      setDivisionTeams([]);
      try {
        const [byTeam, calculator] = await Promise.all([
          fetchJson<PlayersByTeamReport>(
            `/api/reports/players-by-team?divisionId=${selectedDivision!.id}`,
          ),
          fetchJson<{ teams: DivisionTeam[] }>(
            `/api/divisions/${selectedDivision!.id}/calculator`,
          ),
        ]);
        if (cancelled) return;
        setPlayersByTeam(byTeam);
        setDivisionTeams(calculator.teams);
      } catch {
        // Non-fatal for reports that don't need team context.
      } finally {
        if (!cancelled) setLoadingContext(false);
      }
    }

    void loadDivisionBundle();
    return () => {
      cancelled = true;
    };
  }, [selectedDivision, prefs?.teamId, refreshToken]);

  useEffect(() => {
    if (!selectedDivision) return;
    if (
      tab === "handicap" ||
      tab === "search" ||
      tab === "score" ||
      tab === "events"
    ) {
      setLoadingReport(false);
      return;
    }

    let cancelled = false;
    async function loadReport() {
      const id = selectedDivision!.id;
      const cacheKey = `${id}:${refreshToken}`;
      const needsTeams = tab === "standings" || tab === "my-team";
      const needsPlayers = tab === "players";
      const needsSchedule = tab === "schedule";

      const hasTeams = Boolean(teamReport) && teamReportKeyRef.current === cacheKey;
      const hasPlayers =
        Boolean(playerReport) && playerReportKeyRef.current === cacheKey;
      const hasSchedule =
        Boolean(schedule) && scheduleKeyRef.current === cacheKey;

      if (
        (needsTeams && hasTeams) ||
        (needsPlayers && hasPlayers) ||
        (needsSchedule && hasSchedule)
      ) {
        setLoadingReport(false);
        return;
      }

      // Keep current UI up while refetching if we already have something to show.
      const hasSoftContent =
        (needsTeams && Boolean(teamReport)) ||
        (needsPlayers && Boolean(playerReport)) ||
        (needsSchedule && Boolean(schedule));
      if (!hasSoftContent) setLoadingReport(true);
      setError(null);
      try {
        if (needsTeams) {
          const data = await fetchJson<TableReport>(
            `/api/reports/teams?divisionId=${id}`,
          );
          if (!cancelled) {
            setTeamReport(data);
            teamReportKeyRef.current = cacheKey;
          }
        } else if (needsPlayers) {
          const [players, ratings] = await Promise.all([
            fetchJson<TableReport>(`/api/reports/players?divisionId=${id}`),
            fetchJson<TableReport>(
              `/api/reports/player-list?divisionId=${id}`,
            ).catch(() => null),
          ]);
          if (!cancelled) {
            setPlayerReport(players);
            setPlayerList(ratings);
            playerReportKeyRef.current = cacheKey;
          }
        } else if (needsSchedule) {
          const [scheduleData, teams] = await Promise.all([
            fetchJson<{ days: ScheduleDay[] }>(
              `/api/reports/schedule?divisionId=${id}`,
            ),
            fetchJson<TableReport>(
              `/api/reports/teams?divisionId=${id}`,
            ).catch(() => null),
          ]);
          if (!cancelled) {
            setSchedule(scheduleData.days);
            scheduleKeyRef.current = cacheKey;
            if (teams) {
              setTeamReport(teams);
              teamReportKeyRef.current = cacheKey;
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load report");
        }
      } finally {
        if (!cancelled) setLoadingReport(false);
      }
    }

    void loadReport();
    return () => {
      cancelled = true;
    };
    // teamReport/playerReport/schedule intentionally omitted — cache keys gate refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDivision, tab, refreshToken]);

  useEffect(() => {
    setFilterQuery("");
    // Standings / schedule drill-ins are opt-in via click only — never carry
    // a selection across tabs or division changes.
    setSelectedTeamName(null);
    setSelectedScheduleMatch(null);
  }, [tab, selectedDivision?.id]);

  const membershipReady = Boolean(
    user && membership && membership.teams.length,
  );

  const chooseLeague = async (league: LeagueSummary) => {
    setSelectedLeague(league);
    setSelectedDivision(null);
    setSelectedTeamName(null);
    setLoadingDivisions(true);
    setError(null);
    try {
      if (membershipReady) {
        setDivisions(
          membership!.divisions.filter(
            (division) => division.leagueId === league.id,
          ),
        );
      } else {
        const data = await fetchJson<{ divisions: DivisionSummary[] }>(
          `/api/leagues/${league.id}/divisions`,
        );
        setDivisions(data.divisions);
      }
      persist({
        ...(prefs ?? {
          playerId: user?.lmsId ?? null,
          playerName: user?.name ?? null,
          teamId: null,
          teamName: null,
          divisionId: null,
          divisionName: null,
          leagueId: league.id,
          leagueName: league.name,
        }),
        leagueId: league.id,
        leagueName: league.name,
        divisionId: null,
        divisionName: null,
        teamId: null,
        teamName: null,
        playerId: user?.lmsId ?? prefs?.playerId ?? null,
        playerName: user?.name ?? prefs?.playerName ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load divisions");
    } finally {
      setLoadingDivisions(false);
    }
  };

  const chooseDivision = (division: DivisionSummary) => {
    setSelectedDivision(division);
    setSelectedTeamName(null);
    setTab("standings");
    setTeamReport(null);
    setPlayerReport(null);
    setPlayerList(null);
    setSchedule(null);
    startTransition(() => undefined);
    const base = prefs ?? {
      leagueId: division.leagueId,
      leagueName: division.leagueName,
      divisionId: null,
      divisionName: null,
      playerId: user?.lmsId ?? null,
      playerName: user?.name ?? null,
      teamId: null,
      teamName: null,
    };
    const membershipTeams =
      membership?.teams.filter((team) => team.divisionId === division.id) ??
      [];
    const keepTeam =
      prefs?.teamId &&
      membershipTeams.some((team) => team.teamId === prefs.teamId)
        ? { teamId: prefs.teamId, teamName: prefs.teamName }
        : membershipTeams[0]
          ? {
              teamId: membershipTeams[0].teamId,
              teamName: membershipTeams[0].teamName,
            }
          : { teamId: null, teamName: null };
    persist({
      ...base,
      leagueId: division.leagueId,
      leagueName: division.leagueName,
      divisionId: division.id,
      divisionName: division.name,
      ...keepTeam,
      playerId: user?.lmsId ?? base.playerId,
      playerName: user?.name ?? base.playerName,
    });
  };

  const setMyTeam = (team: DivisionTeam) => {
    if (!prefs || !selectedDivision) return;
    setTab("my-team");
    persist({
      ...prefs,
      divisionId: selectedDivision.id,
      divisionName: selectedDivision.name,
      teamId: team.id,
      teamName: team.name,
    });
  };

  const clearLeague = () => {
    setSelectedLeague(null);
    setSelectedDivision(null);
    setSelectedTeamName(null);
    setDivisions([]);
    setDivisionTeams([]);
    setTeamReport(null);
    setPlayerReport(null);
    setPlayerList(null);
    setSchedule(null);
    setPlayersByTeam(null);
    if (prefs) {
      persist({
        ...prefs,
        divisionId: null,
        divisionName: null,
        teamId: null,
        teamName: null,
      });
    }
  };

  const clearDivision = () => {
    setSelectedDivision(null);
    setSelectedTeamName(null);
    setDivisionTeams([]);
    setTeamReport(null);
    setPlayerReport(null);
    setPlayerList(null);
    setSchedule(null);
    setPlayersByTeam(null);
    if (prefs) {
      persist({
        ...prefs,
        divisionId: null,
        divisionName: null,
        teamId: null,
        teamName: null,
      });
    }
  };

  const clearMyTeam = () => {
    setSelectedTeamName(null);
    if (prefs) {
      persist({
        ...prefs,
        teamId: null,
        teamName: null,
      });
    }
  };

  const leagueOptions: TypeaheadOption<LeagueSummary>[] = useMemo(() => {
    const source = membershipReady ? membership!.leagues : leagues;
    return source.map((league) => ({
      id: league.id,
      label: league.name,
      meta: `${league.state} · ${league.divisionCount} divisions`,
      value: league,
    }));
  }, [membershipReady, membership, leagues]);

  const divisionOptions: TypeaheadOption<DivisionSummary>[] = useMemo(() => {
    const source = membershipReady
      ? membership!.divisions.filter(
          (division) =>
            !selectedLeague || division.leagueId === selectedLeague.id,
        )
      : divisions;
    return source.map((division) => ({
      id: division.id,
      label: division.name,
      meta: `${division.year} · ${division.leagueName}`,
      value: division,
    }));
  }, [membershipReady, membership, divisions, selectedLeague]);

  const teamOptions: TypeaheadOption<DivisionTeam>[] = useMemo(() => {
    if (membershipReady && selectedDivision) {
      const mine = membership!.teams.filter(
        (team) => team.divisionId === selectedDivision.id,
      );
      return mine.map((team) => {
        const full =
          divisionTeams.find((item) => item.id === team.teamId) ?? null;
        const value: DivisionTeam = full ?? {
          id: team.teamId,
          name: team.teamName,
          isBye: false,
          locationId: null,
          players: [],
        };
        return {
          id: team.teamId,
          label: team.teamName,
          meta: full
            ? `${full.players.length} players`
            : "Your team",
          value,
        };
      });
    }
    return divisionTeams.map((team) => ({
      id: team.id,
      label: team.name,
      meta: `${team.players.length} players`,
      value: team,
    }));
  }, [membershipReady, membership, selectedDivision, divisionTeams]);

  /** Followed team from the top League / Division / My team section */
  const myTeam =
    divisionTeams.find(
      (team) =>
        team.id === prefs?.teamId ||
        (Boolean(prefs?.teamName) &&
          normalizeTeamName(team.name) ===
            normalizeTeamName(prefs?.teamName ?? "")),
    ) ?? null;

  const detailTeam =
    divisionTeams.find(
      (team) =>
        normalizeTeamName(team.name) ===
        normalizeTeamName(selectedTeamName ?? ""),
    ) ?? null;

  useEffect(() => {
    if (didAutoCollapseContext.current) return;
    if (selectedDivision && prefs?.teamName) {
      setContextOpen(false);
      didAutoCollapseContext.current = true;
    }
  }, [selectedDivision, prefs?.teamName]);

  const filteredTeamRows = useMemo(() => {
    if (!teamReport) return [];
    return filterRows(teamReport.rows, filterQuery);
  }, [teamReport, filterQuery]);

  const playersWithRatings = useMemo(() => {
    if (!playerReport) return null;
    return enrichPlayersWithRatings(playerReport, playerList);
  }, [playerReport, playerList]);

  const filteredPlayerRows = useMemo(() => {
    if (!playersWithRatings) return [];
    return filterRows(playersWithRatings.rows, filterQuery);
  }, [playersWithRatings, filterQuery]);

  const myStandingCells = useMemo(
    () => standingCellsForTeam(teamReport, prefs?.teamName),
    [teamReport, prefs?.teamName],
  );

  const findDivisionTeam = (name: string) =>
    divisionTeams.find(
      (team) => normalizeTeamName(team.name) === normalizeTeamName(name),
    ) ?? null;

  if (!prefs || booting) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-6xl items-center justify-center px-5">
        <LoadingState label="Connecting to FargoRate LMS…" />
      </main>
    );
  }

  if (screen === "login") {
    return (
      <main className="relative mx-auto min-h-dvh w-full max-w-7xl px-4 pb-[calc(1.5rem+var(--safe-bottom))] pt-4 md:px-6 lg:px-8">
        <header className="mb-6">
          <h1 className="font-[family-name:var(--font-display)] text-2xl leading-none tracking-tight text-[var(--felt-deep)] md:text-3xl">
            Tableside
          </h1>
        </header>
        <LoginScreen
          onCancel={() => setScreen("main")}
          onSuccess={(nextUser) => {
            setUser(nextUser);
            setScreen("main");
            const basePrefs = prefs ?? loadPreferences();
            void (async () => {
              // Prefer Redis/local cache; only scan the preferred league.
              const nextMembership = await loadMembership({
                fresh: false,
                prefsOverride: basePrefs,
              });
              if (nextMembership?.teams.length) {
                applyMembershipDefaults(
                  nextMembership,
                  basePrefs,
                  nextUser.name,
                );
              } else {
                setScreen("settings");
              }
            })();
          }}
        />
      </main>
    );
  }

  if (screen === "settings" && user && prefs) {
    return (
      <main className="relative mx-auto min-h-dvh w-full max-w-7xl px-4 pb-[calc(1.5rem+var(--safe-bottom))] pt-4 md:px-6 lg:px-8">
        <header className="mb-6">
          <h1 className="font-[family-name:var(--font-display)] text-2xl leading-none tracking-tight text-[var(--felt-deep)] md:text-3xl">
            Tableside
          </h1>
        </header>
        <SettingsScreen
          user={user}
          prefs={prefs}
          membership={membership}
          loadingMembership={loadingMembership}
          membershipError={membershipError}
          onClose={() => setScreen("main")}
          onUserUpdate={(nextUser) => {
            setUser(nextUser);
          }}
          onRefreshMembership={() => {
            if (!user.lmsId) return;
            void loadMembership({
              fresh: true,
              prefsOverride: prefs,
            }).then((next) => {
              if (next?.teams.length) {
                applyMembershipDefaults(next, prefs, user.name);
              }
            });
          }}
          onSave={(next) => {
            persist(next);
            const league =
              membership?.leagues.find((item) => item.id === next.leagueId) ??
              null;
            const division =
              membership?.divisions.find(
                (item) => item.id === next.divisionId,
              ) ?? null;
            if (league) {
              setSelectedLeague(league);
              setLeagues(membership?.leagues ?? [league]);
              setLeagueQuery(league.name);
            }
            if (division) {
              setSelectedDivision(division);
              setDivisions(
                (membership?.divisions ?? []).filter(
                  (item) => item.leagueId === division.leagueId,
                ),
              );
            }
            setScreen("main");
          }}
          onSignOut={() => void signOut()}
        />
      </main>
    );
  }

  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-7xl overflow-x-clip px-4 pb-[calc(1.5rem+var(--safe-bottom))] pt-4 md:px-6 lg:px-8">
      <header className="animate-rise mb-3 flex min-w-0 items-center justify-between gap-2 md:mb-4 md:gap-3">
        <h1 className="min-w-0 shrink truncate font-[family-name:var(--font-display)] text-2xl leading-none tracking-tight text-[var(--felt-deep)] md:text-3xl">
          Tableside
        </h1>
        <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
          {user ? (
            <div
              title={`Signed in as ${user.name ?? user.email ?? "player"}`}
              className="flex min-w-0 max-w-[2.25rem] items-center gap-2 rounded-full border border-[var(--felt)]/25 bg-[color-mix(in_srgb,var(--felt)_10%,var(--surface))] p-1 sm:max-w-[14rem] sm:px-2.5 sm:py-1.5"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--felt)] text-[10px] font-bold uppercase text-white sm:h-6 sm:w-6">
                {(user.name ?? user.email ?? "?").trim().charAt(0) || "?"}
              </span>
              <span className="hidden min-w-0 truncate text-xs font-semibold text-[var(--felt-deep)] sm:inline">
                {user.name ?? user.email ?? "Signed in"}
              </span>
            </div>
          ) : null}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => {
                setPlayerSearchQuery("");
                startTransition(() => setTab("search"));
              }}
              title="Search players"
              aria-label="Search players"
              aria-current={tab === "search" ? "page" : undefined}
              className={[
                "inline-flex h-9 w-9 items-center justify-center rounded-full border transition",
                tab === "search"
                  ? "border-[var(--felt)] bg-[var(--felt)] text-white"
                  : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
              ].join(" ")}
            >
              <SearchIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void refreshCachedData()}
              disabled={refreshing}
              title="Resync league data from FargoRate"
              aria-label={
                refreshing ? "Resyncing league data" : "Resync league data"
              }
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--ink)] disabled:opacity-60"
            >
              <ResyncIcon
                className={["h-4 w-4", refreshing ? "animate-spin" : ""].join(
                  " ",
                )}
              />
            </button>
            {user ? (
              <button
                type="button"
                onClick={() => setScreen("settings")}
                title="Settings"
                aria-label="Settings"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
              >
                <GearIcon className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setScreen("login")}
                className="rounded-full bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--felt-soft)]"
              >
                Login
              </button>
            )}
          </div>
        </div>
      </header>

      {error ? (
        <div className="mb-4 rounded-[var(--radius)] border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {user && loadingMembership ? (
        <p className="mb-3 text-xs text-[var(--muted)]">
          Loading your active BCAPL sessions…
        </p>
      ) : user && membership && !membership.teams.length ? (
        <p className="mb-3 text-xs text-[var(--muted)]">
          No team memberships found in this league yet. Open Settings to scan
          another league or find all your teams.
        </p>
      ) : null}

      <section className="animate-rise animate-delay-1 relative z-40 mb-2 overflow-visible rounded-[var(--radius)] border border-white/10 bg-[linear-gradient(135deg,rgba(29,110,158,0.98),rgba(19,78,115,0.96))] text-white shadow-[var(--shadow)]">
        <button
          type="button"
          onClick={() => setContextOpen((open) => !open)}
          aria-expanded={contextOpen}
          className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left md:px-6 md:py-5"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/65">
              {selectedLeague?.name ??
                selectedDivision?.leagueName ??
                "League · Division · My team"}
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl leading-tight md:text-3xl">
              {selectedDivision?.name ?? "Choose your division"}
            </h2>
            {contextOpen ? (
              <p className="mt-2 text-sm text-white/70">
                {user
                  ? "Pick from your active sessions. Standings and players still include the whole division."
                  : "Set league, division, and my team for schedule & handicap."}
              </p>
            ) : prefs.teamName ? (
              <p className="mt-2 text-sm text-white/80">
                Following <span className="font-semibold">{prefs.teamName}</span>
              </p>
            ) : (
              <p className="mt-2 text-sm text-white/70">
                Set my team to personalize schedule & handicap.
              </p>
            )}
          </div>
          <span className="mt-0.5 shrink-0 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/85">
            {contextOpen ? "Collapse ▴" : "Change ▾"}
          </span>
        </button>

        {contextOpen ? (
          <div className="border-t border-white/15 px-4 pb-4 pt-3 md:px-6 md:pb-5">
            <div className="grid gap-4 md:grid-cols-3">
              <Typeahead
                tone="felt"
                label="League"
                placeholder={
                  user
                    ? loadingMembership
                      ? "Loading your leagues…"
                      : "Your leagues"
                    : loadingLeagues
                      ? "Searching leagues…"
                      : "Search leagues"
                }
                value={
                  selectedLeague
                    ? {
                        id: selectedLeague.id,
                        label: selectedLeague.name,
                        meta: `${selectedLeague.state} · ${selectedLeague.divisionCount} divisions`,
                        value: selectedLeague,
                      }
                    : null
                }
                options={leagueOptions}
                onQueryChange={user ? undefined : setLeagueQuery}
                onChange={(option) => {
                  if (option) void chooseLeague(option.value);
                  else clearLeague();
                }}
              />
              <Typeahead
                tone="felt"
                label="Division"
                placeholder={
                  !selectedLeague
                    ? "Pick a league first"
                    : loadingDivisions
                      ? "Loading divisions…"
                      : user
                        ? "Your divisions"
                        : "Type to find your division"
                }
                value={
                  selectedDivision
                    ? {
                        id: selectedDivision.id,
                        label: selectedDivision.name,
                        meta: `${selectedDivision.year}`,
                        value: selectedDivision,
                      }
                    : null
                }
                options={divisionOptions}
                disabled={!selectedLeague || loadingDivisions}
                onChange={(option) => {
                  if (option) chooseDivision(option.value);
                  else clearDivision();
                }}
                emptyText="No divisions match"
              />
              <Typeahead
                tone="felt"
                label="My team"
                placeholder={
                  !selectedDivision
                    ? "Pick a division first"
                    : loadingContext
                      ? "Loading teams…"
                      : user
                        ? "Your teams in this division"
                        : "Set your team for schedule & handicap"
                }
                value={
                  myTeam
                    ? {
                        id: myTeam.id,
                        label: myTeam.name,
                        meta: `${myTeam.players.length} players`,
                        value: myTeam,
                      }
                    : null
                }
                options={teamOptions}
                disabled={!selectedDivision || loadingContext}
                onChange={(option) => {
                  if (option) {
                    setMyTeam(option.value);
                    setContextOpen(false);
                  } else {
                    clearMyTeam();
                  }
                }}
                emptyText="No teams loaded yet"
              />
            </div>
          </div>
        ) : null}
      </section>

      <section className="animate-rise animate-delay-2 space-y-1.5">
        <div
          data-report-tabs
          className="sticky top-0 z-20 -mx-1 bg-[color-mix(in_srgb,var(--paper)_90%,transparent)] px-1 py-1 backdrop-blur"
        >
          <nav
            aria-label="Reports"
            className="grid grid-cols-3 gap-1.5 sm:gap-2"
          >
            {PRIMARY_NAV_TABS.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    startTransition(() => {
                      setTab(item.id);
                    });
                    if (
                      (item.id === "schedule" ||
                        item.id === "my-team" ||
                        item.id === "score") &&
                      !prefs.teamName
                    ) {
                      setContextOpen(true);
                    }
                  }}
                  className={[
                    "flex flex-col items-center justify-center gap-1 rounded-[var(--radius)] px-1.5 py-2 transition sm:py-2.5",
                    active
                      ? "bg-[var(--felt)] text-white shadow-sm"
                      : "bg-[var(--surface)]/80 text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
                  ].join(" ")}
                >
                  <NavTabIcon id={item.id} className="h-[18px] w-[18px]" />
                  <span className="text-[11px] font-semibold leading-none tracking-tight sm:text-xs">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        <div
          className={[
            "animate-panel min-w-0 [overflow-anchor:none]",
            tab === "score" || tab === "players" || tab === "events"
              ? "mt-0 space-y-0"
              : "space-y-6",
          ].join(" ")}
        >
          {tab === "search" ? (
            <PlayerSearch initialQuery={playerSearchQuery} />
          ) : tab === "events" ? (
            <Tournaments
              user={user}
              authLoading={authLoading}
              playerFargo={
                prefs.playerId
                  ? (myTeam?.players.find((p) => p.id === prefs.playerId)
                      ?.fargoRating ?? null)
                  : null
              }
              onRequestLogin={() => setScreen("login")}
              onFindPlayer={(name) => {
                setPlayerSearchQuery(name);
                startTransition(() => setTab("search"));
              }}
            />
          ) : tab === "score" ? (
            <MatchScoring
              divisionId={selectedDivision?.id ?? null}
              divisionName={selectedDivision?.name ?? null}
              teamId={prefs.teamId}
              teamName={prefs.teamName}
              user={user}
              authLoading={authLoading}
              onRequestLogin={() => setScreen("login")}
              onRequestContext={() => setContextOpen(true)}
            />
          ) : !selectedDivision ? (
            <EmptyState
              title="Choose a division to continue"
              body="Search works without a division. Score and reports need one from your context card."
              action={
                <button
                  type="button"
                  onClick={() => setContextOpen(true)}
                  className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Choose division
                </button>
              }
            />
          ) : tab === "handicap" ? (
            <HandicapCalculator
              divisionId={selectedDivision.id}
              divisionName={selectedDivision.name}
              prefs={prefs}
              refreshToken={refreshToken}
            />
          ) : loadingReport ? (
            <LoadingState label="Pulling report from LMS…" />
          ) : tab === "my-team" ? (
            prefs.teamName ? (
              <section className="space-y-4">
                <div
                  role="tablist"
                  aria-label="My team sections"
                  className="grid grid-cols-3 gap-0.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-0.5"
                >
                  {(
                    [
                      { id: "standing" as const, label: "Standing" },
                      { id: "roster" as const, label: "Roster" },
                      { id: "lineups" as const, label: "Lineups" },
                    ]
                  ).map((item) => {
                    const selected = myTeamSubTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() =>
                          startTransition(() => setMyTeamSubTab(item.id))
                        }
                        className={[
                          "rounded-md px-2 py-1.5 text-center text-xs font-semibold transition sm:text-sm",
                          selected
                            ? "bg-[var(--felt)] text-white shadow-sm"
                            : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
                        ].join(" ")}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                <div
                  className={
                    myTeamSubTab === "standing" ? "min-w-0" : "hidden"
                  }
                  aria-hidden={myTeamSubTab !== "standing"}
                >
                  {myStandingCells ? (
                    <TeamStandingSummary
                      cells={myStandingCells}
                      teamName={prefs.teamName}
                    />
                  ) : (
                    <EmptyState
                      title="Standing unavailable"
                      body="Team standings will show here once the division report loads."
                    />
                  )}
                </div>

                <div
                  className={
                    myTeamSubTab === "roster" ? "min-w-0 space-y-3" : "hidden"
                  }
                  aria-hidden={myTeamSubTab !== "roster"}
                >
                  <SectionCard
                    eyebrow="Team"
                    title="Roster"
                    description={
                      myTeam?.players.length
                        ? `${myTeam.players.length} rostered · avg Fargo ${Math.round(
                            myTeam.players.reduce(
                              (sum, player) => sum + player.fargoRating,
                              0,
                            ) / myTeam.players.length,
                          )}`
                        : "Player statistics and Fargo ratings"
                    }
                    badge={
                      myTeam?.players.length
                        ? {
                            label: "Players",
                            value: String(myTeam.players.length),
                          }
                        : undefined
                    }
                  />
                  <TeamDetail
                    teamName={prefs.teamName}
                    team={myTeam}
                    playersByTeam={playersByTeam}
                    isMyTeam
                    embedded
                  />
                </div>

                <div
                  className={myTeamSubTab === "lineups" ? "min-w-0" : "hidden"}
                  aria-hidden={myTeamSubTab !== "lineups"}
                >
                  {myTeam && selectedDivision ? (
                    <TeamLineupTemplates
                      divisionId={selectedDivision.id}
                      team={myTeam}
                      embedded
                    />
                  ) : (
                    <div className="space-y-3">
                      <SectionCard
                        eyebrow="Team"
                        title="Lineups"
                        description={`Save ${DEFAULT_PLAYERS_PER_TEAM}-player orders for league night. Load them from Handicap or Score.`}
                      />
                      <EmptyState
                        title="Team roster needed"
                        body="Lineup templates need your team’s roster from this division."
                      />
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <EmptyState
                title="Set your team"
                body="Pick My team on the context card to see roster, standing, and lineup templates."
                action={
                  <button
                    type="button"
                    onClick={() => setContextOpen(true)}
                    className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    Set my team
                  </button>
                }
              />
            )
          ) : tab === "standings" && teamReport ? (
            selectedTeamName ? (
              <TeamDetail
                teamName={selectedTeamName}
                team={detailTeam}
                playersByTeam={playersByTeam}
                isMyTeam={
                  normalizeTeamName(prefs.teamName ?? "") ===
                  normalizeTeamName(selectedTeamName)
                }
                backLabel="Back to league"
                onClose={() => setSelectedTeamName(null)}
                onSetAsMyTeam={
                  detailTeam ? () => setMyTeam(detailTeam) : undefined
                }
              />
            ) : (
              <section className="min-h-[min(50dvh,24rem)] space-y-3 [overflow-anchor:none]">
                <SectionCard
                  eyebrow="League"
                  title="Team standings"
                  description="Tap a team to view player statistics. Use back to return to the league grid."
                  badge={{
                    label: "Teams",
                    value: String(filteredTeamRows.length),
                  }}
                />
                <DataTable
                  headers={teamReport.headers}
                  rows={filteredTeamRows}
                  stickyFirst
                  compact
                  toolbar={
                    <SearchField
                      embedded
                      value={filterQuery}
                      anchorRef={filterAnchor.ref}
                      onBeforeChange={filterAnchor.mark}
                      onChange={setFilterQuery}
                      placeholder="Filter teams…"
                    />
                  }
                  isRowSelected={(row) =>
                    Boolean(
                      prefs.teamName &&
                        normalizeTeamName(
                          row[teamNameIndex(teamReport.headers)] ?? "",
                        ) === normalizeTeamName(prefs.teamName),
                    )
                  }
                  onRowClick={(row) => {
                    const name =
                      row[teamNameIndex(teamReport.headers)]?.trim() ?? "";
                    const matched = divisionTeams.find(
                      (team) =>
                        normalizeTeamName(team.name) ===
                        normalizeTeamName(name),
                    );
                    setSelectedTeamName(matched?.name ?? name);
                  }}
                  emptyText="No teams match your filter."
                />
              </section>
            )
          ) : tab === "players" && playersWithRatings ? (
            <section className="min-h-[min(50dvh,24rem)] space-y-3 [overflow-anchor:none]">
              <SectionCard
                eyebrow="Players"
                title="Division players"
                description={
                  <>
                    Standings and Fargo ratings for everyone in{" "}
                    <span className="font-medium text-white">
                      {selectedDivision.name}
                    </span>
                    . Filter the grid below to find someone quickly.
                  </>
                }
                badge={{
                  label: "Players",
                  value: String(filteredPlayerRows.length),
                }}
              />
              <DataTable
                headers={playersWithRatings.headers}
                rows={filteredPlayerRows}
                stickyFirst
                compact
                toolbar={
                  <SearchField
                    embedded
                    value={filterQuery}
                    anchorRef={filterAnchor.ref}
                    onBeforeChange={filterAnchor.mark}
                    onChange={setFilterQuery}
                    placeholder="Filter players…"
                  />
                }
                emptyText="No players match your filter."
              />
            </section>
          ) : tab === "schedule" && schedule ? (
            !prefs.teamName ? (
              <EmptyState
                title="Set My team for schedule"
                body="Schedule always uses your selected team from the context card."
                action={
                  <button
                    type="button"
                    onClick={() => setContextOpen(true)}
                    className="rounded-[var(--radius)] bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    Set my team
                  </button>
                }
              />
            ) : selectedScheduleMatch ? (
              <ScheduleMatchDetail
                key={`${selectedScheduleMatch.date}-${selectedScheduleMatch.match.matchId ?? selectedScheduleMatch.match.home}-${selectedScheduleMatch.match.away}`}
                date={selectedScheduleMatch.date}
                match={selectedScheduleMatch.match}
                homeTeam={findDivisionTeam(selectedScheduleMatch.match.home)}
                awayTeam={findDivisionTeam(selectedScheduleMatch.match.away)}
                playersByTeam={playersByTeam}
                homeStandingCells={standingCellsForTeam(
                  teamReport,
                  selectedScheduleMatch.match.home,
                )}
                awayStandingCells={standingCellsForTeam(
                  teamReport,
                  selectedScheduleMatch.match.away,
                )}
                myTeamName={prefs.teamName}
                onClose={() => setSelectedScheduleMatch(null)}
              />
            ) : (
              <ScheduleList
                days={schedule}
                teamName={prefs.teamName}
                divisionName={selectedDivision?.name ?? prefs.divisionName}
                teamReport={teamReport}
                onMatchClick={(match, day) =>
                  setSelectedScheduleMatch({ match, date: day.date })
                }
              />
            )
          ) : (
            <EmptyState title="Nothing to show yet" />
          )}
        </div>
      </section>
    </main>
  );
}
