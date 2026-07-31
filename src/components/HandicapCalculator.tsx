"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PLAYERS_PER_TEAM,
} from "@/lib/constants";
import {
  buildDefaultFivePlayerFormat,
  calculateRoundBasedHandicaps,
  type ParsedMatchFormat,
  type RoundHandicapResult,
} from "@/lib/handicap";
import type {
  CalculatorMatchup,
  DivisionTeam,
  RosterPlayer,
  UserPreferences,
} from "@/lib/types";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";

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
  onSaveIdentity: (identity: {
    playerId: string;
    playerName: string;
    teamId: string;
    teamName: string;
  }) => void;
};

function playerLabel(player: RosterPlayer): string {
  return `${player.firstName} ${player.lastName}`.trim();
}

function findWeeklyMatchup(
  matchups: CalculatorMatchup[],
  teamId: string,
): CalculatorMatchup | null {
  if (!matchups.length) return null;
  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();

  const mine = matchups.filter(
    (match) => match.homeTeamId === teamId || match.awayTeamId === teamId,
  );
  if (!mine.length) return null;

  const withTime = mine.map((match) => ({
    match,
    time: new Date(match.date).getTime(),
  }));

  const upcoming = withTime
    .filter((item) => !Number.isNaN(item.time) && item.time >= todayStart)
    .sort((a, b) => a.time - b.time);
  if (upcoming[0]) return upcoming[0].match;

  const past = withTime
    .filter((item) => !Number.isNaN(item.time) && item.time < todayStart)
    .sort((a, b) => b.time - a.time);
  return past[0]?.match ?? mine[0];
}

function defaultLineup(
  team: DivisionTeam | null,
  slots: number,
): Array<RosterPlayer | null> {
  if (!team) return Array.from({ length: slots }, () => null);
  const sorted = [...team.players].sort(
    (a, b) => b.fargoRating - a.fargoRating,
  );
  const picked = sorted.slice(0, slots);
  return Array.from({ length: slots }, (_, index) => picked[index] ?? null);
}

