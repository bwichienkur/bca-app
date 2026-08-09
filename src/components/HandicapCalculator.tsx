"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { DEFAULT_PLAYERS_PER_TEAM } from "@/lib/constants";
import {
  chartRaceTargets,
  formatScoringSummary,
  resolveScoringFormat,
} from "@/lib/division-scoring-config";
import {
  buildDefaultFivePlayerFormat,
  calculateDivisionHandicaps,
  handicapTypeLabel,
  type ParsedMatchFormat,
  type RoundHandicapResult,
} from "@/lib/handicap";
import {
  loadTeamLineupPresets,
} from "@/lib/lineup-sync";
import { loadLineupPresets } from "@/lib/preferences";
import type { LeagueScoringFormat } from "@/lib/scoring-formats";
import type {
  CalculatorMatchup,
  DivisionTeam,
  LineupPreset,
  RosterPlayer,
  UserPreferences,
} from "@/lib/types";
import { EmptyState } from "./EmptyState";
import { LoadLineupMenu } from "./LoadLineupMenu";
import { LoadingState } from "./LoadingState";
import { PlayerSelect } from "./PlayerSelect";
import { PanelHeader, PanelHeaderCount } from "./PanelHeader";
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
};

type LineupSlot = RosterPlayer | null;
type LineupSide = "home" | "away";
type CalculatorStep = 1 | 2 | 3;

type DragState = {
  side: LineupSide;
  from: number;
};

function ContentCard({ children }: { children: ReactNode }) {
  return (
    <section className="space-y-4 overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow)] sm:p-4">
      {children}
    </section>
  );
}

