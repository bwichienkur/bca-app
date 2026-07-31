"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { REPORT_TABS } from "@/lib/constants";
import { normalizeTeamName } from "@/lib/matchups";
import { loadPreferences, savePreferences } from "@/lib/preferences";
import type {
  DivisionSummary,
  DivisionTeam,
  LeagueSummary,
  PlayersByTeamReport,
  ReportTab,
  ScheduleDay,
  TableReport,
  UserPreferences,
} from "@/lib/types";
import { DataTable } from "./DataTable";
import { EmptyState } from "./EmptyState";
import { HandicapCalculator } from "./HandicapCalculator";
import { LoadingState } from "./LoadingState";
import { ScheduleList } from "./ScheduleList";
import { SearchField } from "./SearchField";
import { TeamDetail } from "./TeamDetail";
import { Typeahead, type TypeaheadOption } from "./Typeahead";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
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
  const [tab, setTab] = useState<ReportTab>("teams");
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
  const [, startTransition] = useTransition();

  const persist = (next: UserPreferences) => {
    setPrefs(next);
    savePreferences(next);
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
        if (!league) return;

        const divisionData = await fetchJson<{ divisions: DivisionSummary[] }>(
          `/api/leagues/${league.id}/divisions`,
        );
        if (cancelled) return;
        setDivisions(divisionData.divisions);
        const division =
          divisionData.divisions.find((item) => item.id === saved.divisionId) ??
          null;
        if (division) {
          setSelectedDivision(division);
          if (saved.teamName) setSelectedTeamName(saved.teamName);
        }
      } catch (err) {
        if (!cancelled) {
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
  }, []);

  useEffect(() => {
    if (booting) return;
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
  }, [leagueQuery, booting]);

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
        if (prefs?.teamId) {
          const team = calculator.teams.find((item) => item.id === prefs.teamId);
          if (team) setSelectedTeamName(team.name);
        }
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
  }, [selectedDivision, prefs?.teamId]);

  useEffect(() => {
    if (!selectedDivision) return;
    if (tab === "handicap") {
      setLoadingReport(false);
      return;
    }

    let cancelled = false;
    async function loadReport() {
      setLoadingReport(true);
      setError(null);
      try {
        const id = selectedDivision!.id;
        if (tab === "teams") {
          const data = await fetchJson<TableReport>(
            `/api/reports/teams?divisionId=${id}`,
          );
          if (!cancelled) setTeamReport(data);
        } else if (tab === "players") {
          const data = await fetchJson<TableReport>(
            `/api/reports/players?divisionId=${id}`,
          );
          if (!cancelled) setPlayerReport(data);
        } else if (tab === "player-list") {
          const data = await fetchJson<TableReport>(
            `/api/reports/player-list?divisionId=${id}`,
          );
          if (!cancelled) setPlayerList(data);
        } else if (tab === "schedule") {
          const data = await fetchJson<{ days: ScheduleDay[] }>(
            `/api/reports/schedule?divisionId=${id}`,
          );
          if (!cancelled) setSchedule(data.days);
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
  }, [selectedDivision, tab]);

  useEffect(() => {
    setFilterQuery("");
  }, [tab, selectedDivision?.id]);

  const chooseLeague = async (league: LeagueSummary) => {
    setSelectedLeague(league);
    setSelectedDivision(null);
    setSelectedTeamName(null);
    setLoadingDivisions(true);
    setError(null);
    try {
      const data = await fetchJson<{ divisions: DivisionSummary[] }>(
        `/api/leagues/${league.id}/divisions`,
      );
      setDivisions(data.divisions);
      persist({
        ...(prefs ?? {
          playerId: null,
          playerName: null,
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
        playerId: null,
        playerName: null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load divisions");
    } finally {
      setLoadingDivisions(false);
    }
  };

  const chooseDivision = (division: DivisionSummary) => {
    setSelectedDivision(division);
    setTab("teams");
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
      playerId: null,
      playerName: null,
      teamId: null,
      teamName: null,
    };
    persist({
      ...base,
      leagueId: division.leagueId,
      leagueName: division.leagueName,
      divisionId: division.id,
      divisionName: division.name,
    });
  };

  const setMyTeam = (team: DivisionTeam) => {
    if (!prefs || !selectedDivision) return;
    setSelectedTeamName(team.name);
    persist({
      ...prefs,
      divisionId: selectedDivision.id,
      divisionName: selectedDivision.name,
      teamId: team.id,
      teamName: team.name,
    });
  };

  const leagueOptions: TypeaheadOption<LeagueSummary>[] = useMemo(
    () =>
      leagues.map((league) => ({
        id: league.id,
        label: league.name,
        meta: `${league.state} · ${league.divisionCount} divisions`,
        value: league,
      })),
    [leagues],
  );

  const divisionOptions: TypeaheadOption<DivisionSummary>[] = useMemo(
    () =>
      divisions.map((division) => ({
        id: division.id,
        label: division.name,
        meta: `${division.year} · ${division.leagueName}`,
        value: division,
      })),
    [divisions],
  );

  const teamOptions: TypeaheadOption<DivisionTeam>[] = useMemo(
    () =>
      divisionTeams.map((team) => ({
        id: team.id,
        label: team.name,
        meta: `${team.players.length} players`,
        value: team,
      })),
    [divisionTeams],
  );

  const activeTeam =
    divisionTeams.find(
      (team) =>
        team.id === prefs?.teamId ||
        normalizeTeamName(team.name) ===
          normalizeTeamName(selectedTeamName ?? ""),
    ) ?? null;

  const detailTeam =
    divisionTeams.find(
      (team) =>
        normalizeTeamName(team.name) ===
        normalizeTeamName(selectedTeamName ?? ""),
    ) ?? null;

  const filteredTeamRows = useMemo(() => {
    if (!teamReport) return [];
    return filterRows(teamReport.rows, filterQuery);
  }, [teamReport, filterQuery]);

  const filteredPlayerRows = useMemo(() => {
    if (!playerReport) return [];
    return filterRows(playerReport.rows, filterQuery);
  }, [playerReport, filterQuery]);

  const filteredRatingRows = useMemo(() => {
    if (!playerList) return [];
    return filterRows(playerList.rows, filterQuery);
  }, [playerList, filterQuery]);

  const statsStrip = useMemo(() => {
    if (!teamReport) return [];
    return [
      { label: "Teams", value: String(teamReport.rows.length) },
      {
        label: "Players",
        value: playerList ? String(playerList.rows.length) : "—",
      },
      {
        label: "My team",
        value: prefs?.teamName ?? "Not set",
      },
      {
        label: "Division",
        value: selectedDivision?.year ?? "—",
      },
    ];
  }, [teamReport, playerList, prefs?.teamName, selectedDivision?.year]);

  if (!prefs || booting) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-6xl items-center justify-center px-5">
        <LoadingState label="Connecting to FargoRate LMS…" />
      </main>
    );
  }

  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-7xl px-4 pb-[calc(1.5rem+var(--safe-bottom))] pt-5 md:px-6 lg:px-8">
      <header className="animate-rise mb-5 md:mb-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--amber)]">
              Pool league companion
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-4xl leading-none tracking-tight text-[var(--felt-deep)] md:text-5xl">
              Tableside
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--muted)] md:text-base">
              Standings, ratings, schedules, and handicaps — built for phone and
              desktop.
            </p>
          </div>
          {selectedDivision ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[420px]">
              {statsStrip.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]/80 px-3 py-2.5"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {stat.label}
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-[var(--ink)]">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="mb-4 rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      <section className="animate-rise animate-delay-1 relative z-40 mb-5 rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)]/90 p-4 shadow-sm md:p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <Typeahead
            label="League"
            placeholder={loadingLeagues ? "Searching leagues…" : "Search leagues"}
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
            onQueryChange={setLeagueQuery}
            onChange={(option) => {
              if (option) void chooseLeague(option.value);
            }}
          />
          <Typeahead
            label="Division"
            placeholder={
              !selectedLeague
                ? "Pick a league first"
                : loadingDivisions
                  ? "Loading divisions…"
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
                  : "Set your team for schedule & handicap"
            }
            value={
              activeTeam
                ? {
                    id: activeTeam.id,
                    label: activeTeam.name,
                    meta: `${activeTeam.players.length} players`,
                    value: activeTeam,
                  }
                : null
            }
            options={teamOptions}
            disabled={!selectedDivision || loadingContext}
            onChange={(option) => {
              if (option) {
                setMyTeam(option.value);
                setSelectedTeamName(option.value.name);
              }
            }}
            emptyText="No teams loaded yet"
          />
        </div>
      </section>

      {!selectedDivision ? (
        <EmptyState
          title="Choose a division to continue"
          body="Use the typeaheads above — start typing your division name for a fast jump."
        />
      ) : (
        <section className="animate-rise animate-delay-2 space-y-4">
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

          <div className="sticky top-0 z-20 -mx-1 flex flex-col gap-3 bg-[color-mix(in_srgb,var(--paper)_90%,transparent)] px-1 py-2 backdrop-blur md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-max gap-2 overflow-x-auto pb-1 md:pb-0">
              {REPORT_TABS.map((item) => {
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setTab(item.id);
                    }}
                    className={[
                      "rounded-full px-3.5 py-2 text-sm font-medium transition",
                      active
                        ? "bg-[var(--felt)] text-white shadow-sm"
                        : "bg-[var(--surface)]/80 text-[var(--muted)] hover:bg-[var(--surface-2)]",
                    ].join(" ")}
                  >
                    <span>{item.label}</span>
                    <span
                      className={[
                        "ml-2 hidden text-[10px] uppercase tracking-[0.12em] sm:inline",
                        active ? "text-white/70" : "text-[var(--muted)]",
                      ].join(" ")}
                    >
                      {item.hint}
                    </span>
                  </button>
                );
              })}
            </div>

            {tab === "teams" || tab === "players" || tab === "player-list" ? (
              <SearchField
                value={filterQuery}
                onChange={setFilterQuery}
                placeholder={
                  tab === "teams"
                    ? "Filter teams…"
                    : tab === "players"
                      ? "Filter players…"
                      : "Filter ratings…"
                }
              />
            ) : null}

            {tab === "schedule" ? (
              <div className="w-full max-w-md">
                <Typeahead
                  label="Schedule team"
                  placeholder="Filter schedule by team"
                  value={
                    activeTeam
                      ? {
                          id: activeTeam.id,
                          label: activeTeam.name,
                          meta: "Selected",
                          value: activeTeam,
                        }
                      : null
                  }
                  options={teamOptions}
                  onChange={(option) => {
                    if (option) {
                      setMyTeam(option.value);
                      setSelectedTeamName(option.value.name);
                    }
                  }}
                />
              </div>
            ) : null}
          </div>

          <div className="animate-panel min-w-0 space-y-6">
            {tab === "handicap" ? (
              <HandicapCalculator
                divisionId={selectedDivision.id}
                divisionName={selectedDivision.name}
                prefs={prefs}
                onSelectTeam={({ teamId, teamName }) => {
                  persist({
                    ...prefs,
                    teamId,
                    teamName,
                    divisionId: selectedDivision.id,
                    divisionName: selectedDivision.name,
                  });
                  setSelectedTeamName(teamName);
                }}
              />
            ) : loadingReport ? (
              <LoadingState label="Pulling report from LMS…" />
            ) : tab === "teams" && teamReport ? (
              <>
                <section className="space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
                      My team
                    </p>
                    <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--felt-deep)]">
                      {prefs.teamName ?? "Not set"}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Your followed team for schedule and handicap — separate from
                      the division standings below.
                    </p>
                  </div>
                  {prefs.teamName ? (
                    <TeamDetail
                      teamName={prefs.teamName}
                      team={
                        divisionTeams.find(
                          (team) =>
                            normalizeTeamName(team.name) ===
                            normalizeTeamName(prefs.teamName ?? ""),
                        ) ?? null
                      }
                      playersByTeam={playersByTeam}
                      isMyTeam
                      onSetAsMyTeam={
                        divisionTeams.find(
                          (team) =>
                            normalizeTeamName(team.name) ===
                            normalizeTeamName(prefs.teamName ?? ""),
                        )
                          ? () => {
                              const mine = divisionTeams.find(
                                (team) =>
                                  normalizeTeamName(team.name) ===
                                  normalizeTeamName(prefs.teamName ?? ""),
                              );
                              if (mine) setMyTeam(mine);
                            }
                          : undefined
                      }
                    />
                  ) : (
                    <EmptyState
                      title="Set your team"
                      body="Use the “My team” typeahead above, or pick a row in standings and set it as your team."
                    />
                  )}
                </section>

                <section className="space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
                      Division
                    </p>
                    <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--felt-deep)]">
                      Team standings
                    </h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Click a team row to open that team’s stats below.
                    </p>
                  </div>
                  <DataTable
                    headers={teamReport.headers}
                    rows={filteredTeamRows}
                    isRowSelected={(row) =>
                      Boolean(
                        selectedTeamName &&
                          normalizeTeamName(
                            row[teamNameIndex(teamReport.headers)] ?? "",
                          ) === normalizeTeamName(selectedTeamName),
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

                {selectedTeamName &&
                normalizeTeamName(selectedTeamName) !==
                  normalizeTeamName(prefs.teamName ?? "") ? (
                  <section className="space-y-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
                        Selected team
                      </p>
                      <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--felt-deep)]">
                        {selectedTeamName}
                      </h3>
                    </div>
                    <TeamDetail
                      teamName={selectedTeamName}
                      team={detailTeam}
                      playersByTeam={playersByTeam}
                      isMyTeam={false}
                      onClose={() => {
                        setSelectedTeamName(null);
                      }}
                      onSetAsMyTeam={
                        detailTeam ? () => setMyTeam(detailTeam) : undefined
                      }
                    />
                  </section>
                ) : null}
              </>
            ) : tab === "players" && playerReport ? (
              <DataTable
                headers={playerReport.headers}
                rows={filteredPlayerRows}
                emptyText="No players match your filter."
              />
            ) : tab === "player-list" && playerList ? (
              <DataTable
                headers={playerList.headers}
                rows={filteredRatingRows}
                emptyText="No ratings match your filter."
              />
            ) : tab === "schedule" && schedule ? (
              prefs.teamName || selectedTeamName ? (
                <ScheduleList
                  days={schedule}
                  teamName={prefs.teamName ?? selectedTeamName}
                />
              ) : (
                <EmptyState
                  title="Select a team for schedule"
                  body="Use “My team” or the schedule team typeahead to see only that team’s matches."
                />
              )
            ) : (
              <EmptyState title="Nothing to show yet" />
            )}
          </div>
        </section>
      )}
    </main>
  );
}