export function HandicapCalculator({
  divisionId,
  divisionName,
  prefs,
  onSaveIdentity,
}: HandicapCalculatorProps) {
  const [data, setData] = useState<CalculatorPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playerQuery, setPlayerQuery] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(
    prefs.playerId,
  );
  const [homeTeamId, setHomeTeamId] = useState<string | null>(null);
  const [awayTeamId, setAwayTeamId] = useState<string | null>(null);
  const [homeLineup, setHomeLineup] = useState<Array<RosterPlayer | null>>([]);
  const [awayLineup, setAwayLineup] = useState<Array<RosterPlayer | null>>([]);
  const [activeSlot, setActiveSlot] = useState<{
    side: "home" | "away";
    index: number;
  } | null>(null);
  const [weekMatchup, setWeekMatchup] = useState<CalculatorMatchup | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/divisions/${divisionId}/calculator`,
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(payload?.error || "Failed to load calculator");
        }
        const payload = (await response.json()) as CalculatorPayload;
        if (cancelled) return;
        setData(payload);

        const slots =
          payload.playersPerTeam ||
          payload.parsedFormat.numOfPlayers ||
          DEFAULT_PLAYERS_PER_TEAM;

        if (prefs.playerId) {
          const me = payload.players.find(
            (player) => player.id === prefs.playerId,
          );
          if (me) {
            setSelectedPlayerId(me.id);
            const matchup = findWeeklyMatchup(payload.matchups, me.teamId);
            setWeekMatchup(matchup);
            if (matchup) {
              setHomeTeamId(matchup.homeTeamId);
              setAwayTeamId(matchup.awayTeamId);
              const home =
                payload.teams.find((team) => team.id === matchup.homeTeamId) ??
                null;
              const away =
                payload.teams.find((team) => team.id === matchup.awayTeamId) ??
                null;
              setHomeLineup(defaultLineup(home, slots));
              setAwayLineup(defaultLineup(away, slots));
            } else {
              setHomeTeamId(me.teamId);
              setHomeLineup(
                defaultLineup(
                  payload.teams.find((team) => team.id === me.teamId) ?? null,
                  slots,
                ),
              );
              setAwayLineup(Array.from({ length: slots }, () => null));
            }
          }
        } else {
          setHomeLineup(Array.from({ length: slots }, () => null));
          setAwayLineup(Array.from({ length: slots }, () => null));
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
  }, [divisionId, prefs.playerId]);

  const slots =
    data?.playersPerTeam ||
    data?.parsedFormat.numOfPlayers ||
    DEFAULT_PLAYERS_PER_TEAM;

  const homeTeam = data?.teams.find((team) => team.id === homeTeamId) ?? null;
  const awayTeam = data?.teams.find((team) => team.id === awayTeamId) ?? null;

  const filteredPlayers = useMemo(() => {
    if (!data) return [];
    const q = playerQuery.trim().toLowerCase();
    const list = [...data.players].sort((a, b) =>
      playerLabel(a).localeCompare(playerLabel(b)),
    );
    if (!q) return list;
    return list.filter((player) => {
      const label = `${playerLabel(player)} ${player.teamName}`.toLowerCase();
      return label.includes(q);
    });
  }, [data, playerQuery]);

  const results: RoundHandicapResult[] | null = useMemo(() => {
    if (!data || !homeTeam || !awayTeam) return null;
    if (
      homeLineup.some((player) => !player) ||
      awayLineup.some((player) => !player)
    ) {
      return null;
    }

    const format =
      data.parsedFormat.rounds.length > 0
        ? data.parsedFormat
        : buildDefaultFivePlayerFormat(slots);

    return calculateRoundBasedHandicaps({
      format,
      teamOneRatings: homeLineup.map((player) => player!.fargoRating),
      teamTwoRatings: awayLineup.map((player) => player!.fargoRating),
      pointSystem: data.format.pointSystem || "10",
      handicapPercent: data.format.handicapPercent ?? 1,
      handicapCap: data.format.handicapCap ?? 50,
    });
  }, [data, homeTeam, awayTeam, homeLineup, awayLineup, slots]);

  const choosePlayer = (player: RosterPlayer) => {
    if (!data) return;
    setSelectedPlayerId(player.id);
    onSaveIdentity({
      playerId: player.id,
      playerName: playerLabel(player),
      teamId: player.teamId,
      teamName: player.teamName,
    });

    const matchup = findWeeklyMatchup(data.matchups, player.teamId);
    setWeekMatchup(matchup);
    if (matchup) {
      setHomeTeamId(matchup.homeTeamId);
      setAwayTeamId(matchup.awayTeamId);
      setHomeLineup(
        defaultLineup(
          data.teams.find((team) => team.id === matchup.homeTeamId) ?? null,
          slots,
        ),
      );
      setAwayLineup(
        defaultLineup(
          data.teams.find((team) => team.id === matchup.awayTeamId) ?? null,
          slots,
        ),
      );
    } else {
      setHomeTeamId(player.teamId);
      setAwayTeamId(null);
      setHomeLineup(
        defaultLineup(
          data.teams.find((team) => team.id === player.teamId) ?? null,
          slots,
        ),
      );
      setAwayLineup(Array.from({ length: slots }, () => null));
    }
    setActiveSlot(null);
  };

  const selectTeam = (side: "home" | "away", teamId: string) => {
    if (!data) return;
    if (side === "home") {
      if (teamId === awayTeamId) setAwayTeamId(null);
      setHomeTeamId(teamId);
      setHomeLineup(
        defaultLineup(
          data.teams.find((team) => team.id === teamId) ?? null,
          slots,
        ),
      );
    } else {
      if (teamId === homeTeamId) setHomeTeamId(null);
      setAwayTeamId(teamId);
      setAwayLineup(
        defaultLineup(
          data.teams.find((team) => team.id === teamId) ?? null,
          slots,
        ),
      );
    }
    setWeekMatchup(null);
    setActiveSlot(null);
  };

  const assignPlayerToSlot = (player: RosterPlayer) => {
    if (!activeSlot) return;
    const update = (lineup: Array<RosterPlayer | null>) => {
      const next = [...lineup];
      // Remove if already in another slot on same side
      for (let i = 0; i < next.length; i += 1) {
        if (next[i]?.id === player.id) next[i] = null;
      }
      next[activeSlot.index] = player;
      return next;
    };
    if (activeSlot.side === "home") setHomeLineup(update);
    else setAwayLineup(update);
    setActiveSlot(null);
  };

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

  const selectedPlayer =
    data.players.find((player) => player.id === selectedPlayerId) ?? null;

  return (
    <div className="animate-panel space-y-5">
      <section className="rounded-[1.4rem] border border-[var(--line)] bg-white/80 px-4 py-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
          FargoRate handicap
        </p>
        <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--felt-deep)]">
          Round calculator
        </h3>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {divisionName} · {data.format.pointSystem || "10"}-point ·{" "}
          {slots} players/side · {data.format.fargoRateHandicapType || "RoundBased"}
        </p>
      </section>

      <section className="space-y-3">
        <div>
          <h4 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
            Who are you?
          </h4>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Pick yourself to auto-load this week&apos;s matchup and teams.
          </p>
        </div>

        {selectedPlayer ? (
          <div className="rounded-2xl border border-[var(--felt-soft)] bg-[color-mix(in_srgb,var(--felt)_8%,white)] px-4 py-3">
            <p className="font-medium text-[var(--ink)]">
              {playerLabel(selectedPlayer)}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
              {selectedPlayer.teamName} · Fargo {selectedPlayer.fargoRating}
            </p>
            {weekMatchup ? (
              <p className="mt-2 text-sm text-[var(--felt-deep)]">
                This week: {weekMatchup.homeTeamName} vs{" "}
                {weekMatchup.awayTeamName}
                <span className="text-[var(--muted)]">
                  {" "}
                  · {weekMatchup.date}
                  {weekMatchup.location ? ` · ${weekMatchup.location}` : ""}
                </span>
              </p>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted)]">
                No scheduled match found for your team — pick opponents below.
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setSelectedPlayerId(null);
                setPlayerQuery("");
              }}
              className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--chalk)]"
            >
              Change player
            </button>
          </div>
        ) : (
          <>
            <input
              value={playerQuery}
              onChange={(event) => setPlayerQuery(event.target.value)}
              placeholder="Search your name"
              className="w-full rounded-2xl border border-[var(--line)] bg-white/85 px-4 py-3 outline-none ring-[var(--felt-soft)] transition focus:ring-2"
            />
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {filteredPlayers.slice(0, 40).map((player) => (
                <li key={player.id}>
                  <button
                    type="button"
                    onClick={() => choosePlayer(player)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 text-left transition hover:border-[var(--felt-soft)]"
                  >
                    <div>
                      <p className="font-medium text-[var(--ink)]">
                        {playerLabel(player)}
                      </p>
                      <p className="mt-0.5 text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                        {player.teamName}
                      </p>
                    </div>
                    <span className="tabular-nums text-sm font-semibold text-[var(--felt)]">
                      {player.fargoRating}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h4 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
            Teams playing
          </h4>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Home is Team One in the scoresheet rotation. Tap a team to select.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <TeamPickerColumn
            label="Home"
            selectedId={homeTeamId}
            teams={data.teams}
            disabledId={awayTeamId}
            onSelect={(teamId) => selectTeam("home", teamId)}
          />
          <TeamPickerColumn
            label="Away"
            selectedId={awayTeamId}
            teams={data.teams}
            disabledId={homeTeamId}
            onSelect={(teamId) => selectTeam("away", teamId)}
          />
        </div>
      </section>

      {homeTeam && awayTeam ? (
        <section className="space-y-4">
          <div>
            <h4 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
              Lineups ({slots} players)
            </h4>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Order matters — slot 1 plays as H1/A1 in round 1. Tap a slot, then
              a roster player.
            </p>
          </div>

          <div className="grid gap-4">
            <LineupEditor
              title={homeTeam.name}
              side="home"
              lineup={homeLineup}
              roster={homeTeam.players}
              activeSlot={activeSlot}
              onActivate={(index) => setActiveSlot({ side: "home", index })}
              onPick={assignPlayerToSlot}
              onClear={(index) => {
                setHomeLineup((prev) => {
                  const next = [...prev];
                  next[index] = null;
                  return next;
                });
              }}
            />
            <LineupEditor
              title={awayTeam.name}
              side="away"
              lineup={awayLineup}
              roster={awayTeam.players}
              activeSlot={activeSlot}
              onActivate={(index) => setActiveSlot({ side: "away", index })}
              onPick={assignPlayerToSlot}
              onClear={(index) => {
                setAwayLineup((prev) => {
                  const next = [...prev];
                  next[index] = null;
                  return next;
                });
              }}
            />
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h4 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
          Handicap by round
        </h4>
        {!homeTeam || !awayTeam ? (
          <EmptyState
            title="Select both teams"
            body="Choose home and away to calculate per-round handicaps."
          />
        ) : !results ? (
          <EmptyState
            title="Fill every lineup slot"
            body={`Pick ${slots} players for each team. Ratings come from LMS.`}
          />
        ) : (
          <div className="space-y-3">
            {results.map((result) => {
              const gets =
                result.teamOne > 0
                  ? homeTeam.name
                  : result.teamTwo > 0
                    ? awayTeam.name
                    : "Even";
              const points = Math.max(result.teamOne, result.teamTwo);
              return (
                <article
                  key={result.round}
                  className="rounded-2xl border border-[var(--line)] bg-white/85 px-4 py-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--amber)]">
                        Round {result.round}
                      </p>
                      <p className="mt-1 font-medium text-[var(--ink)]">
                        {points === 0
                          ? "No handicap"
                          : `${gets} gets ${points} pts`}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Expected{" "}
                        {result.teamOneExpected.toFixed(1)} –{" "}
                        {result.teamTwoExpected.toFixed(1)}
                      </p>
                    </div>
                    <div className="rounded-full bg-[var(--felt)] px-3 py-1 text-sm font-semibold text-white">
                      {points}
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1.5 border-t border-[var(--line)] pt-3">
                    {result.matchups.map((matchup, index) => {
                      const home =
                        homeLineup[matchup.homeIndexes[0] - 1];
                      const away =
                        awayLineup[matchup.awayIndexes[0] - 1];
                      return (
                        <li
                          key={`${result.round}-${index}`}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="text-[var(--ink)]">
                            {home ? playerLabel(home) : `H${matchup.homeIndexes[0]}`}{" "}
                            <span className="text-[var(--muted)]">vs</span>{" "}
                            {away ? playerLabel(away) : `A${matchup.awayIndexes[0]}`}
                          </span>
                          <span className="tabular-nums text-xs text-[var(--muted)]">
                            {Math.round(matchup.homeRating)}–
                            {Math.round(matchup.awayRating)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              );
            })}
            <p className="text-xs leading-relaxed text-[var(--muted)]">
              Uses the official FargoRate expected-score model from the league
              calculator. Matchups follow this division&apos;s LMS rotation
              template. If a sub changes after round 1, update the lineup and
              recalculate.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function TeamPickerColumn({
  label,
  selectedId,
  disabledId,
  teams,
  onSelect,
}: {
  label: string;
  selectedId: string | null;
  disabledId: string | null;
  teams: DivisionTeam[];
  onSelect: (teamId: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {teams.map((team) => {
          const selected = team.id === selectedId;
          const disabled = team.id === disabledId;
          return (
            <li key={team.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(team.id)}
                className={[
                  "w-full rounded-2xl border px-3 py-2.5 text-left text-sm transition",
                  selected
                    ? "border-[var(--felt)] bg-[var(--felt)] text-white"
                    : "border-[var(--line)] bg-white/80 text-[var(--ink)] hover:border-[var(--felt-soft)]",
                  disabled ? "opacity-40" : "",
                ].join(" ")}
              >
                <span className="font-medium">{team.name}</span>
                <span
                  className={[
                    "mt-1 block text-[10px] uppercase tracking-[0.12em]",
                    selected ? "text-white/75" : "text-[var(--muted)]",
                  ].join(" ")}
                >
                  {team.players.length} players
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LineupEditor({
  title,
  side,
  lineup,
  roster,
  activeSlot,
  onActivate,
  onPick,
  onClear,
}: {
  title: string;
  side: "home" | "away";
  lineup: Array<RosterPlayer | null>;
  roster: RosterPlayer[];
  activeSlot: { side: "home" | "away"; index: number } | null;
  onActivate: (index: number) => void;
  onPick: (player: RosterPlayer) => void;
  onClear: (index: number) => void;
}) {
  const isActiveSide = activeSlot?.side === side;
  const usedIds = new Set(
    lineup.filter(Boolean).map((player) => player!.id),
  );

  return (
    <div className="rounded-[1.3rem] border border-[var(--line)] bg-white/80 p-3 shadow-sm">
      <p className="font-[family-name:var(--font-display)] text-lg text-[var(--felt-deep)]">
        {title}
      </p>
      <ol className="mt-3 space-y-2">
        {lineup.map((player, index) => {
          const active = isActiveSide && activeSlot?.index === index;
          return (
            <li key={`${side}-${index}`}>
              <button
                type="button"
                onClick={() => onActivate(index)}
                className={[
                  "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition",
                  active
                    ? "border-[var(--amber)] bg-[color-mix(in_srgb,var(--amber)_12%,white)]"
                    : "border-[var(--line)] bg-[var(--paper)]/70",
                ].join(" ")}
              >
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                  {side === "home" ? "H" : "A"}
                  {index + 1}
                </span>
                <span className="flex-1 font-medium text-[var(--ink)]">
                  {player ? playerLabel(player) : "Tap to assign"}
                </span>
                {player ? (
                  <span className="tabular-nums text-sm text-[var(--felt)]">
                    {player.fargoRating}
                  </span>
                ) : null}
              </button>
              {player ? (
                <button
                  type="button"
                  onClick={() => onClear(index)}
                  className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--chalk)]"
                >
                  Clear slot
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>

      {isActiveSide ? (
        <div className="mt-3 border-t border-[var(--line)] pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--amber)]">
            Assign to slot {(activeSlot?.index ?? 0) + 1}
          </p>
          <ul className="max-h-40 space-y-1.5 overflow-y-auto">
            {roster.map((player) => {
              const used = usedIds.has(player.id);
              return (
                <li key={player.id}>
                  <button
                    type="button"
                    onClick={() => onPick(player)}
                    className={[
                      "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm",
                      used
                        ? "bg-[var(--paper-2)] text-[var(--muted)]"
                        : "bg-white hover:bg-[var(--paper)]",
                    ].join(" ")}
                  >
                    <span>{playerLabel(player)}</span>
                    <span className="tabular-nums">{player.fargoRating}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