function StepSection({
  step,
  title,
  summary,
  open,
  locked,
  lockedHint,
  onToggle,
  children,
}: {
  step: CalculatorStep;
  title: string;
  summary?: string;
  open: boolean;
  locked: boolean;
  lockedHint?: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className={[
        "overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]",
        locked ? "opacity-70" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        disabled={locked}
        aria-expanded={open && !locked}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:hover:bg-transparent sm:px-4"
      >
        <span
          className={[
            "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-semibold tabular-nums",
            open && !locked
              ? "bg-[var(--felt)] text-white"
              : locked
                ? "bg-[var(--surface-2)] text-[var(--muted)]"
                : "bg-[var(--surface-2)] text-[var(--felt-deep)]",
          ].join(" ")}
        >
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-[family-name:var(--font-display)] text-base font-semibold leading-tight text-[var(--ink)]">
            {title}
          </p>
          {locked && lockedHint ? (
            <p className="mt-0.5 text-xs text-[var(--muted)]">{lockedHint}</p>
          ) : summary ? (
            <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
              {summary}
            </p>
          ) : null}
        </div>
        {!locked ? (
          <span
            aria-hidden
            className={[
              "text-[var(--muted)] transition",
              open ? "rotate-180" : "",
            ].join(" ")}
          >
            ▾
          </span>
        ) : null}
      </button>
      {open && !locked ? (
        <div className="space-y-3 border-t border-[var(--line)] p-3 sm:p-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function gameTypeLabel(gameType: string): string {
  if (gameType === "D") return "Doubles";
  if (gameType === "R") return "Race";
  return "Singles";
}

function playerLabel(player: RosterPlayer): string {
  return `${player.firstName} ${player.lastName}`.trim();
}

function playerNames(indexes: number[], players: RosterPlayer[]): string {
  return indexes
    .map((index) => {
      const player = players[index - 1];
      return player ? playerLabel(player) : `P${index}`;
    })
    .join(" / ");
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
        "flex items-center gap-2 rounded-[var(--radius)] border px-2.5 py-2 shadow-[var(--shadow)]",
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

export function HandicapCalculator({
  divisionId,
  divisionName,
  prefs,
  refreshToken = 0,
}: HandicapCalculatorProps) {
  const [data, setData] = useState<CalculatorPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [homeTeamId, setHomeTeamId] = useState<string | null>(null);
  const [awayTeamId, setAwayTeamId] = useState<string | null>(null);
  const [homeLineup, setHomeLineup] = useState<LineupSlot[]>([]);
  const [awayLineup, setAwayLineup] = useState<LineupSlot[]>([]);
  const [presets, setPresets] = useState<LineupPreset[]>([]);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<DragState | null>(null);
  const [mobileSide, setMobileSide] = useState<LineupSide>("home");
  const [openStep, setOpenStep] = useState<CalculatorStep>(1);
  const prevTeamsReady = useRef(false);
  const prevLineupsReady = useRef(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!awayTeamId) setMobileSide("home");
  }, [awayTeamId]);

  useEffect(() => {
    setDragState(null);
    setDropTarget(null);
  }, [mobileSide]);

  useEffect(() => {
    if (!prefs.teamId) {
      setPresets(loadLineupPresets());
      return;
    }
    let cancelled = false;
    void loadTeamLineupPresets({ teamId: prefs.teamId, divisionId }).then(
      (result) => {
        if (!cancelled) setPresets(result.presets);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [prefs.teamId, divisionId]);

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
        seedTeams(payload);
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
  }, [divisionId, prefs.teamId, refreshToken]);

  const scoringFormat = useMemo(
    () =>
      resolveScoringFormat({
        prefsFormatId: prefs.scoringFormatId,
        divisionName,
        playersPerTeam:
          data?.playersPerTeam || data?.parsedFormat.numOfPlayers || null,
        pointsForWin: data?.format.pointSystem
          ? Number(data.format.pointSystem) || null
          : null,
      }),
    [
      data?.format.pointSystem,
      data?.parsedFormat.numOfPlayers,
      data?.playersPerTeam,
      divisionName,
      prefs.scoringFormatId,
    ],
  );

  const slots =
    data?.playersPerTeam ||
    data?.parsedFormat.numOfPlayers ||
    scoringFormat.playersPerTeam ||
    DEFAULT_PLAYERS_PER_TEAM;

  const homeTeam =
    data?.teams.find((team) => team.id === homeTeamId) ?? null;
  const awayTeam =
    data?.teams.find((team) => team.id === awayTeamId) ?? null;

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

  const sheetFormat: ParsedMatchFormat = useMemo(() => {
    if (data?.parsedFormat.rounds.length) return data.parsedFormat;
    return buildDefaultFivePlayerFormat(slots);
  }, [data?.parsedFormat, slots]);

  const results: RoundHandicapResult[] | null = useMemo(() => {
    if (!data || !homeTeam || !awayTeam) return null;
    if (!isComplete(homeLineup, slots) || !isComplete(awayLineup, slots)) {
      return null;
    }

    return calculateDivisionHandicaps({
      format: sheetFormat,
      teamOneRatings: compactPlayers(homeLineup).map(
        (player) => player.fargoRating,
      ),
      teamTwoRatings: compactPlayers(awayLineup).map(
        (player) => player.fargoRating,
      ),
      pointSystem: data.format.pointSystem || scoringFormat.pointSystem || "10",
      handicapPercent: data.format.handicapPercent ?? 1,
      handicapCap: data.format.handicapCap ?? 50,
      fargoRateHandicapType: data.format.fargoRateHandicapType,
    });
  }, [
    data,
    homeTeam,
    awayTeam,
    homeLineup,
    awayLineup,
    slots,
    scoringFormat.pointSystem,
    sheetFormat,
  ]);

  const teamsReady = Boolean(homeTeam && awayTeam);
  const lineupsReady = Boolean(
    teamsReady &&
      isComplete(homeLineup, slots) &&
      isComplete(awayLineup, slots) &&
      results,
  );

  useEffect(() => {
    if (teamsReady && !prevTeamsReady.current) {
      setOpenStep(2);
    }
    if (!teamsReady) {
      setOpenStep(1);
    }
    prevTeamsReady.current = teamsReady;
  }, [teamsReady]);

  useEffect(() => {
    if (lineupsReady && !prevLineupsReady.current) {
      setOpenStep(3);
    }
    if (teamsReady && !lineupsReady && openStep === 3) {
      setOpenStep(2);
    }
    prevLineupsReady.current = Boolean(lineupsReady);
  }, [lineupsReady, teamsReady, openStep]);

  function seedTeams(payload: CalculatorPayload) {
    const slotCount =
      payload.playersPerTeam ||
      payload.parsedFormat.numOfPlayers ||
      DEFAULT_PLAYERS_PER_TEAM;
    setHomeTeamId(null);
    setAwayTeamId(null);
    setHomeLineup(emptyLineup(slotCount));
    setAwayLineup(emptyLineup(slotCount));
    setOpenStep(1);
    prevTeamsReady.current = false;
    prevLineupsReady.current = false;
  }

  const chooseHome = (team: DivisionTeam | null) => {
    if (!team) {
      setHomeTeamId(null);
      setHomeLineup(emptyLineup(slots));
      return;
    }
    setHomeTeamId(team.id);
    setHomeLineup(emptyLineup(slots));
  };

  const chooseAway = (team: DivisionTeam | null) => {
    if (!team) {
      setAwayTeamId(null);
      setAwayLineup(emptyLineup(slots));
      return;
    }
    setAwayTeamId(team.id);
    setAwayLineup(emptyLineup(slots));
  };

  const setSlotPlayer = (
    side: LineupSide,
    slotIndex: number,
    playerId: string,
  ) => {
    const current = side === "home" ? [...homeLineup] : [...awayLineup];
    const setter = side === "home" ? setHomeLineup : setAwayLineup;
    const roster =
      side === "home" ? (homeTeam?.players ?? []) : (awayTeam?.players ?? []);

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
    const current = side === "home" ? [...homeLineup] : [...awayLineup];
    const setter = side === "home" ? setHomeLineup : setAwayLineup;
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

  const applyPreset = (side: LineupSide, preset: LineupPreset) => {
    const team = side === "home" ? homeTeam : awayTeam;
    if (!team) return;
    const setter = side === "home" ? setHomeLineup : setAwayLineup;
    setter(lineupFromIds(team, preset.playerIds, slots));
  };

  const presetsFor = (teamId: string | null) =>
    presets.filter(
      (preset) =>
        preset.divisionId === divisionId && preset.teamId === teamId,
    );

  if (loading) {
    return (
      <section className="animate-rise space-y-4">
        <PanelHeader
          title="Matchup"
          description="Loading teams, ratings, and format…"
        />
        <ContentCard>
          <LoadingState label="Loading teams, ratings, and format…" />
        </ContentCard>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="animate-rise space-y-4">
        <PanelHeader
          title="Matchup"
          description="Couldn't load the calculator"
        />
        <EmptyState
          title="Couldn't load calculator"
          body={error ?? "Try again in a moment."}
        />
      </section>
    );
  }

  const homeOption =
    homeTeam
      ? {
          id: homeTeam.id,
          label: homeTeam.name,
          meta: `${homeTeam.players.length} players`,
          value: homeTeam,
        }
      : null;
  const awayOption =
    awayTeam
      ? {
          id: awayTeam.id,
          label: awayTeam.name,
          meta: `${awayTeam.players.length} players`,
          value: awayTeam,
        }
      : null;

  const roundTotals = results
    ? results.reduce(
        (acc, item) => ({
          home: acc.home + item.teamOne,
          away: acc.away + item.teamTwo,
        }),
        { home: 0, away: 0 },
      )
    : null;

  const formatMeta = `${formatScoringSummary(scoringFormat)} · ${handicapTypeLabel(
    data.format.fargoRateHandicapType,
  )}`;
  const homeFilled = filledCount(
    homeLineup.length === slots ? homeLineup : emptyLineup(slots),
  );
  const awayFilled = filledCount(
    awayLineup.length === slots ? awayLineup : emptyLineup(slots),
  );
  const teamSummary =
    homeTeam && awayTeam
      ? `${homeTeam.name} vs ${awayTeam.name}`
      : homeTeam
        ? `${homeTeam.name} · pick away`
        : awayTeam
          ? `Pick home · ${awayTeam.name}`
          : "No teams selected";
  const lineupSummary = teamsReady
    ? `${homeFilled + awayFilled}/${slots * 2} slots filled`
    : undefined;
  const sheetSummary =
    lineupsReady && roundTotals
      ? scoringFormat.raceMode === "fargo-race-chart"
        ? `Race chart · Home +${roundTotals.home} · Away +${roundTotals.away}`
        : `HC games · Home +${roundTotals.home} · Away +${roundTotals.away}`
      : undefined;

  const toggleStep = (step: CalculatorStep) => {
    startTransition(() => {
      setOpenStep((current) => (current === step ? current : step));
    });
  };

  return (
    <section className="animate-panel space-y-3 p-3 sm:p-4">
      <PanelHeader
        title="Handicap"
        description={formatMeta}
        action={<PanelHeaderCount label="Sides" value={String(slots)} />}
      />

      <StepSection
        step={1}
        title="Teams"
        summary={teamSummary}
        open={openStep === 1}
        locked={false}
        onToggle={() => toggleStep(1)}
      >
        <div className="relative z-20 grid gap-2.5 sm:grid-cols-2">
          <Typeahead
            label="Home"
            placeholder="Select home team"
            value={homeOption}
            options={teamOptions.filter((option) => option.id !== awayTeamId)}
            onChange={(option) => chooseHome(option?.value ?? null)}
          />
          <Typeahead
            label="Away"
            placeholder="Select away team"
            value={awayOption}
            options={teamOptions.filter((option) => option.id !== homeTeamId)}
            onChange={(option) => chooseAway(option?.value ?? null)}
          />
        </div>
        {!teamsReady ? (
          <p className="text-sm text-[var(--muted)]">
            Pick both sides to unlock lineups.
          </p>
        ) : (
          <p className="text-sm text-[var(--felt-deep)]">
            Both teams set — continue to lineups.
          </p>
        )}
      </StepSection>

      <StepSection
        step={2}
        title="Lineups"
        summary={lineupSummary}
        open={openStep === 2}
        locked={!teamsReady}
        lockedHint="Select home and away first"
        onToggle={() => toggleStep(2)}
      >
        {homeTeam && awayTeam ? (
          <div className="grid gap-3 xl:grid-cols-2">
            <div
              role="tablist"
              aria-label="Handicap teams"
              className="grid grid-cols-2 gap-0.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-0.5 xl:hidden"
            >
              {(
                [
                  {
                    id: "home" as const,
                    label: "Home",
                    teamName: homeTeam.name,
                    filled: homeFilled,
                  },
                  {
                    id: "away" as const,
                    label: "Away",
                    teamName: awayTeam.name,
                    filled: awayFilled,
                  },
                ]
              ).map((side) => {
                const selected = mobileSide === side.id;
                return (
                  <button
                    key={side.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setMobileSide(side.id)}
                    className={[
                      "min-w-0 rounded-md px-2 py-1.5 text-left transition",
                      selected
                        ? "bg-[var(--felt)] text-white shadow-sm"
                        : "text-[var(--ink)] hover:bg-[var(--surface)]",
                    ].join(" ")}
                  >
                    <p
                      className={[
                        "text-[10px] font-semibold uppercase tracking-[0.12em]",
                        selected ? "text-white/75" : "text-[var(--muted)]",
                      ].join(" ")}
                    >
                      {side.label}
                      <span className="ml-1.5 tabular-nums">
                        {side.filled}/{slots}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-sm font-semibold leading-tight">
                      {side.teamName}
                    </p>
                  </button>
                );
              })}
            </div>

            <div
              className={mobileSide === "home" ? "min-w-0" : "hidden xl:block"}
            >
              <LineupPicker
                side="home"
                title={homeTeam.name}
                subtitle="Home · empty slots · drag ⠿ to reorder"
                roster={homeTeam.players}
                lineup={
                  homeLineup.length === slots
                    ? homeLineup
                    : emptyLineup(slots)
                }
                slots={slots}
                actions={
                  homeTeamId === prefs.teamId ? (
                    <LoadLineupMenu
                      presets={presetsFor(homeTeamId)}
                      onLoad={(preset) => applyPreset("home", preset)}
                    />
                  ) : undefined
                }
                onSelectSlot={(slotIndex, playerId) =>
                  setSlotPlayer("home", slotIndex, playerId)
                }
                onMove={(from, to) => moveInLineup("home", from, to)}
                dragState={dragState}
                dropTarget={dropTarget}
                setDragState={setDragState}
                setDropTarget={setDropTarget}
              />
            </div>

            <div
              className={mobileSide === "away" ? "min-w-0" : "hidden xl:block"}
            >
              <LineupPicker
                side="away"
                title={awayTeam.name}
                subtitle="Away · empty slots · drag ⠿ to reorder"
                roster={awayTeam.players}
                lineup={
                  awayLineup.length === slots
                    ? awayLineup
                    : emptyLineup(slots)
                }
                slots={slots}
                actions={
                  awayTeamId === prefs.teamId ? (
                    <LoadLineupMenu
                      presets={presetsFor(awayTeamId)}
                      onLoad={(preset) => applyPreset("away", preset)}
                    />
                  ) : undefined
                }
                onSelectSlot={(slotIndex, playerId) =>
                  setSlotPlayer("away", slotIndex, playerId)
                }
                onMove={(from, to) => moveInLineup("away", from, to)}
                dragState={dragState}
                dropTarget={dropTarget}
                setDragState={setDragState}
                setDropTarget={setDropTarget}
              />
            </div>
          </div>
        ) : null}
      </StepSection>

      <StepSection
        step={3}
        title="Scoresheet"
        summary={sheetSummary}
        open={openStep === 3}
        locked={!lineupsReady}
        lockedHint={`Fill all ${slots} slots on both sides`}
        onToggle={() => toggleStep(3)}
      >
        {lineupsReady && results && homeTeam && awayTeam ? (
          <ScoresheetPanel
            results={results}
            sheetFormat={sheetFormat}
            scoringFormat={scoringFormat}
            handicapType={data.format.fargoRateHandicapType}
            homeName={homeTeam.name}
            awayName={awayTeam.name}
            homePlayers={compactPlayers(homeLineup)}
            awayPlayers={compactPlayers(awayLineup)}
            roundTotals={roundTotals}
          />
        ) : null}
      </StepSection>
    </section>
  );
}

function ScoresheetPanel({
  results,
  sheetFormat,
  scoringFormat,
  handicapType,
  homeName,
  awayName,
  homePlayers,
  awayPlayers,
  roundTotals,
}: {
  results: RoundHandicapResult[];
  sheetFormat: ParsedMatchFormat;
  scoringFormat: LeagueScoringFormat;
  handicapType: string;
  homeName: string;
  awayName: string;
  homePlayers: RosterPlayer[];
  awayPlayers: RosterPlayer[];
  roundTotals: { home: number; away: number } | null;
}) {
  const chartMode = scoringFormat.raceMode === "fargo-race-chart";
  const matchWinMode = scoringFormat.teamPointMode === "match-win";
  const typeLabel = handicapTypeLabel(handicapType);
  const isFullMatch = /fullmatch/i.test(handicapType || "");
  const isMatchBased = !isFullMatch && /matchbased/i.test(handicapType || "");
  const flatMatchups = results.flatMap((result) => result.matchups);

  type SheetGame = {
    game: {
      homePlayers: number[];
      awayPlayers: number[];
      gameType: string;
      raceLength?: number | null;
    };
    matchup: (typeof flatMatchups)[number];
    gameIndex: number;
  };

  type SheetBlock = {
    key: string;
    title: string;
    result: RoundHandicapResult | null;
    games: SheetGame[];
  };

  const roundsForSheet: SheetBlock[] = (() => {
    if (!sheetFormat.rounds.length) {
      return results.map((result) => ({
        key: `result-${result.round}`,
        title:
          result.label ??
          (matchWinMode ? `Match ${result.round}` : `Round ${result.round}`),
        result,
        games: result.matchups.map((matchup, gameIndex) => ({
          game: {
            homePlayers: matchup.homeIndexes,
            awayPlayers: matchup.awayIndexes,
            gameType: matchup.gameType,
            raceLength: matchup.raceLength,
          },
          matchup,
          gameIndex,
        })),
      }));
    }

    let cursor = 0;
    return sheetFormat.rounds.map((round) => {
      const roundResult =
        !isFullMatch && !isMatchBased
          ? (results.find((item) => item.round === round.roundNumber) ?? null)
          : null;

      const games: SheetGame[] = round.games.map((game, gameIndex) => {
        const fromFlat = flatMatchups[cursor] ?? null;
        cursor += 1;
        const fromRound = roundResult?.matchups[gameIndex] ?? null;
        const matchup =
          fromRound ??
          fromFlat ??
          ({
            homeIndexes: game.homePlayers,
            awayIndexes: game.awayPlayers,
            homeRating: averageRating(homePlayers, game.homePlayers),
            awayRating: averageRating(awayPlayers, game.awayPlayers),
            gameType: game.gameType,
            raceLength: game.raceLength,
          } as (typeof flatMatchups)[number]);

        // MatchBased: attach that game’s result HC onto the matchup row.
        const matchResult = isMatchBased
          ? (results[cursor - 1] ?? null)
          : null;
        const annotated = matchResult
          ? {
              ...matchup,
              teamOneGames: matchResult.teamOne,
              teamTwoGames: matchResult.teamTwo,
            }
          : matchup;

        return { game, matchup: annotated, gameIndex };
      });

      return {
        key: `round-${round.roundNumber}`,
        title: matchWinMode
          ? `Match block ${round.roundNumber}`
          : `Round ${round.roundNumber}`,
        result: roundResult,
        games,
      };
    });
  })();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            {typeLabel}
            {chartMode ? " · race chart" : ""}
          </p>
          <p className="mt-0.5 font-[family-name:var(--font-display)] text-base font-semibold text-[var(--ink)]">
            {homeName}
            <span className="mx-1.5 text-[var(--muted)]">vs</span>
            {awayName}
          </p>
        </div>
        {roundTotals ? (
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              {chartMode ? "Edge" : "HC games"}
            </p>
            <p className="tabular-nums text-sm font-semibold text-[var(--felt-deep)]">
              H +{roundTotals.home} · A +{roundTotals.away}
            </p>
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        {roundsForSheet.map((block) => {
          const points = block.result
            ? Math.max(block.result.teamOne, block.result.teamTwo)
            : 0;
          const homeGets = (block.result?.teamOne ?? 0) > 0;
          const awayGets = (block.result?.teamTwo ?? 0) > 0;
          const recipient = homeGets ? homeName : awayGets ? awayName : null;

          return (
            <article
              key={block.key}
              className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]"
            >
              <div className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 sm:px-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--amber)]">
                    {block.title}
                  </p>
                  {block.result && !chartMode && !isMatchBased ? (
                    <p className="mt-0.5 truncate text-sm font-semibold text-[var(--felt-deep)]">
                      {points === 0
                        ? "Even — no games"
                        : `${recipient} gets +${points}`}
                    </p>
                  ) : null}
                  {block.result && (chartMode || isMatchBased) ? (
                    <p className="mt-0.5 truncate text-sm text-[var(--muted)]">
                      Exp {block.result.teamOneExpected.toFixed(1)} –{" "}
                      {block.result.teamTwoExpected.toFixed(1)}
                    </p>
                  ) : null}
                </div>
                {block.result && !chartMode && !isMatchBased ? (
                  <p className="tabular-nums text-xl font-semibold text-[var(--ink)]">
                    {points === 0 ? "0" : `+${points}`}
                  </p>
                ) : null}
              </div>

              <ul className="divide-y divide-[var(--line)]">
                {block.games.map(({ game, matchup, gameIndex }) => {
                  const race = resolveRaceDisplay({
                    scoringFormat,
                    matchup,
                    raceLength: game.raceLength,
                  });
                  const perGameHc =
                    matchup.teamOneGames != null || matchup.teamTwoGames != null
                      ? Math.max(
                          matchup.teamOneGames ?? 0,
                          matchup.teamTwoGames ?? 0,
                        )
                      : null;
                  const perGameSide =
                    (matchup.teamOneGames ?? 0) > 0
                      ? "H"
                      : (matchup.teamTwoGames ?? 0) > 0
                        ? "A"
                        : null;

                  return (
                    <li
                      key={`${block.key}-g${gameIndex}`}
                      className="px-3 py-2.5 sm:px-3.5"
                    >
                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                          G{gameIndex + 1}
                        </span>
                        <span className="rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ink)]">
                          {gameTypeLabel(matchup.gameType || game.gameType)}
                        </span>
                        {race ? (
                          <span className="rounded-md bg-[color-mix(in_srgb,var(--felt)_14%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--felt-deep)]">
                            {race}
                          </span>
                        ) : null}
                        {perGameHc != null ? (
                          <span className="rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--muted)]">
                            {perGameHc === 0
                              ? "HC even"
                              : `HC ${perGameSide}+${perGameHc}`}
                          </span>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[var(--ink)]">
                            {playerNames(matchup.homeIndexes, homePlayers)}
                          </p>
                          <p className="tabular-nums text-xs text-[var(--muted)]">
                            {Math.round(matchup.homeRating)}
                          </p>
                        </div>
                        <span
                          aria-hidden
                          className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]"
                        >
                          vs
                        </span>
                        <div className="min-w-0 text-right">
                          <p className="truncate text-sm font-medium text-[var(--ink)]">
                            {playerNames(matchup.awayIndexes, awayPlayers)}
                          </p>
                          <p className="tabular-nums text-xs text-[var(--muted)]">
                            {Math.round(matchup.awayRating)}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function averageRating(players: RosterPlayer[], indexes: number[]): number {
  if (!indexes.length) return 0;
  const ratings = indexes.map(
    (index) => players[index - 1]?.fargoRating ?? 0,
  );
  return ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
}

function resolveRaceDisplay({
  scoringFormat,
  matchup,
  raceLength,
}: {
  scoringFormat: LeagueScoringFormat;
  matchup: {
    homeRating: number;
    awayRating: number;
    raceLength?: number | null;
  };
  raceLength?: number | null;
}): string | null {
  if (scoringFormat.raceMode === "fargo-race-chart" && scoringFormat.raceChartId) {
    const targets = chartRaceTargets(
      scoringFormat.raceChartId,
      matchup.homeRating,
      matchup.awayRating,
    );
    return `Race ${targets.raceOne}–${targets.raceTwo}`;
  }
  const fromTemplate = raceLength ?? matchup.raceLength;
  if (fromTemplate != null && fromTemplate > 0) {
    return `Race to ${fromTemplate}`;
  }
  if (scoringFormat.raceMode === "fixed-race" && scoringFormat.fixedRaceWin) {
    const loss = scoringFormat.fixedRaceMaxLoss;
    return loss
      ? `Race to ${scoringFormat.fixedRaceWin} (max loss ${loss})`
      : `Race to ${scoringFormat.fixedRaceWin}`;
  }
  return null;
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
  actions,
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
  actions?: ReactNode;
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
    <div className="min-w-0 overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-sm sm:p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 overflow-hidden">
          <h4 className="truncate font-[family-name:var(--font-display)] text-lg text-[var(--felt-deep)]">
            {title}
          </h4>
          <p className="truncate text-xs text-[var(--muted)]">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {actions}
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
      </div>

      <ol
        ref={listRef}
        className="min-w-0 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]"
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
                transform: "scale(1.02) rotate(-0.8deg)",
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
