"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { DEFAULT_PLAYERS_PER_TEAM } from "@/lib/constants";
import {
  buildDefaultFivePlayerFormat,
  calculateRoundBasedHandicaps,
  type ParsedMatchFormat,
  type RoundHandicapResult,
} from "@/lib/handicap";
import {
  findMatchupBetweenTeams,
  findWeeklyMatchupForTeam,
} from "@/lib/matchups";
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

type LineupSlot = RosterPlayer | null;
type LineupSide = "mine" | "opp";

type DragState = {
  side: LineupSide;
  from: number;
};

function playerLabel(player: RosterPlayer): string {
  return `${player.firstName} ${player.lastName}`.trim();
}

function moveSlotPreview(
  lineup: LineupSlot[],
  from: number,
  to: number,
): LineupSlot[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= lineup.length ||
    to >= lineup.length
  ) {
    return lineup;
  }
  const next = [...lineup];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function DragGhostCard({
  player,
  slotNumber,
  floating,
  style,
}: {
  player: RosterPlayer;
  slotNumber: number;
  floating?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={style}
      className={[
        "rounded-xl border px-3 py-2.5 shadow-[var(--shadow)]",
        floating
          ? "pointer-events-none border-[var(--felt)] bg-[color-mix(in_srgb,var(--surface)_82%,var(--felt))] opacity-90 backdrop-blur-sm"
          : "border-dashed border-[var(--felt)] bg-[color-mix(in_srgb,var(--felt)_16%,var(--surface))] opacity-80",
      ].join(" ")}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--felt)]/40 bg-[var(--surface)]/80 text-sm text-[var(--felt-deep)]">
            ⠿
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Slot #{slotNumber}
          </span>
        </div>
        <span className="tabular-nums text-xs font-semibold text-[var(--felt)]">
          {player.fargoRating}
        </span>
      </div>
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)]/90 px-3 py-2.5 text-sm font-medium text-[var(--ink)]">
        {playerLabel(player)}
      </div>
    </div>
  );
}

function emptyLineup(slots: number): LineupSlot[] {
  return Array.from({ length: slots }, () => null);
}

function filledCount(lineup: LineupSlot[]): number {
  return lineup.filter(Boolean).length;
}

function isComplete(lineup: LineupSlot[], slots: number): boolean {
  return lineup.length === slots && lineup.every(Boolean);
}

function defaultTopLineup(team: DivisionTeam | null, slots: number): LineupSlot[] {
  if (!team) return emptyLineup(slots);
  const top = [...team.players]
    .sort((a, b) => b.fargoRating - a.fargoRating)
    .slice(0, slots);
  return Array.from({ length: slots }, (_, index) => top[index] ?? null);
}

function lineupFromIds(
  team: DivisionTeam | null,
  ids: string[],
  slots: number,
): LineupSlot[] {
  if (!team) return emptyLineup(slots);
  const map = new Map(team.players.map((player) => [player.id, player]));
  return Array.from(
    { length: slots },
    (_, index) => map.get(ids[index] ?? "") ?? null,
  );
}

function compactPlayers(lineup: LineupSlot[]): RosterPlayer[] {
  return lineup.filter((player): player is RosterPlayer => Boolean(player));
}

