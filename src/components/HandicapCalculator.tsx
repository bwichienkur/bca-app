"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_PLAYERS_PER_TEAM } from "@/lib/constants";
import {
  buildDefaultFivePlayerFormat,
  calculateRoundBasedHandicaps,
  type ParsedMatchFormat,
  type RoundHandicapResult,
} from "@/lib/handicap";
import { findWeeklyMatchupForTeam } from "@/lib/matchups";
import {
  deleteLineupPreset,
  loadLineupPresets,
  upsertLineupPreset,
} from "@/lib/preferences";
import type {
  CalculatorMatchup,
  DivisionTeam,
  LineupPreset,
  RosterPlayer,
  UserPreferences,
} from "@/lib/types";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { Typeahead, type TypeaheadOption } from "./Typeahead";

type CalculatorPayload = {
  format: {
    pointSystem: string;
    fargoRateHandicapType: string;
    handicapCap: number;
    handicapPercent: number;
    template: string;
  };
  parsedFormat: ParsedMatchFormat;
  playersPerTeam: number;
  teams: DivisionTeam[];
  matchups: CalculatorMatchup[];
  players: RosterPlayer[];
};

type HandicapCalculatorProps = {
  divisionId: string;
  divisionName: string;
  prefs: UserPreferences;
  onSelectTeam: (team: { teamId: string; teamName: string }) => void;
};

function playerLabel(player: RosterPlayer): string {
  return `${player.firstName} ${player.lastName}`.trim();
}

function defaultTopLineup(
  team: DivisionTeam | null,
  slots: number,
): RosterPlayer[] {
  if (!team) return [];
  return [...team.players]
    .sort((a, b) => b.fargoRating - a.fargoRating)
    .slice(0, slots);
}

function lineupFromIds(
  team: DivisionTeam | null,
  ids: string[],
  slots: number,
): RosterPlayer[] {
  if (!team) return [];
  const map = new Map(team.players.map((player) => [player.id, player]));
  return ids
    .map((id) => map.get(id))
    .filter((player): player is RosterPlayer => Boolean(player))
    .slice(0, slots);
}

