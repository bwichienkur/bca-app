"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { REPORT_TABS } from "@/lib/constants";
import { loadPreferences, savePreferences } from "@/lib/preferences";
import type {
  DivisionSummary,
  LeagueSummary,
  PlayersByTeamReport,
  ReportTab,
  ScheduleDay,
  TableReport,
  UserPreferences,
} from "@/lib/types";
import { DataTable } from "./DataTable";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { PlayersByTeam } from "./PlayersByTeam";
import { ScheduleList } from "./ScheduleList";

type Screen = "league" | "division" | "reports";

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

export function LeagueApp() {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [screen, setScreen] = useState<Screen>("league");
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
  const [teamReport, setTeamReport] = useState<TableReport | null>(null);
  const [playerReport, setPlayerReport] = useState<TableReport | null>(null);
  const [playersByTeam, setPlayersByTeam] =
    useState<PlayersByTeamReport | null>(null);
  const [playerList, setPlayerList] = useState<TableReport | null>(null);
  const [schedule, setSchedule] = useState<ScheduleDay[] | null>(null);
  const [, startTransition] = useTransition();

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

        if (!league) {
          setScreen("league");
          return;
        }

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
          setScreen("reports");
        } else {
          setSelectedDivision(null);
          setScreen("division");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to start app");
          setScreen("league");
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
    if (screen !== "league" || booting) return;

    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      setLoadingLeagues(true);
      setError(null);
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
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [leagueQuery, screen, booting]);

  useEffect(() => {
    if (!selectedDivision) return;

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
        } else if (tab === "players-by-team") {
          const data = await fetchJson<PlayersByTeamReport>(
            `/api/reports/players-by-team?divisionId=${id}`,
          );
          if (!cancelled) setPlayersByTeam(data);
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

  const persist = (next: UserPreferences) => {
    setPrefs(next);
    savePreferences(next);
  };

  const chooseLeague = async (league: LeagueSummary) => {
    setSelectedLeague(league);
    setSelectedDivision(null);
    setLoadingDivisions(true);
    setError(null);
    try {
      const data = await fetchJson<{ divisions: DivisionSummary[] }>(
        `/api/leagues/${league.id}/divisions`,
      );
      setDivisions(data.divisions);
      persist({
        leagueId: league.id,
        leagueName: league.name,
        divisionId: null,
        divisionName: null,
      });
      startTransition(() => setScreen("division"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load divisions");
    } finally {
      setLoadingDivisions(false);
    }
  };

  const chooseDivision = (division: DivisionSummary, asDefault: boolean) => {
    setSelectedDivision(division);
    setTab("teams");
    setTeamReport(null);
    setPlayerReport(null);
    setPlayersByTeam(null);
    setPlayerList(null);
    setSchedule(null);

    if (asDefault || prefs?.divisionId === division.id) {
      persist({
        leagueId: division.leagueId,
        leagueName: division.leagueName,
        divisionId: division.id,
        divisionName: division.name,
      });
    } else if (prefs) {
      persist({
        ...prefs,
        leagueId: division.leagueId,
        leagueName: division.leagueName,
      });
    }

    startTransition(() => setScreen("reports"));
  };

  const setDivisionDefault = () => {
    if (!selectedDivision) return;
    persist({
      leagueId: selectedDivision.leagueId,
      leagueName: selectedDivision.leagueName,
      divisionId: selectedDivision.id,
      divisionName: selectedDivision.name,
    });
  };

  const isDefaultDivision =
    !!selectedDivision && prefs?.divisionId === selectedDivision.id;

  const yearGroups = useMemo(() => {
    const map = new Map<string, DivisionSummary[]>();
    for (const division of divisions) {
      const list = map.get(division.year) ?? [];
      list.push(division);
      map.set(division.year, list);
    }
    return Array.from(map.entries());
  }, [divisions]);

  if (!prefs || booting) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg items-center justify-center px-5">
        <LoadingState label="Connecting to FargoRate LMS…" />
      </main>
    );
  }

  return (
    <main className="relative mx-auto min-h-dvh max-w-lg px-4 pb-[calc(1.5rem+var(--safe-bottom))] pt-5">
      <header className="animate-rise mb-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--amber)]">
              Pool league companion
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-4xl leading-none tracking-tight text-[var(--felt-deep)]">
              Tableside
            </h1>
          </div>
          {screen === "reports" ? (
            <button
              type="button"
              onClick={() => setScreen("division")}
              className="rounded-full border border-[var(--line)] bg-white/70 px-3 py-1.5 text-xs font-medium text-[var(--felt)]"
            >
              Change
            </button>
          ) : null}
        </div>
        <p className="mt-3 max-w-[22rem] text-sm leading-relaxed text-[var(--muted)]">
          Live standings, players, and schedules from FargoRate LMS — starting
          with Palm Beach County BCA.
        </p>
      </header>

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {screen === "league" ? (
        <section className="animate-rise animate-delay-1 space-y-4">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
              Choose your league
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Defaults to Palm Beach County BCA Pool League.
            </p>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Search leagues
            </span>
            <input
              value={leagueQuery}
              onChange={(event) => setLeagueQuery(event.target.value)}
              placeholder="Search by name or state"
              className="w-full rounded-2xl border border-[var(--line)] bg-white/85 px-4 py-3 outline-none ring-[var(--felt-soft)] transition focus:ring-2"
            />
          </label>

          {loadingLeagues ? (
            <LoadingState label="Looking up leagues…" />
          ) : leagues.length === 0 ? (
            <EmptyState
              title="No leagues found"
              body="Try a broader search, like your city or BCA."
            />
          ) : (
            <ul className="space-y-2">
              {leagues.map((league) => {
                const isDefault = league.id === prefs.leagueId;
                return (
                  <li key={league.id}>
                    <button
                      type="button"
                      onClick={() => void chooseLeague(league)}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 text-left shadow-sm transition hover:border-[var(--felt-soft)] hover:bg-white"
                    >
                      <div>
                        <p className="font-medium text-[var(--ink)]">
                          {league.name}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                          {league.state} · {league.divisionCount} divisions
                        </p>
                      </div>
                      {isDefault ? (
                        <span className="rounded-full bg-[var(--felt)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                          Default
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {screen === "division" ? (
        <section className="animate-rise animate-delay-1 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <button
                type="button"
                onClick={() => setScreen("league")}
                className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--chalk)]"
              >
                ← Leagues
              </button>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
                Select a division
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {selectedLeague?.name ?? prefs.leagueName}
              </p>
            </div>
          </div>

          {loadingDivisions ? (
            <LoadingState label="Loading divisions…" />
          ) : divisions.length === 0 ? (
            <EmptyState title="No divisions available" />
          ) : (
            <div className="space-y-5">
              {yearGroups.map(([year, items]) => (
                <div key={year}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
                    {year}
                  </h3>
                  <ul className="space-y-2">
                    {items.map((division) => {
                      const isDefault = prefs.divisionId === division.id;
                      return (
                        <li
                          key={division.id}
                          className="rounded-2xl border border-[var(--line)] bg-white/80 p-3 shadow-sm"
                        >
                          <button
                            type="button"
                            onClick={() => chooseDivision(division, false)}
                            className="w-full text-left"
                          >
                            <p className="font-medium text-[var(--ink)]">
                              {division.name}
                            </p>
                          </button>
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => chooseDivision(division, false)}
                              className="rounded-full bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white"
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              onClick={() => chooseDivision(division, true)}
                              className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--felt-deep)]"
                            >
                              {isDefault ? "Default · Open" : "Set default & open"}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {screen === "reports" && selectedDivision ? (
        <section className="animate-rise animate-delay-1 space-y-4">
          <div className="rounded-[1.4rem] border border-[var(--line)] bg-[linear-gradient(135deg,rgba(20,92,69,0.95),rgba(13,61,46,0.98))] px-4 py-4 text-white shadow-[var(--shadow)]">
            <p className="text-xs uppercase tracking-[0.16em] text-white/70">
              {selectedDivision.leagueName}
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl leading-tight">
              {selectedDivision.name}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={setDivisionDefault}
                className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur transition hover:bg-white/25"
              >
                {isDefaultDivision ? "Default division ✓" : "Set as my division"}
              </button>
              <button
                type="button"
                onClick={() => setScreen("league")}
                className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90"
              >
                Switch league
              </button>
            </div>
          </div>

          <div className="sticky top-0 z-20 -mx-1 overflow-x-auto bg-[color-mix(in_srgb,var(--paper)_88%,transparent)] px-1 py-2 backdrop-blur">
            <div className="flex min-w-max gap-2">
              {REPORT_TABS.map((item) => {
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={[
                      "rounded-full px-3.5 py-2 text-sm font-medium transition",
                      active
                        ? "bg-[var(--felt)] text-white shadow-sm"
                        : "bg-white/70 text-[var(--muted)] hover:bg-white",
                    ].join(" ")}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="animate-panel">
            {loadingReport ? (
              <LoadingState label="Pulling report from LMS…" />
            ) : tab === "teams" && teamReport ? (
              <DataTable
                headers={teamReport.headers}
                rows={teamReport.rows}
              />
            ) : tab === "players" && playerReport ? (
              <DataTable
                headers={playerReport.headers}
                rows={playerReport.rows}
              />
            ) : tab === "players-by-team" && playersByTeam ? (
              <PlayersByTeam report={playersByTeam} />
            ) : tab === "player-list" && playerList ? (
              <DataTable
                headers={playerList.headers}
                rows={playerList.rows}
              />
            ) : tab === "schedule" && schedule ? (
              <ScheduleList days={schedule} />
            ) : (
              <EmptyState title="Nothing to show yet" />
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}
