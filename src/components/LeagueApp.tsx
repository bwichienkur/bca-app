"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DEFAULT_LEAGUE_ID, REPORT_TABS } from "@/lib/constants";
import { normalizeTeamName } from "@/lib/matchups";
import { enrichPlayersWithRatings } from "@/lib/players";
import {
  clearStoredMembership,
  loadPreferences,
  loadStoredMembership,
  savePreferences,
  saveStoredMembership,
} from "@/lib/preferences";
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
import { PlayerSearch } from "./PlayerSearch";
import { ScheduleList } from "./ScheduleList";
import { ScheduleMatchDetail } from "./ScheduleMatchDetail";
import { SearchField } from "./SearchField";
import { SettingsScreen } from "./SettingsScreen";
import { TeamDetail } from "./TeamDetail";
import { TeamStandingSummary } from "./TeamStandingSummary";
import { Typeahead, type TypeaheadOption } from "./Typeahead";

type AppScreen = "main" | "login" | "settings";

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
  const [refreshToken, setRefreshToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const didAutoCollapseContext = useRef(false);
  const [, startTransition] = useTransition();
  const filterAnchor = useViewportAnchor<HTMLDivElement>();

  const persist = (next: UserPreferences) => {
    setPrefs(next);
    savePreferences(next);
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
    await fetch("/api/scoring/logout", { method: "POST" });
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
          "/api/scoring/session",
        );
        if (cancelled) return;
        setUser(sessionData.user);
        setAuthLoading(false);

        // Instant filter from last successful membership scan.
        const cachedMembership = sessionData.user
          ? loadStoredMembership(sessionData.user.lmsId)
          : null;
        if (sessionData.user && cachedMembership?.teams.length) {
          setMembership(cachedMembership);
          applyMembershipDefaults(
            cachedMembership,
            saved,
            sessionData.user.name,
          );
        } else {
          const data = await fetchJson<{ leagues: LeagueSummary[] }>(
            `/api/leagues?q=${encodeURIComponent(saved.leagueName)}`,
          );
          if (cancelled) return;
          setLeagues(data.leagues);
          const league =
            data.leagues.find((item) => item.id === saved.leagueId) ??
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
                (item) => item.id === saved.divisionId,
              ) ?? null;
            if (division) {
              setSelectedDivision(division);
            }
          }
        }

        // Refresh membership in the background (preferred league only).
        if (sessionData.user) {
          void loadMembership({
            fresh: false,
            prefsOverride: saved,
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
    if (tab === "handicap" || tab === "search" || tab === "score") {
      setLoadingReport(false);
      return;
    }

    let cancelled = false;
    async function loadReport() {
      setLoadingReport(true);
      setError(null);
      try {
        const id = selectedDivision!.id;
        if (tab === "standings" || tab === "my-team") {
          const data = await fetchJson<TableReport>(
            `/api/reports/teams?divisionId=${id}`,
          );
          if (!cancelled) setTeamReport(data);
        } else if (tab === "players") {
          const [players, ratings] = await Promise.all([
            fetchJson<TableReport>(`/api/reports/players?divisionId=${id}`),
            fetchJson<TableReport>(
              `/api/reports/player-list?divisionId=${id}`,
            ).catch(() => null),
          ]);
          if (!cancelled) {
            setPlayerReport(players);
            setPlayerList(ratings);
          }
        } else if (tab === "schedule") {
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
            if (teams) setTeamReport(teams);
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
    const keepTeam =
      prefs?.teamId &&
      membership?.teams.some(
        (team) =>
          team.teamId === prefs.teamId && team.divisionId === division.id,
      )
        ? { teamId: prefs.teamId, teamName: prefs.teamName }
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
          onRefreshMembership={() => {
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
    <main className="relative mx-auto min-h-dvh w-full max-w-7xl px-4 pb-[calc(1.5rem+var(--safe-bottom))] pt-4 md:px-6 lg:px-8">
      <header className="animate-rise mb-3 flex items-center justify-between gap-3 md:mb-4">
        <h1 className="font-[family-name:var(--font-display)] text-2xl leading-none tracking-tight text-[var(--felt-deep)] md:text-3xl">
          Tableside
        </h1>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void refreshCachedData()}
            disabled={refreshing}
            title="Clear cached league data and reload from FargoRate"
            className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--ink)] disabled:opacity-60"
          >
            {refreshing ? "Refreshing…" : "Refresh data"}
          </button>
          {user ? (
            <>
              <button
                type="button"
                onClick={() => setScreen("settings")}
                className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
              >
                Settings
              </button>
              <span className="hidden max-w-[10rem] truncate text-xs font-medium text-[var(--felt-deep)] sm:inline">
                {user.name ?? user.email ?? "Signed in"}
              </span>
            </>
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
      </header>

      {error ? (
        <div className="mb-4 rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">
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
      ) : user && membershipReady ? (
        <p className="mb-3 text-xs text-[var(--muted)]">
          Showing {membership!.teams.length} team
          {membership!.teams.length === 1 ? "" : "s"} across{" "}
          {membership!.leagues.length} league
          {membership!.leagues.length === 1 ? "" : "s"} from your roster.
        </p>
      ) : null}

      <section className="animate-rise animate-delay-1 relative z-40 mb-5 overflow-visible rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] shadow-sm [background-color:var(--surface)]">
        <button
          type="button"
          onClick={() => setContextOpen((open) => !open)}
          aria-expanded={contextOpen}
          className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left md:px-5 md:py-4"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
              League · Division · My team
            </p>
            {contextOpen ? (
              <p className="mt-1 text-sm text-[var(--muted)]">
                {user
                  ? "Signed in — selectors show only leagues, divisions, and teams you belong to. Standings and players still include the whole division."
                  : "Set once — Schedule and Handicap follow My team. Login to limit this to your teams."}
              </p>
            ) : (
              <div className="mt-1.5 space-y-0.5">
                <p className="truncate text-sm font-semibold text-[var(--ink)]">
                  {selectedLeague?.name ?? "Choose a league"}
                </p>
                <p className="truncate text-sm text-[var(--muted)]">
                  {selectedDivision?.name ?? "Choose a division"}
                  {prefs.teamName ? (
                    <>
                      {" "}
                      ·{" "}
                      <span className="font-medium text-[var(--felt-deep)]">
                        {prefs.teamName}
                      </span>
                    </>
                  ) : (
                    <span className="text-[var(--amber)]"> · Set my team</span>
                  )}
                </p>
              </div>
            )}
          </div>
          <span className="mt-0.5 shrink-0 rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            {contextOpen ? "Collapse ▴" : "Change ▾"}
          </span>
        </button>

        {contextOpen ? (
          <div className="border-t border-[var(--line)] px-4 pb-4 pt-3 md:px-5 md:pb-5">
            <div className="grid gap-4 md:grid-cols-3">
              <Typeahead
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

      <section
        className={[
          "animate-rise animate-delay-2",
          tab === "score" ? "space-y-1.5" : "space-y-4",
        ].join(" ")}
      >
        {selectedDivision ? (
          <div className="relative z-0 rounded-[1.4rem] border border-[var(--line)] bg-[linear-gradient(135deg,rgba(20,92,69,0.96),rgba(13,61,46,0.98))] px-4 py-4 text-white shadow-[var(--shadow)] md:px-6 md:py-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/70">
                  {selectedDivision.leagueName}
                </p>
                <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl leading-tight md:text-3xl">
                  {selectedDivision.name}
                </h2>
                {prefs.teamName ? (
                  <p className="mt-2 text-sm text-white/80">
                    Following <span className="font-semibold">{prefs.teamName}</span>
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-white/70">
                    Set “My team” above to personalize schedule & handicap.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}

        <div
          ref={filterAnchor.ref}
          data-report-tabs
          className={[
            "sticky top-0 z-20 -mx-1 flex flex-col gap-2 bg-[color-mix(in_srgb,var(--paper)_90%,transparent)] px-1 backdrop-blur md:flex-row md:items-center md:justify-between",
            tab === "score" ? "py-1" : "py-1.5",
          ].join(" ")}
        >
          <nav
            aria-label="Reports"
            className="grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap sm:gap-2"
          >
            {REPORT_TABS.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTab(item.id);
                    if (
                      (item.id === "schedule" || item.id === "my-team") &&
                      !prefs.teamName
                    ) {
                      setContextOpen(true);
                    }
                  }}
                  className={[
                    "rounded-xl px-2 py-2 text-center text-[12px] font-semibold leading-tight transition sm:rounded-full sm:px-3.5 sm:py-2 sm:text-sm sm:font-medium",
                    active
                      ? "bg-[var(--felt)] text-white shadow-sm"
                      : "bg-[var(--surface)]/80 text-[var(--muted)] hover:bg-[var(--surface-2)]",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {selectedDivision &&
          ((tab === "standings" && !selectedTeamName) || tab === "players") ? (
            <SearchField
              value={filterQuery}
              onBeforeChange={filterAnchor.mark}
              onChange={setFilterQuery}
              placeholder={
                tab === "standings" ? "Filter teams…" : "Filter players…"
              }
            />
          ) : null}
        </div>

        <div
          className={[
            "animate-panel min-w-0 [overflow-anchor:none]",
            tab === "score" ? "mt-0 space-y-0" : "space-y-6",
          ].join(" ")}
        >
          {tab === "search" ? (
            <PlayerSearch />
          ) : tab === "score" ? (
            <MatchScoring
              divisionId={selectedDivision?.id ?? null}
              divisionName={selectedDivision?.name ?? null}
              teamId={prefs.teamId}
              teamName={prefs.teamName}
              user={user}
              authLoading={authLoading}
              onRequestLogin={() => setScreen("login")}
            />
          ) : !selectedDivision ? (
            <EmptyState
              title="Choose a division to continue"
              body="Use the typeaheads above — start typing your division name for a fast jump. Search and Score sign-in work without a full division, but Score needs one to list matches."
            />
          ) : tab === "handicap" ? (
            <HandicapCalculator
              divisionId={selectedDivision.id}
              divisionName={selectedDivision.name}
              prefs={prefs}
              refreshToken={refreshToken}
              onSelectTeam={({ teamId, teamName }) => {
                persist({
                  ...prefs,
                  teamId,
                  teamName,
                  divisionId: selectedDivision.id,
                  divisionName: selectedDivision.name,
                });
              }}
            />
          ) : loadingReport ? (
            <LoadingState label="Pulling report from LMS…" />
          ) : tab === "my-team" ? (
            prefs.teamName ? (
              <section className="space-y-4">
                {myStandingCells ? (
                  <TeamStandingSummary
                    cells={myStandingCells}
                    teamName={prefs.teamName}
                  />
                ) : null}
                <TeamDetail
                  teamName={prefs.teamName}
                  team={myTeam}
                  playersByTeam={playersByTeam}
                  isMyTeam
                />
              </section>
            ) : (
              <EmptyState
                title="Set your team"
                body="Open League · Division · My team above and pick your team to see roster and player stats here."
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
                backLabel="Back to standings"
                onClose={() => setSelectedTeamName(null)}
                onSetAsMyTeam={
                  detailTeam ? () => setMyTeam(detailTeam) : undefined
                }
              />
            ) : (
              <section className="min-h-[min(50dvh,24rem)] space-y-3 [overflow-anchor:none]">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
                      Division
                    </p>
                    <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--felt-deep)]">
                      Team standings
                    </h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Tap a team to view player statistics. Use back to return
                      to the standings grid.
                    </p>
                  </div>
                  {filterQuery.trim() ? (
                    <button
                      type="button"
                      onClick={() => {
                        filterAnchor.mark();
                        setFilterQuery("");
                      }}
                      className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]"
                    >
                      Clear filter
                    </button>
                  ) : null}
                </div>
                <DataTable
                  headers={teamReport.headers}
                  rows={filteredTeamRows}
                  stickyFirst
                  compact
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
              {filterQuery.trim() ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      filterAnchor.mark();
                      setFilterQuery("");
                    }}
                    className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]"
                  >
                    Clear filter
                  </button>
                </div>
              ) : null}
              <DataTable
                headers={playersWithRatings.headers}
                rows={filteredPlayerRows}
                stickyFirst
                compact
                emptyText="No players match your filter."
              />
            </section>
          ) : tab === "schedule" && schedule ? (
            !prefs.teamName ? (
              <EmptyState
                title="Set My team for schedule"
                body="Open League · Division · My team above and pick your team. Schedule always uses that selection."
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
