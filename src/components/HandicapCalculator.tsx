"use client";

import {
  useEffect,
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
  loadTeamLineupPresets,
  removeTeamLineupPreset,
  saveTeamLineupPreset,
} from "@/lib/lineup-sync";
import { loadLineupPresets } from "@/lib/preferences";
import type {
  CalculatorMatchup,
  DivisionTeam,
  LineupPreset,
  RosterPlayer,
  UserPreferences,
} from "@/lib/types";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { PlayerSelect } from "./PlayerSelect";
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
  /** Bumps when LMS cache is manually refreshed. */
  refreshToken?: number;
  /** Opens the league context card so My team can be set once. */
  onRequestSetTeam: () => void;
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

/** Centered 2×3 grip — unicode ⠿ sits optically off-center in most fonts. */
function GripIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 16"
      width="12"
      height="16"
      aria-hidden
      className={className}
    >
      <circle cx="3.5" cy="3" r="1.4" fill="currentColor" />
      <circle cx="8.5" cy="3" r="1.4" fill="currentColor" />
      <circle cx="3.5" cy="8" r="1.4" fill="currentColor" />
      <circle cx="8.5" cy="8" r="1.4" fill="currentColor" />
      <circle cx="3.5" cy="13" r="1.4" fill="currentColor" />
      <circle cx="8.5" cy="13" r="1.4" fill="currentColor" />
    </svg>
  );
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
        "flex items-center gap-2 rounded-xl border px-2.5 py-2 shadow-[var(--shadow)]",
        floating
          ? "pointer-events-none border-[var(--felt)] bg-[color-mix(in_srgb,var(--surface)_82%,var(--felt))] opacity-90 backdrop-blur-sm"
          : "border-dashed border-[var(--felt)] bg-[color-mix(in_srgb,var(--felt)_16%,var(--surface))] opacity-80",
      ].join(" ")}
    >
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--felt-deep)]">
        <GripIcon />
      </span>
      <span className="w-6 shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
        #{slotNumber}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--ink)]">
        {playerLabel(player)}
        <span className="ml-1.5 tabular-nums text-[var(--felt-deep)]">
          {player.fargoRating}
        </span>
      </span>
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
  refreshToken = 0,
  onRequestSetTeam,
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
    if (!myTeamId) {
      setPresets(loadLineupPresets());
      return;
    }
    let cancelled = false;
    void loadTeamLineupPresets({ teamId: myTeamId, divisionId }).then(
      (result) => {
        if (!cancelled) setPresets(result.presets);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [myTeamId, divisionId]);

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
  }, [divisionId, prefs.teamId, refreshToken]);

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

    void saveTeamLineupPreset(preset)
      .then((result) => {
        setPresets(result.presets);
        setPresetName(name);
        setPresetStatus(
          result.shared
            ? `Saved “${name}” for the team. Tap a preset anytime to load it.`
            : `Saved “${name}” on this device. Tap a preset anytime to load it.`,
        );
      })
      .catch(() => {
        setPresetStatus("Couldn't save lineup.");
      });
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
    if (!myTeamId) return;
    void removeTeamLineupPreset({
      teamId: myTeamId,
      divisionId,
      presetId: preset.id,
    }).then((result) => {
      setPresets(result.presets);
      setPresetStatus(`Deleted “${preset.name}”.`);
    });
  };

  const teamPresets = presets.filter(
    (preset) =>
      preset.divisionId === divisionId && preset.teamId === myTeamId,
  );

  const sectionHeader = (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
        Handicap
      </p>
      <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--felt-deep)]">
        Matchup calculator
      </h3>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Build lineups and see round handicaps
        {prefs.teamName ? (
          <>
            {" "}
            for{" "}
            <span className="font-medium text-[var(--ink)]">{prefs.teamName}</span>
          </>
        ) : null}
        {divisionName ? <> · {divisionName}</> : null}
      </p>
    </div>
  );

  if (loading) {
    return (
      <section className="animate-rise space-y-4">
        {sectionHeader}
        <LoadingState label="Loading teams, ratings, and format…" />
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="animate-rise space-y-4">
        {sectionHeader}
        <EmptyState
          title="Couldn't load calculator"
          body={error ?? "Try again in a moment."}
        />
      </section>
    );
  }

  if (!prefs.teamId || !myTeam) {
    return (
      <section className="animate-rise space-y-4">
        {sectionHeader}
        <EmptyState
          title="Set My team to calculate handicaps"
          body="Handicap uses your team from the context card. Set My team once, then pick an opponent here."
          action={
            <button
              type="button"
              onClick={onRequestSetTeam}
              className="rounded-xl bg-[var(--felt)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Set my team
            </button>
          }
        />
      </section>
    );
  }

  return (
    <div className="animate-panel space-y-4">
      {sectionHeader}

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

      <section className="relative z-40 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-end">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Your team
              </p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-lg text-[var(--felt-deep)]">
                {myTeam.name}
              </p>
            </div>
            {oppTeam ? (
              <div
                role="group"
                aria-label="Home or away"
                className="inline-flex shrink-0 rounded-full border border-[var(--line)] bg-[var(--surface-2)] p-0.5"
              >
                <button
                  type="button"
                  aria-pressed={iAmHome}
                  onClick={() => setIAmHome(true)}
                  className={[
                    "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                    iAmHome
                      ? "bg-[var(--felt)] text-white shadow-sm"
                      : "text-[var(--muted)]",
                  ].join(" ")}
                >
                  Home
                </button>
                <button
                  type="button"
                  aria-pressed={!iAmHome}
                  onClick={() => setIAmHome(false)}
                  className={[
                    "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                    !iAmHome
                      ? "bg-[var(--felt)] text-white shadow-sm"
                      : "text-[var(--muted)]",
                  ].join(" ")}
                >
                  Away
                </button>
              </div>
            ) : null}
          </div>
        </div>
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
        />
      </section>

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
              defaultCollapsed
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
  defaultCollapsed = false,
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
  defaultCollapsed?: boolean;
}) {
  // Only the top-left ⠿ grip starts a drag — the rest of the card stays interactive.
  const filled = filledCount(lineup);
  const listRef = useRef<HTMLOListElement>(null);
  const dropTargetRef = useRef(dropTarget);
  const onMoveRef = useRef(onMove);
  const setDragStateRef = useRef(setDragState);
  const setDropTargetRef = useRef(setDropTarget);
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
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
    <div className="min-w-0 overflow-hidden rounded-[1.3rem] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-sm sm:p-3.5">
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => {
          setCollapsed((current) => !current);
          if (draggingHere) clearDrag();
        }}
        className={[
          "flex w-full items-center justify-between gap-2 text-left",
          collapsed ? "" : "mb-2",
        ].join(" ")}
      >
        <div className="min-w-0 flex-1 overflow-hidden">
          <h4 className="truncate font-[family-name:var(--font-display)] text-lg text-[var(--felt-deep)]">
            {title}
          </h4>
          <p className="truncate text-xs text-[var(--muted)]">{subtitle}</p>
        </div>
        <span
          className={[
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
            filled === slots
              ? "bg-[var(--felt)] text-white"
              : "bg-[var(--surface-2)] text-[var(--muted)]",
          ].join(" ")}
        >
          {filled}/{slots}
        </span>
        <span
          aria-hidden
          className={[
            "shrink-0 text-sm text-[var(--muted)] transition-transform duration-150",
            collapsed ? "-rotate-90" : "rotate-0",
          ].join(" ")}
        >
          ▾
        </span>
      </button>

      {collapsed ? null : (
      <>
      <ol
        ref={listRef}
        className="min-w-0 divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]"
      >
        {Array.from({ length: slots }).map((_, index) => {
          const player = previewLineup[index];
          // Preview order already moves the row; mark its new slot as the landing ghost.
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
                <div className="px-2 py-1.5">
                  <DragGhostCard
                    player={draggedPlayer}
                    slotNumber={index + 1}
                  />
                </div>
              ) : (
                <div
                  data-lineup-card
                  className={[
                    "flex min-w-0 items-center gap-1.5 px-2 py-1.5 transition duration-150 sm:gap-2 sm:px-2.5",
                    isLiftedSource
                      ? "z-20 bg-[var(--surface-3)] opacity-30"
                      : "z-0",
                  ].join(" ")}
                >
                  {player ? (
                    <button
                      type="button"
                      aria-label={`Drag slot ${index + 1}`}
                      onPointerDown={(event) => {
                        const row = event.currentTarget.closest(
                          "[data-lineup-card]",
                        ) as HTMLElement | null;
                        onGripPointerDown(event, index, row);
                      }}
                      className="touch-none inline-flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-md text-[var(--felt-deep)] transition hover:bg-[var(--surface-3)] active:cursor-grabbing"
                    >
                      <GripIcon />
                    </button>
                  ) : (
                    <span
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted)]"
                      aria-hidden
                    >
                      <GripIcon />
                    </span>
                  )}

                  <span className="w-6 shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                    #{index + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <PlayerSelect
                      value={player?.id ?? ""}
                      options={sortedRoster.map((option) => ({
                        id: option.id,
                        label: playerLabel(option),
                        rating: option.fargoRating,
                      }))}
                      placeholder="Open slot…"
                      compact
                      onChange={(playerId) => onSelectSlot(index, playerId)}
                    />
                  </div>

                  {player ? (
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        aria-label="Move up"
                        disabled={index === 0 || draggingHere}
                        onClick={() => onMove(index, index - 1)}
                        className="inline-flex h-7 w-6 items-center justify-center rounded-md text-[10px] text-[var(--muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)] disabled:opacity-25"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        disabled={index >= slots - 1 || draggingHere}
                        onClick={() => onMove(index, index + 1)}
                        className="inline-flex h-7 w-6 items-center justify-center rounded-md text-[10px] text-[var(--muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--ink)] disabled:opacity-25"
                      >
                        ▼
                      </button>
                    </div>
                  ) : (
                    <span className="w-12 shrink-0" aria-hidden />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[11px] text-[var(--muted)]">
        Drag ⠿ to reorder, or use ▲ ▼ · handicaps follow Fargo
      </p>
      </>
      )}

      {mounted &&
      !collapsed &&
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
                transform: "scale(1.02) rotate(-0.8deg)",
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