function presetId(teamId: string, name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${teamId}:${slug || "lineup"}`;
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
  const [myLineup, setMyLineup] = useState<LineupSlot[]>([]);
  const [oppLineup, setOppLineup] = useState<LineupSlot[]>([]);
  const [weekMatchup, setWeekMatchup] = useState<CalculatorMatchup | null>(null);
  const [presets, setPresets] = useState<LineupPreset[]>([]);
  const [presetName, setPresetName] = useState("Default lineup");
  const [presetStatus, setPresetStatus] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<DragState | null>(null);

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
    if (!isComplete(homeLineup, slots) || !isComplete(awayLineup, slots)) {
      return null;
    }

    const format =
      data.parsedFormat.rounds.length > 0
        ? data.parsedFormat
        : buildDefaultFivePlayerFormat(slots);

    return calculateRoundBasedHandicaps({
      format,
      teamOneRatings: compactPlayers(homeLineup).map(
        (player) => player.fargoRating,
      ),
      teamTwoRatings: compactPlayers(awayLineup).map(
        (player) => player.fargoRating,
      ),
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
      if (saved) setPresetName(saved.name);
    } else {
      setOpponentTeamId(null);
      setOppLineup(emptyLineup(slotCount));
      setMyLineup(
        saved
          ? lineupFromIds(team, saved.playerIds, slotCount)
          : defaultTopLineup(team, slotCount),
      );
      if (saved) setPresetName(saved.name);
    }
  }

  const chooseMyTeam = (team: DivisionTeam) => {
    setMyTeamId(team.id);
    onSelectTeam({ teamId: team.id, teamName: team.name });
    setPresetStatus(null);
    if (data) applyTeamMatchup(data, team.id);
  };

  const clearMyTeam = () => {
    setMyTeamId(null);
    setOpponentTeamId(null);
    setMyLineup([]);
    setOppLineup([]);
    setWeekMatchup(null);
    setPresetStatus(null);
  };

  const chooseOpponent = (team: DivisionTeam) => {
    setOpponentTeamId(team.id);
    setOppLineup(defaultTopLineup(team, slots));
    if (data && myTeamId) {
      const matchup = findMatchupBetweenTeams(data.matchups, myTeamId, team.id);
      setWeekMatchup(matchup);
      if (matchup) {
        setIAmHome(matchup.homeTeamId === myTeamId);
      }
    } else {
      setWeekMatchup(null);
    }
  };

  const clearOpponent = () => {
    setOpponentTeamId(null);
    setWeekMatchup(null);
    setOppLineup([]);
  };

  const setSlotPlayer = (
    side: LineupSide,
    slotIndex: number,
    playerId: string,
  ) => {
    const current = side === "mine" ? [...myLineup] : [...oppLineup];
    const setter = side === "mine" ? setMyLineup : setOppLineup;
    const roster =
      side === "mine" ? (myTeam?.players ?? []) : (oppTeam?.players ?? []);

    if (!playerId) {
      current[slotIndex] = null;
      setter(current);
      return;
    }

    const player = roster.find((item) => item.id === playerId) ?? null;
    if (!player) return;

    current[slotIndex] = player;
    setter(current);
  };

  const moveInLineup = (side: LineupSide, from: number, to: number) => {
    const current = side === "mine" ? [...myLineup] : [...oppLineup];
    const setter = side === "mine" ? setMyLineup : setOppLineup;
    if (
      from < 0 ||
      to < 0 ||
      from >= current.length ||
      to >= current.length ||
      from === to
    ) {
      return;
    }
    const [item] = current.splice(from, 1);
    current.splice(to, 0, item);
    setter(current);
  };

  const savePreset = () => {
    if (!myTeamId) {
      setPresetStatus("Select your team before saving a lineup.");
      return;
    }
    if (!isComplete(myLineup, slots)) {
      setPresetStatus(`Fill all ${slots} slots before saving.`);
      return;
    }

    const name = presetName.trim() || "Default lineup";
    const preset: LineupPreset = {
      id: presetId(myTeamId, name),
      name,
      divisionId,
      teamId: myTeamId,
      playerIds: compactPlayers(myLineup).map((player) => player.id),
      updatedAt: new Date().toISOString(),
    };

    try {
      const next = upsertLineupPreset(preset);
      setPresets(next);
      setPresetName(name);
      setPresetStatus(`Saved “${name}”. Tap a preset anytime to load it.`);
    } catch {
      setPresetStatus("Couldn't save lineup — local storage may be blocked.");
    }
  };

  const applyPreset = (preset: LineupPreset) => {
    if (!myTeam) {
      setPresetStatus("Select your team first.");
      return;
    }
    setMyLineup(lineupFromIds(myTeam, preset.playerIds, slots));
    setPresetName(preset.name);
    setPresetStatus(`Loaded “${preset.name}”.`);
  };

  const removePreset = (preset: LineupPreset) => {
    const next = deleteLineupPreset(preset.id);
    setPresets(next);
    setPresetStatus(`Deleted “${preset.name}”.`);
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
    <div className="animate-panel space-y-4">
      {weekMatchup ? (
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--felt-soft)] px-4 py-3 text-white shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.14em] text-white/70">
            Auto-matched · {weekMatchup.date}
          </p>
          <p className="mt-1 font-semibold leading-snug">
            {weekMatchup.homeTeamName} vs {weekMatchup.awayTeamName}
          </p>
          <p className="mt-1 text-xs text-white/75">
            {data.format.pointSystem || "10"}-point · {slots}/side
            {weekMatchup.location ? ` · ${weekMatchup.location}` : ""}
          </p>
        </section>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          {data.format.pointSystem || "10"}-point · {slots} players/side ·{" "}
          {data.format.fargoRateHandicapType || "RoundBased"}
          {divisionName ? ` · ${divisionName}` : ""}
        </p>
      )}

      <section className="relative z-40 grid gap-4 md:grid-cols-2">
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
            else clearMyTeam();
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
            else clearOpponent();
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
                : "border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]",
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
                : "border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]",
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
        <section className="relative z-0 grid gap-4 xl:grid-cols-[1.1fr_1.1fr_0.9fr]">
          <LineupPicker
            side="mine"
            title={myTeam.name}
            subtitle={`Pick players · drag ⠿ to reorder · ▲▼ also work`}
            roster={myTeam.players}
            lineup={myLineup.length === slots ? myLineup : emptyLineup(slots)}
            slots={slots}
            onSelectSlot={(slotIndex, playerId) =>
              setSlotPlayer("mine", slotIndex, playerId)
            }
            onMove={(from, to) => moveInLineup("mine", from, to)}
            dragState={dragState}
            dropTarget={dropTarget}
            setDragState={setDragState}
            setDropTarget={setDropTarget}
          />
          {oppTeam ? (
            <LineupPicker
              side="opp"
              title={oppTeam.name}
              subtitle={`Choose ${slots} opponents by slot`}
              roster={oppTeam.players}
              lineup={
                oppLineup.length === slots ? oppLineup : emptyLineup(slots)
              }
              slots={slots}
              onSelectSlot={(slotIndex, playerId) =>
                setSlotPlayer("opp", slotIndex, playerId)
              }
              onMove={(from, to) => moveInLineup("opp", from, to)}
              dragState={dragState}
              dropTarget={dropTarget}
              setDragState={setDragState}
              setDropTarget={setDropTarget}
            />
          ) : (
            <EmptyState
              title="Select an opponent"
              body="Or wait for schedule auto-match once your team is set."
            />
          )}

          <div className="relative z-0 space-y-3 rounded-[1.3rem] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
            <h4 className="font-[family-name:var(--font-display)] text-lg text-[var(--felt-deep)]">
              Saved lineups
            </h4>
            <p className="text-sm text-[var(--muted)]">
              Store your {slots}-player order for this team, then load it before
              league night.
            </p>
            <input
              value={presetName}
              onChange={(event) => {
                setPresetName(event.target.value);
                setPresetStatus(null);
              }}
              placeholder="Preset name"
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:ring-2 focus:ring-[var(--felt-soft)]"
            />
            <button
              type="button"
              disabled={!isComplete(myLineup, slots)}
              onClick={savePreset}
              className="w-full rounded-full bg-[var(--felt)] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--felt-soft)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {teamPresets.some(
                (preset) =>
                  preset.name.trim().toLowerCase() ===
                  presetName.trim().toLowerCase(),
              )
                ? "Update saved lineup"
                : "Save current lineup"}
            </button>
            {presetStatus ? (
              <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--felt-deep)]">
                {presetStatus}
              </p>
            ) : null}
            <ul className="space-y-2">
              {teamPresets.length === 0 ? (
                <li className="rounded-xl border border-dashed border-[var(--line)] px-3 py-4 text-center text-sm text-[var(--muted)]">
                  No presets yet — fill all slots, name it, then save.
                </li>
              ) : (
                teamPresets.map((preset) => {
                  const names = lineupFromIds(myTeam, preset.playerIds, slots)
                    .map((player) => (player ? playerLabel(player) : "—"))
                    .join(" · ");
                  return (
                    <li
                      key={preset.id}
                      className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => applyPreset(preset)}
                          className="text-left text-sm font-semibold text-[var(--ink)] hover:text-[var(--felt-deep)]"
                        >
                          {preset.name}
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => applyPreset(preset)}
                            className="rounded-full bg-[var(--felt)]/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--felt-deep)]"
                          >
                            Load
                          </button>
                          <button
                            type="button"
                            onClick={() => removePreset(preset)}
                            className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--danger)]"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] text-[var(--muted)]">
                        {names}
                      </p>
                      <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                        {preset.playerIds.length} players ·{" "}
                        {new Date(preset.updatedAt).toLocaleString()}
                      </p>
                    </li>
                  );
                })
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
            body={`Pick a player in each of the ${slots} slots for both teams. Drag filled slots to reorder.`}
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
              const homePlayers = compactPlayers(homeLineup);
              const awayPlayers = compactPlayers(awayLineup);
              return (
                <article
                  key={result.round}
                  className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 shadow-sm"
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
                        Exp {result.teamOneExpected.toFixed(1)}–
                        {result.teamTwoExpected.toFixed(1)}
                      </p>
                    </div>
                    <div className="rounded-full bg-[var(--felt)] px-3 py-1 text-sm font-semibold text-white">
                      {points}
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1 border-t border-[var(--line)] pt-3">
                    {result.matchups.map((matchup, index) => {
                      const home = homePlayers[matchup.homeIndexes[0] - 1];
                      const away = awayPlayers[matchup.awayIndexes[0] - 1];
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
          </div>
        )}
      </section>
    </div>
  );
}

function LineupPicker({
  side,
  title,
  subtitle,
  roster,
  lineup,
  slots,
  onSelectSlot,
  onMove,
  dragState,
  dropTarget,
  setDragState,
  setDropTarget,
}: {
  side: LineupSide;
  title: string;
  subtitle: string;
  roster: RosterPlayer[];
  lineup: LineupSlot[];
  slots: number;
  onSelectSlot: (slotIndex: number, playerId: string) => void;
  onMove: (from: number, to: number) => void;
  dragState: DragState | null;
  dropTarget: DragState | null;
  setDragState: (state: DragState | null) => void;
  setDropTarget: (state: DragState | null) => void;
}) {
  // Only the top-left ⠿ grip starts a drag — the rest of the card stays interactive.
  const filled = filledCount(lineup);
  const listRef = useRef<HTMLOListElement>(null);
  const dropTargetRef = useRef(dropTarget);
  const onMoveRef = useRef(onMove);
  const setDragStateRef = useRef(setDragState);
  const setDropTargetRef = useRef(setDropTarget);
  const [mounted, setMounted] = useState(false);
  const [ghost, setGhost] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const sortedRoster = useMemo(
    () => [...roster].sort((a, b) => b.fargoRating - a.fargoRating),
    [roster],
  );

  const draggingHere = dragState?.side === side;
  const dragFrom = draggingHere ? dragState.from : -1;
  const dragTo =
    draggingHere && dropTarget?.side === side ? dropTarget.from : dragFrom;
  const draggedPlayer = dragFrom >= 0 ? lineup[dragFrom] : null;

  const previewLineup = useMemo(() => {
    if (!draggingHere || dragFrom < 0 || dragTo < 0) return lineup;
    return moveSlotPreview(lineup, dragFrom, dragTo);
  }, [draggingHere, dragFrom, dragTo, lineup]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    dropTargetRef.current = dropTarget;
  }, [dropTarget]);

  useEffect(() => {
    onMoveRef.current = onMove;
    setDragStateRef.current = setDragState;
    setDropTargetRef.current = setDropTarget;
  }, [onMove, setDragState, setDropTarget]);

  const unlockBodyScroll = () => {
    document.body.style.touchAction = "";
    document.body.style.userSelect = "";
    document.body.style.overflow = "";
  };

  const clearDrag = () => {
    unlockBodyScroll();
    setDragStateRef.current(null);
    setDropTargetRef.current(null);
    setGhost(null);
  };

  const indexFromClientY = (clientY: number): number | null => {
    const list = listRef.current;
    if (!list) return null;
    const items = Array.from(list.querySelectorAll<HTMLElement>("[data-slot]"));
    if (!items.length) return null;

    let closest = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    items.forEach((item, index) => {
      const rect = item.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const distance = Math.abs(clientY - mid);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = index;
      }
    });
    return closest;
  };

  const beginDrag = (args: {
    index: number;
    x: number;
    y: number;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  }) => {
    setGhost({
      x: args.x,
      y: args.y,
      width: args.width,
      height: args.height,
      offsetX: args.offsetX,
      offsetY: args.offsetY,
    });
    setDragStateRef.current({ side, from: args.index });
    setDropTargetRef.current({ side, from: args.index });
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(12);
      } catch {
        // ignore
      }
    }
  };

  // Active drag listeners — stable deps so vertical moves keep tracking.
  useEffect(() => {
    if (!draggingHere || dragFrom < 0) return;

    document.body.style.touchAction = "none";
    document.body.style.userSelect = "none";
    document.body.style.overflow = "hidden";

    const onPointerMove = (event: PointerEvent) => {
      event.preventDefault();
      setGhost((current) =>
        current
          ? { ...current, x: event.clientX, y: event.clientY }
          : current,
      );
      const next = indexFromClientY(event.clientY);
      if (next == null) return;
      setDropTargetRef.current({ side, from: next });
    };

    const onPointerUp = (event: PointerEvent) => {
      event.preventDefault();
      const currentDrop = dropTargetRef.current;
      const target =
        currentDrop?.side === side
          ? currentDrop.from
          : (indexFromClientY(event.clientY) ?? dragFrom);
      if (target !== dragFrom) {
        onMoveRef.current(dragFrom, target);
      }
      clearDrag();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      unlockBodyScroll();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingHere, dragFrom, side]);

  useEffect(() => {
    return () => {
      unlockBodyScroll();
    };
  }, []);

  const onGripPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    index: number,
    cardEl: HTMLElement | null,
  ) => {
    if (!lineup[index] || draggingHere) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = (cardEl ?? event.currentTarget).getBoundingClientRect();
    beginDrag({
      index,
      x: event.clientX,
      y: event.clientY,
      width: rect.width,
      height: cardEl?.offsetHeight ?? rect.height,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    });
  };

  return (
    <div className="rounded-[1.3rem] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
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
            filled === slots
              ? "bg-[var(--felt)] text-white"
              : "bg-[var(--surface-2)] text-[var(--muted)]",
          ].join(" ")}
        >
          {filled}/{slots}
        </span>
      </div>

      <ol ref={listRef} className="space-y-2">
        {Array.from({ length: slots }).map((_, index) => {
          const player = previewLineup[index];
          // Preview order already moves the card; mark its new slot as the landing ghost.
          const isLandingGhost =
            draggingHere &&
            dragFrom !== dragTo &&
            dragTo === index &&
            Boolean(draggedPlayer);
          const isLiftedSource =
            draggingHere && dragFrom === dragTo && index === dragFrom;

          return (
            <li key={`slot-${index}`} data-slot={index} className="relative">
              {isLandingGhost && draggedPlayer ? (
                <DragGhostCard
                  player={draggedPlayer}
                  slotNumber={index + 1}
                />
              ) : (
                <div
                  data-lineup-card
                  className={[
                    "relative rounded-xl border px-3 py-2.5 transition duration-150",
                    isLiftedSource
                      ? "z-20 border-[var(--felt)]/40 bg-[var(--surface-3)] opacity-30"
                      : "z-0 border-[var(--line)] bg-[var(--surface-2)]",
                  ].join(" ")}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-2">
                      {player ? (
                        <button
                          type="button"
                          aria-label={`Drag slot ${index + 1}`}
                          onPointerDown={(event) => {
                            const card = event.currentTarget.closest(
                              "[data-lineup-card]",
                            ) as HTMLElement | null;
                            onGripPointerDown(event, index, card);
                          }}
                          className="touch-none inline-flex h-8 w-8 cursor-grab items-center justify-center rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] text-sm text-[var(--felt-deep)] active:cursor-grabbing active:bg-[var(--surface-3)]"
                        >
                          ⠿
                        </button>
                      ) : (
                        <span
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] text-sm text-[var(--muted)]"
                          aria-hidden
                        >
                          ⠿
                        </span>
                      )}
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                        Slot #{index + 1}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {player ? (
                        <>
                          <button
                            type="button"
                            aria-label="Move up"
                            disabled={index === 0 || draggingHere}
                            onClick={() => onMove(index, index - 1)}
                            className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--ink)] disabled:opacity-30"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            aria-label="Move down"
                            disabled={index >= slots - 1 || draggingHere}
                            onClick={() => onMove(index, index + 1)}
                            className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--ink)] disabled:opacity-30"
                          >
                            ▼
                          </button>
                          <span className="ml-1 tabular-nums text-xs font-semibold text-[var(--felt)]">
                            {player.fargoRating}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <PlayerSelect
                    value={player?.id ?? ""}
                    options={sortedRoster}
                    placeholder="Open slot…"
                    onChange={(playerId) => onSelectSlot(index, playerId)}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[11px] text-[var(--muted)]">
        Drag ⠿ to reorder, or use ▲ ▼.
      </p>

      {mounted &&
      draggingHere &&
      draggedPlayer &&
      ghost &&
      typeof document !== "undefined"
        ? createPortal(
            <DragGhostCard
              player={draggedPlayer}
              slotNumber={(dragTo >= 0 ? dragTo : dragFrom) + 1}
              floating
              style={{
                position: "fixed",
                left: ghost.x - ghost.offsetX,
                top: ghost.y - ghost.offsetY,
                width: ghost.width,
                minHeight: ghost.height,
                zIndex: 200,
                transform: "scale(1.03) rotate(-1.2deg)",
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

function PlayerSelect({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: RosterPlayer[];
  placeholder: string;
  onChange: (playerId: string) => void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [mounted, setMounted] = useState(false);

  const selected = options.find((option) => option.id === value) ?? null;
  const menuOptions = useMemo(
    () => [
      { id: "", label: placeholder, rating: null as number | null },
      ...options.map((option) => ({
        id: option.id,
        label: playerLabel(option),
        rating: option.fargoRating as number | null,
      })),
    ],
    [options, placeholder],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;

    const updatePosition = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      const menuHeight = Math.min(224, window.innerHeight * 0.45);
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < menuHeight + 12 && rect.top > spaceBelow;
      setMenuStyle({
        position: "fixed",
        left: Math.max(8, rect.left),
        width: Math.min(rect.width, window.innerWidth - 16),
        top: openUpward ? undefined : rect.bottom + 6,
        bottom: openUpward
          ? Math.max(8, window.innerHeight - rect.top + 6)
          : undefined,
        maxHeight: menuHeight,
        zIndex: 10000,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, menuOptions.length]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const index = Math.max(
      0,
      menuOptions.findIndex((option) => option.id === value),
    );
    setHighlight(index);
  }, [open, menuOptions, value]);

  const menu =
    open && mounted
      ? createPortal(
          <ul
            ref={menuRef}
            id={listId}
            role="listbox"
            style={menuStyle}
            className="overflow-y-auto rounded-xl border border-[var(--line-strong)] bg-[var(--surface-2)] py-1 shadow-[var(--shadow)] [background-color:var(--surface-2)]"
          >
            {menuOptions.map((option, index) => {
              const active = index === highlight;
              const isSelected = option.id === value;
              return (
                <li
                  key={`${option.id || "empty"}-${index}`}
                  className="bg-[var(--surface-2)]"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => {
                      onChange(option.id);
                      setOpen(false);
                    }}
                    className={[
                      "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm",
                      active
                        ? "bg-[var(--surface-3)]"
                        : "bg-[var(--surface-2)]",
                      isSelected
                        ? "font-semibold text-[var(--felt-deep)]"
                        : "text-[var(--ink)]",
                    ].join(" ")}
                  >
                    <span>{option.label}</span>
                    {option.rating != null ? (
                      <span className="tabular-nums text-xs text-[var(--muted)]">
                        {option.rating}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-left text-sm text-[var(--ink)] outline-none transition hover:border-[var(--line-strong)] focus:ring-2 focus:ring-[var(--felt-soft)]"
      >
        <span className={selected ? "font-medium" : "text-[var(--muted)]"}>
          {selected
            ? `${playerLabel(selected)} · ${selected.fargoRating}`
            : placeholder}
        </span>
        <span className="text-[var(--muted)]">▾</span>
      </button>
      {menu}
    </div>
  );
}