export function HandicapCalculator({
  divisionId,
  divisionName,
  prefs,
  onSelectTeam,
}: HandicapCalculatorProps) {
  const [data, setData] = useState<CalculatorPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(prefs.teamId);
  const [opponentTeamId, setOpponentTeamId] = useState<string | null>(null);
  const [iAmHome, setIAmHome] = useState(true);
  const [myLineup, setMyLineup] = useState<RosterPlayer[]>([]);
  const [oppLineup, setOppLineup] = useState<RosterPlayer[]>([]);
  const [weekMatchup, setWeekMatchup] = useState<CalculatorMatchup | null>(null);
  const [presets, setPresets] = useState<LineupPreset[]>([]);
  const [presetName, setPresetName] = useState("Default lineup");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    setPresets(loadLineupPresets());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/divisions/${divisionId}/calculator`);
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(payload?.error || "Failed to load calculator");
        }
        const payload = (await response.json()) as CalculatorPayload;
        if (cancelled) return;
        setData(payload);

        const teamId =
          prefs.teamId &&
          payload.teams.some((team) => team.id === prefs.teamId)
            ? prefs.teamId
            : null;
        setMyTeamId(teamId);

        if (teamId) {
          applyTeamMatchup(payload, teamId);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionId, prefs.teamId]);

  const slots =
    data?.playersPerTeam ||
    data?.parsedFormat.numOfPlayers ||
    DEFAULT_PLAYERS_PER_TEAM;

  const myTeam = data?.teams.find((team) => team.id === myTeamId) ?? null;
  const oppTeam =
    data?.teams.find((team) => team.id === opponentTeamId) ?? null;

  const teamOptions: TypeaheadOption<DivisionTeam>[] = useMemo(
    () =>
      (data?.teams ?? []).map((team) => ({
        id: team.id,
        label: team.name,
        meta: `${team.players.length} players`,
        value: team,
      })),
    [data],
  );

  const homeTeam = iAmHome ? myTeam : oppTeam;
  const awayTeam = iAmHome ? oppTeam : myTeam;
  const homeLineup = iAmHome ? myLineup : oppLineup;
  const awayLineup = iAmHome ? oppLineup : myLineup;

  const results: RoundHandicapResult[] | null = useMemo(() => {
    if (!data || !homeTeam || !awayTeam) return null;
    if (homeLineup.length !== slots || awayLineup.length !== slots) return null;

    const format =
      data.parsedFormat.rounds.length > 0
        ? data.parsedFormat
        : buildDefaultFivePlayerFormat(slots);

    return calculateRoundBasedHandicaps({
      format,
      teamOneRatings: homeLineup.map((player) => player.fargoRating),
      teamTwoRatings: awayLineup.map((player) => player.fargoRating),
      pointSystem: data.format.pointSystem || "10",
      handicapPercent: data.format.handicapPercent ?? 1,
      handicapCap: data.format.handicapCap ?? 50,
    });
  }, [data, homeTeam, awayTeam, homeLineup, awayLineup, slots]);

  function applyTeamMatchup(payload: CalculatorPayload, teamId: string) {
    const team = payload.teams.find((item) => item.id === teamId) ?? null;
    const matchup = findWeeklyMatchupForTeam(payload.matchups, teamId);
    setWeekMatchup(matchup);
    const slotCount =
      payload.playersPerTeam ||
      payload.parsedFormat.numOfPlayers ||
      DEFAULT_PLAYERS_PER_TEAM;

    const saved = loadLineupPresets().find(
      (preset) =>
        preset.divisionId === divisionId &&
        preset.teamId === teamId &&
        preset.playerIds.length === slotCount,
    );

    if (matchup) {
      const home = matchup.homeTeamId === teamId;
      setIAmHome(home);
      const opponentId = home ? matchup.awayTeamId : matchup.homeTeamId;
      setOpponentTeamId(opponentId);
      const opponent =
        payload.teams.find((item) => item.id === opponentId) ?? null;
      setMyLineup(
        saved
          ? lineupFromIds(team, saved.playerIds, slotCount)
          : defaultTopLineup(team, slotCount),
      );
      setOppLineup(defaultTopLineup(opponent, slotCount));
    } else {
      setOpponentTeamId(null);
      setOppLineup([]);
      setMyLineup(
        saved
          ? lineupFromIds(team, saved.playerIds, slotCount)
          : defaultTopLineup(team, slotCount),
      );
    }
  }

  const chooseMyTeam = (team: DivisionTeam) => {
    setMyTeamId(team.id);
    onSelectTeam({ teamId: team.id, teamName: team.name });
    if (data) applyTeamMatchup(data, team.id);
  };

  const chooseOpponent = (team: DivisionTeam) => {
    setOpponentTeamId(team.id);
    setWeekMatchup(null);
    setOppLineup(defaultTopLineup(team, slots));
  };

  const togglePlayer = (
    side: "mine" | "opp",
    player: RosterPlayer,
  ) => {
    const current = side === "mine" ? myLineup : oppLineup;
    const setter = side === "mine" ? setMyLineup : setOppLineup;
    const exists = current.some((item) => item.id === player.id);
    if (exists) {
      setter(current.filter((item) => item.id !== player.id));
      return;
    }
    if (current.length >= slots) return;
    setter([...current, player]);
  };

  const moveInLineup = (
    side: "mine" | "opp",
    from: number,
    to: number,
  ) => {
    const current = side === "mine" ? [...myLineup] : [...oppLineup];
    const setter = side === "mine" ? setMyLineup : setOppLineup;
    if (from < 0 || to < 0 || from >= current.length || to >= current.length) {
      return;
    }
    const [item] = current.splice(from, 1);
    current.splice(to, 0, item);
    setter(current);
  };

  const savePreset = () => {
    if (!myTeamId || myLineup.length !== slots) return;
    const preset: LineupPreset = {
      id: `${myTeamId}-${Date.now()}`,
      name: presetName.trim() || "Lineup",
      divisionId,
      teamId: myTeamId,
      playerIds: myLineup.map((player) => player.id),
      updatedAt: new Date().toISOString(),
    };
    setPresets(upsertLineupPreset(preset));
  };

  const applyPreset = (preset: LineupPreset) => {
    if (!myTeam) return;
    setMyLineup(lineupFromIds(myTeam, preset.playerIds, slots));
    setPresetName(preset.name);
  };

  const teamPresets = presets.filter(
    (preset) =>
      preset.divisionId === divisionId && preset.teamId === myTeamId,
  );

  if (loading) {
    return <LoadingState label="Loading teams, ratings, and format…" />;
  }

  if (error || !data) {
    return (
      <EmptyState
        title="Couldn't load calculator"
        body={error ?? "Try again in a moment."}
      />
    );
  }

  return (
    <div className="animate-panel space-y-5">
      <section className="rounded-[1.4rem] border border-[var(--line)] bg-white/85 px-4 py-4 shadow-sm md:px-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
              This week’s handicap
            </p>
            <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--felt-deep)] md:text-3xl">
              {divisionName}
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {data.format.pointSystem || "10"}-point · {slots} players/side ·{" "}
              {data.format.fargoRateHandicapType || "RoundBased"}
            </p>
          </div>
          {weekMatchup ? (
            <div className="rounded-2xl bg-[var(--felt)] px-4 py-3 text-white md:min-w-[280px]">
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/70">
                Auto-matched · {weekMatchup.date}
              </p>
              <p className="mt-1 font-semibold">
                {weekMatchup.homeTeamName} vs {weekMatchup.awayTeamName}
              </p>
              {weekMatchup.location ? (
                <p className="mt-1 text-xs text-white/75">{weekMatchup.location}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Typeahead
          label="My team"
          placeholder="Select your team"
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
          onChange={(option) => {
            if (option) chooseMyTeam(option.value);
          }}
        />
        <Typeahead
          label="Opponent"
          placeholder="Select opponent"
          value={
            oppTeam
              ? {
                  id: oppTeam.id,
                  label: oppTeam.name,
                  meta: `${oppTeam.players.length} players`,
                  value: oppTeam,
                }
              : null
          }
          options={teamOptions.filter((option) => option.id !== myTeamId)}
          onChange={(option) => {
            if (option) chooseOpponent(option.value);
          }}
          disabled={!myTeam}
        />
      </section>

      {myTeam && oppTeam ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIAmHome(true)}
            className={[
              "rounded-full px-3 py-1.5 text-xs font-semibold",
              iAmHome
                ? "bg-[var(--felt)] text-white"
                : "border border-[var(--line)] bg-white text-[var(--muted)]",
            ].join(" ")}
          >
            We’re home (Team One)
          </button>
          <button
            type="button"
            onClick={() => setIAmHome(false)}
            className={[
              "rounded-full px-3 py-1.5 text-xs font-semibold",
              !iAmHome
                ? "bg-[var(--felt)] text-white"
                : "border border-[var(--line)] bg-white text-[var(--muted)]",
            ].join(" ")}
          >
            We’re away (Team Two)
          </button>
        </div>
      ) : null}

      {!myTeam ? (
        <EmptyState
          title="Select your team"
          body="Handicap starts from your team. We’ll auto-fill this week’s opponent from the schedule."
        />
      ) : (
        <section className="grid gap-4 xl:grid-cols-[1.1fr_1.1fr_0.9fr]">
          <LineupPicker
            title={myTeam.name}
            subtitle={`Pick ${slots} · order = H/A slots`}
            roster={myTeam.players}
            lineup={myLineup}
            slots={slots}
            onToggle={(player) => togglePlayer("mine", player)}
            onMove={(from, to) => moveInLineup("mine", from, to)}
            dragIndex={dragIndex}
            setDragIndex={setDragIndex}
          />
          {oppTeam ? (
            <LineupPicker
              title={oppTeam.name}
              subtitle={`Pick ${slots} opponents`}
              roster={oppTeam.players}
              lineup={oppLineup}
              slots={slots}
              onToggle={(player) => togglePlayer("opp", player)}
              onMove={(from, to) => moveInLineup("opp", from, to)}
              dragIndex={dragIndex}
              setDragIndex={setDragIndex}
            />
          ) : (
            <EmptyState
              title="Select an opponent"
              body="Or wait for schedule auto-match once your team is set."
            />
          )}

          <div className="space-y-3 rounded-[1.3rem] border border-[var(--line)] bg-white/85 p-4 shadow-sm">
            <h4 className="font-[family-name:var(--font-display)] text-lg text-[var(--felt-deep)]">
              Saved lineups
            </h4>
            <p className="text-sm text-[var(--muted)]">
              Preset your {slots} for quick handicap checks before league night.
            </p>
            <input
              value={presetName}
              onChange={(event) => setPresetName(event.target.value)}
              placeholder="Preset name"
              className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--felt-soft)]"
            />
            <button
              type="button"
              disabled={myLineup.length !== slots}
              onClick={savePreset}
              className="w-full rounded-full bg-[var(--felt)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Save current lineup
            </button>
            <ul className="space-y-2">
              {teamPresets.length === 0 ? (
                <li className="text-sm text-[var(--muted)]">No presets yet.</li>
              ) : (
                teamPresets.map((preset) => (
                  <li
                    key={preset.id}
                    className="rounded-xl border border-[var(--line)] px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => applyPreset(preset)}
                        className="text-left text-sm font-medium text-[var(--ink)]"
                      >
                        {preset.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPresets(deleteLineupPreset(preset.id))}
                        className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--chalk)]"
                      >
                        Delete
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      {preset.playerIds.length} players ·{" "}
                      {new Date(preset.updatedAt).toLocaleDateString()}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h4 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
          Handicap by round
        </h4>
        {!results ? (
          <EmptyState
            title="Finish both lineups"
            body={`Select exactly ${slots} players for each team. Drag to reorder slots.`}
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {results.map((result) => {
              const points = Math.max(result.teamOne, result.teamTwo);
              const gets =
                result.teamOne > 0
                  ? homeTeam?.name
                  : result.teamTwo > 0
                    ? awayTeam?.name
                    : "Even";
              return (
                <article
                  key={result.round}
                  className="rounded-2xl border border-[var(--line)] bg-white/90 px-4 py-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--amber)]">
                        Round {result.round}
                      </p>
                      <p className="mt-1 font-medium text-[var(--ink)]">
                        {points === 0
                          ? "No handicap"
                          : `${gets} +${points}`}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Exp {result.teamOneExpected.toFixed(1)}–{result.teamTwoExpected.toFixed(1)}
                      </p>
                    </div>
                    <div className="rounded-full bg-[var(--felt)] px-3 py-1 text-sm font-semibold text-white">
                      {points}
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1 border-t border-[var(--line)] pt-3">
                    {result.matchups.map((matchup, index) => {
                      const home = homeLineup[matchup.homeIndexes[0] - 1];
                      const away = awayLineup[matchup.awayIndexes[0] - 1];
                      return (
                        <li
                          key={`${result.round}-${index}`}
                          className="flex justify-between gap-2 text-sm"
                        >
                          <span>
                            {home ? playerLabel(home) : `H${matchup.homeIndexes[0]}`}{" "}
                            <span className="text-[var(--muted)]">vs</span>{" "}
                            {away ? playerLabel(away) : `A${matchup.awayIndexes[0]}`}
                          </span>
                          <span className="tabular-nums text-xs text-[var(--muted)]">
                            {Math.round(matchup.homeRating)}–{Math.round(matchup.awayRating)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function LineupPicker({
  title,
  subtitle,
  roster,
  lineup,
  slots,
  onToggle,
  onMove,
  dragIndex,
  setDragIndex,
}: {
  title: string;
  subtitle: string;
  roster: RosterPlayer[];
  lineup: RosterPlayer[];
  slots: number;
  onToggle: (player: RosterPlayer) => void;
  onMove: (from: number, to: number) => void;
  dragIndex: number | null;
  setDragIndex: (index: number | null) => void;
}) {
  const selectedIds = new Set(lineup.map((player) => player.id));

  return (
    <div className="rounded-[1.3rem] border border-[var(--line)] bg-white/85 p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <h4 className="font-[family-name:var(--font-display)] text-lg text-[var(--felt-deep)]">
            {title}
          </h4>
          <p className="text-xs text-[var(--muted)]">{subtitle}</p>
        </div>
        <span
          className={[
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            lineup.length === slots
              ? "bg-[var(--felt)] text-white"
              : "bg-[var(--paper-2)] text-[var(--muted)]",
          ].join(" ")}
        >
          {lineup.length}/{slots}
        </span>
      </div>

      <ol className="mb-3 space-y-1.5">
        {Array.from({ length: slots }).map((_, index) => {
          const player = lineup[index];
          return (
            <li
              key={index}
              draggable={Boolean(player)}
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null) onMove(dragIndex, index);
                setDragIndex(null);
              }}
              className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--line)] bg-[var(--paper)]/70 px-3 py-2 text-sm"
            >
              <span className="w-8 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                #{index + 1}
              </span>
              <span className="flex-1 font-medium text-[var(--ink)]">
                {player ? playerLabel(player) : "Open slot"}
              </span>
              {player ? (
                <span className="tabular-nums text-[var(--felt)]">
                  {player.fargoRating}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {roster.map((player) => {
          const selected = selectedIds.has(player.id);
          const full = !selected && lineup.length >= slots;
          return (
            <li key={player.id}>
              <button
                type="button"
                disabled={full}
                onClick={() => onToggle(player)}
                className={[
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition",
                  selected
                    ? "bg-[color-mix(in_srgb,var(--felt)_12%,white)] font-medium text-[var(--felt-deep)]"
                    : "hover:bg-[var(--paper)]",
                  full ? "opacity-40" : "",
                ].join(" ")}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={[
                      "inline-flex h-4 w-4 items-center justify-center rounded border text-[10px]",
                      selected
                        ? "border-[var(--felt)] bg-[var(--felt)] text-white"
                        : "border-[var(--line)]",
                    ].join(" ")}
                  >
                    {selected ? "✓" : ""}
                  </span>
                  {playerLabel(player)}
                </span>
                <span className="tabular-nums text-[var(--muted)]">
                  {player.fargoRating}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
