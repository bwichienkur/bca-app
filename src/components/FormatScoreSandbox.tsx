"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  formatScoringSummary,
  padRaceLimits,
  raceScoreOptions,
} from "@/lib/division-scoring-config";
import type { FormatGeneratorPicks, FormatGeneratorResult } from "@/lib/format-generator";
import { raceChartMeta } from "@/lib/race-charts";
import {
  applyQuickWin,
  applyRaceScore,
  computeMatchHandicaps,
  gameWinner,
  MATCH_POINTS_ROUND,
  MATCH_POINTS_TAB_LABEL,
  playerDisplayName,
  tallyAllRoundPoints,
  tallyAllRoundsByGameWins,
  tallyDraft,
  tallyMatchPointsRound,
  teamRaceWinnerSide,
  type GameScoreState,
  type ScoringDraft,
  type ScoringPlayer,
} from "@/lib/scoring";
import {
  buildPreviewDraft,
  buildPreviewMatch,
  defaultPreviewSlots,
  gameKey,
  previewFormatSignature,
  previewHandicapLabel,
  previewHandicaps,
  resizePreviewSlots,
  tallyPlayerNight,
  type PlayerNightStat,
  type PreviewLineupSlot,
} from "@/lib/format-score-preview";
import {
  AccentRecordCard,
  accentRecordListClass,
} from "./AccentRecordCard";
import {
  IconSubTabs,
  LineupsSubIcon,
  MatchesSubIcon,
  StatsSubIcon,
} from "./IconSubTabs";
import { MatchScoreboard } from "./MatchScoreboard";
import { PartnerSearchField } from "./PartnerSearchField";
import { SubTabCard } from "./SubTabCard";

const btnGhost =
  "inline-flex items-center justify-center rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink)] disabled:opacity-50";
const inputClass =
  "w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-sm tabular-nums text-[var(--ink)] outline-none ring-[var(--felt)] focus:ring-2";

type PreviewPane = "lineup" | "scoring" | "performance";

function LineupSlotRow({
  label,
  slot,
  onChange,
}: {
  label: string;
  slot: PreviewLineupSlot;
  onChange: (next: PreviewLineupSlot) => void;
}) {
  return (
    <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_4.25rem] items-center gap-1.5">
      <span className="text-xs font-semibold text-[var(--muted)]">{label}</span>
      <PartnerSearchField
        compact
        hideLabel
        label={label}
        value={slot.pick}
        placeholder="Search name or Fargo ID…"
        onChange={(pick) => {
          const rating =
            pick.ratingAtSignup != null && Number.isFinite(pick.ratingAtSignup)
              ? Math.round(pick.ratingAtSignup)
              : slot.fargo;
          onChange({ pick, fargo: rating });
        }}
      />
      <input
        type="number"
        inputMode="numeric"
        aria-label={`${label} Fargo`}
        className={inputClass}
        value={slot.fargo}
        onChange={(event) =>
          onChange({
            ...slot,
            fargo: Math.max(
              0,
              Math.min(900, Math.round(Number(event.target.value) || 0)),
            ),
          })
        }
      />
    </div>
  );
}

function PerformancePlayerCard({ stat }: { stat: PlayerNightStat }) {
  const sideLabel = `${stat.side === 1 ? "H" : "A"}${stat.slotIndex}`;
  return (
    <AccentRecordCard>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--ink)]">
            <span className="mr-1.5 text-[var(--muted)]">{sideLabel}</span>
            {stat.name}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-[var(--muted)]">
            {stat.fargo != null ? `Fargo ${stat.fargo}` : "No Fargo"}
            {stat.games > 0 ? ` · ${stat.games} game${stat.games === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-[family-name:var(--font-display)] text-lg leading-none tabular-nums text-[var(--felt-deep)]">
            {stat.wins}-{stat.losses}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            {stat.points} pts
          </p>
        </div>
      </div>
    </AccentRecordCard>
  );
}

function PerformanceBoard({
  homeName,
  awayName,
  home,
  away,
}: {
  homeName: string;
  awayName: string;
  home: PlayerNightStat[];
  away: PlayerNightStat[];
}) {
  const column = (title: string, stats: PlayerNightStat[]) => (
    <div className="min-w-0 space-y-2">
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <p className="font-[family-name:var(--font-display)] text-base text-[var(--ink)]">
          {title}
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          W-L · pts
        </p>
      </div>
      <ul className={accentRecordListClass}>
        {stats.map((stat) => (
          <li key={stat.playerId}>
            <PerformancePlayerCard stat={stat} />
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {column(homeName, home)}
      {column(awayName, away)}
    </div>
  );
}

function findPlayer(
  players: ScoringPlayer[],
  id: string | null | undefined,
): ScoringPlayer | null {
  if (!id) return null;
  return players.find((player) => player.id === id) ?? null;
}

function SideScoreControls({
  label,
  score,
  raceTo,
  options,
  isWinner,
  disabled,
  onBump,
  onSet,
  onWin,
}: {
  label: string;
  score: number;
  raceTo: number;
  options: number[];
  isWinner: boolean;
  disabled?: boolean;
  onBump: (delta: number) => void;
  onSet: (value: number) => void;
  onWin: () => void;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-baseline justify-between gap-1">
        <p className="truncate text-xs font-semibold text-[var(--ink)]">
          {label}
        </p>
        <p
          className={[
            "text-base font-semibold tabular-nums leading-none",
            isWinner ? "text-[var(--felt-deep)]" : "text-[var(--ink)]",
          ].join(" ")}
        >
          {score}
          <span className="text-[11px] font-medium text-[var(--muted)]">
            /{raceTo}
          </span>
        </p>
      </div>
      <div className="grid grid-cols-3 gap-1">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={disabled}
          className="rounded-md border border-[var(--line)] bg-[var(--surface)] py-2 text-sm font-semibold text-[var(--muted)] active:scale-[0.98] disabled:opacity-45"
          onClick={() => onBump(-1)}
        >
          −
        </button>
        <select
          aria-label={`Score for ${label}`}
          className={inputClass}
          disabled={disabled}
          value={String(score)}
          onChange={(event) => onSet(Number(event.target.value) || 0)}
        >
          {options.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={disabled}
          className="rounded-md border border-[var(--felt)]/40 bg-[color-mix(in_srgb,var(--felt)_18%,var(--surface))] py-2 text-sm font-semibold text-[var(--felt-deep)] active:scale-[0.98] disabled:opacity-45"
          onClick={() => onBump(1)}
        >
          +
        </button>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onWin}
        className={[
          "w-full rounded-md py-2 text-[11px] font-semibold transition active:scale-[0.98] disabled:opacity-45",
          isWinner
            ? "bg-[var(--felt)] text-white"
            : "border border-[var(--felt)]/45 bg-[color-mix(in_srgb,var(--felt)_12%,transparent)] text-[var(--felt-deep)]",
        ].join(" ")}
      >
        {isWinner ? "Winner ✓" : "Mark winner"}
      </button>
    </div>
  );
}

function scoresEqual(a: GameScoreState, b: GameScoreState): boolean {
  return (
    (a.teamOneScore ?? 0) === (b.teamOneScore ?? 0) &&
    (a.teamTwoScore ?? 0) === (b.teamTwoScore ?? 0) &&
    (a.winAdornment ?? "") === (b.winAdornment ?? "") &&
    Boolean(a.isWinZip) === Boolean(b.isWinZip)
  );
}

function PreviewGamePad({
  open,
  roundNumber,
  gameIndex,
  homeName,
  awayName,
  homeRating,
  awayRating,
  initial,
  maxWin,
  maxLoss,
  raceTargetOne,
  raceTargetTwo,
  chartMode,
  readOnly,
  onClose,
  onSave,
}: {
  open: boolean;
  roundNumber: number;
  gameIndex: number;
  homeName: string;
  awayName: string;
  homeRating: number | null | undefined;
  awayRating: number | null | undefined;
  initial: GameScoreState;
  maxWin: number;
  maxLoss: number;
  raceTargetOne: number | null;
  raceTargetTwo: number | null;
  chartMode: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onSave: (next: GameScoreState) => void;
}) {
  const [local, setLocal] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [mounted, setMounted] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLocal(initial);
    setBaseline(initial);
    setDiscardOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resync on open/game only
  }, [open, roundNumber, gameIndex]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, local, baseline]);

  if (!open || !mounted) return null;

  const dirty = !scoresEqual(local, baseline);
  const homeRace = raceTargetOne ?? maxWin;
  const awayRace = raceTargetTwo ?? maxWin;
  const homeOptions = raceScoreOptions(homeRace);
  const awayOptions = raceScoreOptions(awayRace);
  const winner = gameWinner(local, {
    maxScore: maxWin,
    maxLosingScore: maxLoss,
    raceTargetOne,
    raceTargetTwo,
  });
  const homeScore = local.teamOneScore ?? 0;
  const awayScore = local.teamTwoScore ?? 0;

  const applyScore = (side: 1 | 2, value: number) => {
    if (readOnly) return;
    setLocal((prev) =>
      applyRaceScore(prev, side, value, {
        maxScore: maxWin,
        maxLosingScore: maxLoss,
        raceTargetOne,
        raceTargetTwo,
        allowedScores: side === 1 ? homeOptions : awayOptions,
      }),
    );
  };

  const bump = (side: 1 | 2, delta: number) => {
    const current = side === 1 ? homeScore : awayScore;
    const options = side === 1 ? homeOptions : awayOptions;
    const idx = options.indexOf(current);
    const next =
      options[
        Math.max(
          0,
          Math.min(options.length - 1, (idx >= 0 ? idx : 0) + delta),
        )
      ] ?? current;
    applyScore(side, next);
  };

  const markWin = (side: 1 | 2) => {
    if (readOnly) return;
    setLocal((prev) =>
      applyQuickWin(prev, side, {
        maxScore: maxWin,
        maxLosingScore: maxLoss,
        raceTargetOne,
        raceTargetTwo,
      }),
    );
  };

  const requestClose = () => {
    if (dirty && !readOnly) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  };

  const sheet = (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Round ${roundNumber} game ${gameIndex} score pad`}
    >
      <button
        type="button"
        aria-label="Dismiss score pad"
        className="absolute inset-0 bg-black/55"
        onClick={requestClose}
      />
      <div className="relative z-[1] flex max-h-[min(92vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.25rem] border border-[var(--line)] bg-[var(--paper-2)] shadow-[var(--shadow)] sm:rounded-[var(--radius)]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
                Round {roundNumber} · Game {gameIndex}
              </p>
              {dirty && !readOnly ? (
                <span className="rounded-md bg-[color-mix(in_srgb,var(--amber)_18%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--amber)]">
                  Unsaved
                </span>
              ) : null}
              {readOnly ? (
                <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Locked
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 font-[family-name:var(--font-display)] text-lg leading-tight text-[var(--felt-deep)]">
              {homeName}
              <span className="mx-1.5 text-[var(--muted)]">vs</span>
              {awayName}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {chartMode && raceTargetOne != null && raceTargetTwo != null
                ? `Race ${raceTargetOne}–${raceTargetTwo}`
                : maxWin <= 1
                  ? "Single game · W/L"
                  : `Race to ${maxWin}`}
              {homeRating != null || awayRating != null
                ? ` · ${homeRating ?? "—"} / ${awayRating ?? "—"}`
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close score pad"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-lg leading-none text-[var(--muted)]"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <SideScoreControls
              label={homeName}
              score={homeScore}
              raceTo={homeRace}
              options={homeOptions}
              isWinner={winner === 1}
              disabled={readOnly}
              onBump={(delta) => bump(1, delta)}
              onSet={(value) => applyScore(1, value)}
              onWin={() => markWin(1)}
            />
            <SideScoreControls
              label={awayName}
              score={awayScore}
              raceTo={awayRace}
              options={awayOptions}
              isWinner={winner === 2}
              disabled={readOnly}
              onBump={(delta) => bump(2, delta)}
              onSet={(value) => applyScore(2, value)}
              onWin={() => markWin(2)}
            />
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--line)] bg-[var(--paper-2)] px-4 py-3 pb-[calc(0.75rem+var(--safe-bottom))]">
          <button
            type="button"
            onClick={requestClose}
            className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-sm font-semibold text-[var(--ink)]"
          >
            {readOnly ? "Close" : "Exit"}
          </button>
          <button
            type="button"
            disabled={readOnly || !dirty}
            onClick={() => onSave(local)}
            className={[
              "rounded-[var(--radius)] px-3 py-3 text-sm font-semibold transition",
              !readOnly && dirty
                ? "bg-[var(--felt)] text-white"
                : "cursor-default border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]",
            ].join(" ")}
          >
            {readOnly ? "Locked" : dirty ? "Save" : "Saved ✓"}
          </button>
        </div>

        {discardOpen ? (
          <div className="absolute inset-0 z-[2] flex items-center justify-center bg-black/45 p-4">
            <div className="w-full max-w-sm rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow)]">
              <p className="text-sm font-semibold text-[var(--ink)]">
                Discard unsaved changes?
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Score edits for this game haven’t been saved.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => setDiscardOpen(false)}
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  className="rounded-[var(--radius)] border border-[var(--danger)]/45 bg-[color-mix(in_srgb,var(--danger)_12%,var(--surface))] px-2.5 py-1.5 text-xs font-semibold text-[var(--danger)]"
                  onClick={() => {
                    setDiscardOpen(false);
                    onClose();
                  }}
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}

export function FormatScoreSandbox({
  picks,
  result,
}: {
  picks: FormatGeneratorPicks;
  result: FormatGeneratorResult;
}) {
  const n = result.model.playerCount;
  const defaults = useMemo(() => defaultPreviewSlots(n), [n]);
  const [homeSlots, setHomeSlots] = useState(defaults.home);
  const [awaySlots, setAwaySlots] = useState(defaults.away);
  const [activeRound, setActiveRound] = useState(1);
  const [activeGame, setActiveGame] = useState<{
    roundNumber: number;
    gameIndex: number;
  } | null>(null);
  const [previewTab, setPreviewTab] = useState<PreviewPane>("scoring");

  const signature = previewFormatSignature(picks, result);

  const match = useMemo(
    () =>
      buildPreviewMatch({
        picks,
        result,
        homeSlots,
        awaySlots,
      }),
    [picks, result, homeSlots, awaySlots],
  );

  const [draft, setDraft] = useState<ScoringDraft>(() =>
    buildPreviewDraft(match, result.scoringFormat),
  );

  // Reset scores when night shape changes; keep lineup picks.
  useEffect(() => {
    const nextMatch = buildPreviewMatch({
      picks,
      result,
      homeSlots,
      awaySlots,
    });
    setDraft(buildPreviewDraft(nextMatch, result.scoringFormat));
    setActiveRound(1);
    setActiveGame(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reshape on format signature
  }, [signature]);

  // Keep lineup length aligned with player count.
  useEffect(() => {
    setHomeSlots((prev) =>
      prev.length === n ? prev : resizePreviewSlots(prev, n, "H"),
    );
    setAwaySlots((prev) =>
      prev.length === n ? prev : resizePreviewSlots(prev, n, "A"),
    );
  }, [n]);

  // Re-stamp race targets when ratings change without wiping scores.
  useEffect(() => {
    setDraft((prev) => {
      const withPlayers: ScoringDraft = {
        ...prev,
        matchId: match.id,
        teamOneLineup: match.teamOnePlayers.map((player) => player.id),
        teamTwoLineup: match.teamTwoPlayers.map((player) => player.id),
        games: { ...prev.games },
      };
      for (const round of match.matchFormat?.rounds ?? []) {
        for (const game of round.games) {
          const key = gameKey(round.roundNumber, game.index);
          const existing = withPlayers.games[key];
          if (!existing) continue;
          withPlayers.games[key] = {
            ...existing,
            teamOnePlayerId:
              match.teamOnePlayers[(game.playerOne.index || 1) - 1]?.id ?? null,
            teamTwoPlayerId:
              match.teamTwoPlayers[(game.playerTwo.index || 1) - 1]?.id ?? null,
          };
        }
      }
      // Rebuild through helper so fixed-race targets stay stamped.
      const stamped = buildPreviewDraft(match, result.scoringFormat);
      const games: ScoringDraft["games"] = { ...stamped.games };
      for (const [key, game] of Object.entries(games)) {
        const prior = withPlayers.games[key];
        if (!prior) continue;
        games[key] = {
          ...game,
          teamOneScore: prior.teamOneScore,
          teamTwoScore: prior.teamTwoScore,
          winAdornment: prior.winAdornment,
          isWinZip: prior.isWinZip,
        };
      }
      return {
        ...stamped,
        games,
        updatedAt: new Date().toISOString(),
      };
    });
  }, [match, result.scoringFormat]);

  const scoringFormat = result.scoringFormat;
  const matchWinMode = scoringFormat.teamPointMode === "match-win";
  const includeMatchPointsRound =
    scoringFormat.matchPointsRound && !matchWinMode;

  const roundBasedHc = useMemo(
    () => computeMatchHandicaps(match, draft),
    [match, draft],
  );
  const typedHc = useMemo(
    () => previewHandicaps(match, draft, picks.fargoHc),
    [match, draft, picks.fargoHc],
  );

  const roundTallies = useMemo(
    () =>
      tallyAllRoundPoints(
        match,
        draft,
        picks.fargoHc === "RoundBased" || picks.fargoHc === "none"
          ? roundBasedHc
          : picks.fargoHc === "FullMatchBased"
            ? []
            : roundBasedHc,
      ),
    [match, draft, picks.fargoHc, roundBasedHc],
  );

  const matchPointsTally = useMemo(
    () =>
      includeMatchPointsRound
        ? tallyMatchPointsRound({ match, draft, roundTallies })
        : null,
    [includeMatchPointsRound, match, draft, roundTallies],
  );

  const winTally = useMemo(() => tallyDraft(draft), [draft]);
  const matchWinRoundTallies = useMemo(
    () => (matchWinMode ? tallyAllRoundsByGameWins(match, draft) : []),
    [matchWinMode, match, draft],
  );
  const playerNight = useMemo(
    () => tallyPlayerNight(match, draft),
    [match, draft],
  );
  const rounds = match.matchFormat?.rounds ?? [];
  const isMatchPointsRound = activeRound === MATCH_POINTS_ROUND;
  const currentRound = rounds.find((round) => round.roundNumber === activeRound);
  const activeRoundTally =
    isMatchPointsRound
      ? matchPointsTally
      : roundTallies.find((item) => item.roundNumber === activeRound) ?? null;

  const nightHomeWins = matchWinMode
    ? winTally.teamOneWins
    : roundTallies.filter((item) => item.roundWinner === 1).length +
      (matchPointsTally?.roundWinner === 1 ? 1 : 0);
  const nightAwayWins = matchWinMode
    ? winTally.teamTwoWins
    : roundTallies.filter((item) => item.roundWinner === 2).length +
      (matchPointsTally?.roundWinner === 2 ? 1 : 0);

  const raceClinched = teamRaceWinnerSide(
    nightHomeWins,
    nightAwayWins,
    scoringFormat.teamRaceTo,
  );

  const pointTotals = useMemo(
    () =>
      matchWinMode
        ? {
            teamOne: winTally.teamOneWins,
            teamTwo: winTally.teamTwoWins,
          }
        : roundTallies.reduce(
            (acc, round) => ({
              teamOne: acc.teamOne + round.teamOneTotal,
              teamTwo: acc.teamTwo + round.teamTwoTotal,
            }),
            { teamOne: 0, teamTwo: 0 },
          ),
    [matchWinMode, roundTallies, winTally.teamOneWins, winTally.teamTwoWins],
  );

  const handicapTotals = useMemo(() => {
    if (picks.fargoHc === "none") return { teamOne: 0, teamTwo: 0 };
    if (picks.fargoHc === "FullMatchBased") {
      const row = typedHc[0];
      return {
        teamOne: row?.teamOne ?? 0,
        teamTwo: row?.teamTwo ?? 0,
      };
    }
    const rows =
      picks.fargoHc === "RoundBased" || picks.fargoHc === "MatchBased"
        ? typedHc
        : roundBasedHc;
    return rows.reduce(
      (acc, row) => ({
        teamOne: acc.teamOne + row.teamOne,
        teamTwo: acc.teamTwo + row.teamTwo,
      }),
      { teamOne: 0, teamTwo: 0 },
    );
  }, [picks.fargoHc, typedHc, roundBasedHc]);

  const roundsAvailable =
    rounds.length + (includeMatchPointsRound ? 1 : 0);

  const updateGame = (
    roundNumber: number,
    gameIndex: number,
    updater: (game: GameScoreState) => GameScoreState,
  ) => {
    const key = gameKey(roundNumber, gameIndex);
    setDraft((prev) => {
      const current = prev.games[key];
      if (!current) return prev;
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        games: {
          ...prev.games,
          [key]: updater(current),
        },
      };
    });
  };

  const resetScores = () => {
    setDraft(buildPreviewDraft(match, scoringFormat));
    setActiveGame(null);
  };

  const setHomeSlot = (index: number, next: PreviewLineupSlot) => {
    setHomeSlots((prev) => prev.map((slot, i) => (i === index ? next : slot)));
  };
  const setAwaySlot = (index: number, next: PreviewLineupSlot) => {
    setAwaySlots((prev) => prev.map((slot, i) => (i === index ? next : slot)));
  };

  const fullMatchHc =
    picks.fargoHc === "FullMatchBased" ? typedHc[0] ?? null : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--ink)]">
            Score preview
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Local sandbox — try scoring like the Score tab; nothing is saved.
          </p>
        </div>
        <button type="button" className={btnGhost} onClick={resetScores}>
          Reset scores
        </button>
      </div>

      <MatchScoreboard
        dateLabel="Preview"
        location={result.title}
        teamOneName="Home"
        teamTwoName="Away"
        mySide={null}
        roundWins={{ teamOne: nightHomeWins, teamTwo: nightAwayWins }}
        roundsAvailable={
          matchWinMode
            ? scoringFormat.teamRaceTo ??
              Math.max(winTally.total, rounds.length)
            : roundsAvailable
        }
        includeMatchPointsRound={includeMatchPointsRound}
        matchWinTeamPoints={matchWinMode}
        teamRaceTo={scoringFormat.teamRaceTo}
        standingMatchPoints={
          matchWinMode && scoringFormat.teamRaceTo
            ? {
                teamOne: raceClinched === 1 ? 2 : 0,
                teamTwo: raceClinched === 2 ? 2 : 0,
              }
            : null
        }
        standingPtsHint={
          matchWinMode && scoringFormat.teamRaceTo ? "RDS × 2" : null
        }
        formatHint={formatScoringSummary(scoringFormat)}
        pointTotals={pointTotals}
        gameWins={{
          teamOne: winTally.teamOneWins,
          teamTwo: winTally.teamTwoWins,
        }}
        gamesPlayed={winTally.scored}
        gamesTotal={winTally.total}
        isHandicapped={match.isHandicapped}
        handicapTotals={handicapTotals}
      />

      {picks.fargoHc !== "none" ? (
        <p className="text-[11px] text-[var(--muted)]">
          <span className="font-semibold text-[var(--ink)]">
            {previewHandicapLabel(picks.fargoHc)}
          </span>
          {" · "}
          {picks.handicapPercent}% · cap {picks.handicapCap}
          {fullMatchHc ? (
            <span className="ml-1 text-[var(--ink)]">
              · Night HC Home +{fullMatchHc.teamOne} / Away +
              {fullMatchHc.teamTwo}
            </span>
          ) : null}
        </p>
      ) : null}

      <SubTabCard
        tabs={
          <IconSubTabs
            aria-label="Score preview sections"
            value={previewTab}
            onChange={setPreviewTab}
            columns={3}
            className="border-0 bg-transparent p-0"
            items={[
              {
                id: "lineup" as const,
                label: "Lineup",
                icon: LineupsSubIcon,
              },
              {
                id: "scoring" as const,
                label: "Scoring",
                icon: MatchesSubIcon,
              },
              {
                id: "performance" as const,
                label: "Performance",
                icon: StatsSubIcon,
              },
            ]}
          />
        }
        contentClassName="p-3 sm:p-3.5"
      >
        {previewTab === "lineup" ? (
          <div className="space-y-2">
            <p className="text-xs text-[var(--muted)]">
              Set Home and Away slots — search FairMatch or edit Fargo ratings.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Home
                </p>
                {homeSlots.map((slot, index) => (
                  <LineupSlotRow
                    key={`h-${index}`}
                    label={`H${index + 1}`}
                    slot={slot}
                    onChange={(next) => setHomeSlot(index, next)}
                  />
                ))}
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Away
                </p>
                {awaySlots.map((slot, index) => (
                  <LineupSlotRow
                    key={`a-${index}`}
                    label={`A${index + 1}`}
                    slot={slot}
                    onChange={(next) => setAwaySlot(index, next)}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {previewTab === "performance" ? (
          <PerformanceBoard
            homeName="Home"
            awayName="Away"
            home={playerNight.home}
            away={playerNight.away}
          />
        ) : null}

        {previewTab === "scoring" ? (
          <div className="space-y-2.5">
            <div
              role="tablist"
              aria-label="Rounds"
              className="grid gap-0.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-0.5"
              style={{
                gridTemplateColumns: `repeat(${
                  rounds.length + (includeMatchPointsRound ? 1 : 0)
                }, minmax(0, 1fr))`,
              }}
            >
              {rounds.map((round) => {
                const pointsTally =
                  roundTallies.find(
                    (item) => item.roundNumber === round.roundNumber,
                  ) ?? null;
                const matchWinsTally =
                  matchWinRoundTallies.find(
                    (item) => item.roundNumber === round.roundNumber,
                  ) ?? null;
                const tally = matchWinMode ? matchWinsTally : pointsTally;
                const active = round.roundNumber === activeRound;
                const decided = tally?.roundWinner != null;
                return (
                  <button
                    key={round.roundNumber}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setActiveRound(round.roundNumber);
                      setActiveGame(null);
                    }}
                    className={[
                      "min-w-0 rounded-md px-1 py-1.5 text-center transition",
                      active
                        ? "bg-[var(--felt)] text-white shadow-sm"
                        : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
                    ].join(" ")}
                  >
                    <p className="text-[11px] font-semibold leading-none">
                      R{round.roundNumber}
                    </p>
                    <p
                      className={[
                        "mt-0.5 text-[10px] font-semibold tabular-nums leading-none",
                        active ? "text-white/85" : "",
                      ].join(" ")}
                    >
                      {decided
                        ? tally!.roundWinner === 1
                          ? "H"
                          : "A"
                        : `${tally?.gamesComplete ?? 0}/${round.games.length}`}
                    </p>
                  </button>
                );
              })}
              {includeMatchPointsRound && matchPointsTally ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={isMatchPointsRound}
                  onClick={() => {
                    setActiveRound(MATCH_POINTS_ROUND);
                    setActiveGame(null);
                  }}
                  className={[
                    "min-w-0 rounded-md px-1 py-1.5 text-center transition",
                    isMatchPointsRound
                      ? "bg-[var(--felt)] text-white shadow-sm"
                      : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
                  ].join(" ")}
                >
                  <p className="text-[11px] font-semibold leading-none">
                    {MATCH_POINTS_TAB_LABEL}
                  </p>
                  <p
                    className={[
                      "mt-0.5 text-[10px] font-semibold tabular-nums leading-none",
                      isMatchPointsRound ? "text-white/85" : "",
                    ].join(" ")}
                  >
                    {matchPointsTally.roundWinner
                      ? matchPointsTally.roundWinner === 1
                        ? "H"
                        : "A"
                      : `${matchPointsTally.gamesComplete}/${matchPointsTally.gamesTotal}`}
                  </p>
                </button>
              ) : null}
            </div>

            {activeRoundTally && !matchWinMode ? (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/50 px-2.5 py-2">
                <div className="min-w-0 text-left">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                    Home
                  </p>
                  <p
                    className={[
                      "font-[family-name:var(--font-display)] text-xl tabular-nums leading-none",
                      activeRoundTally.roundWinner === 1
                        ? "text-[var(--felt-deep)]"
                        : "text-[var(--ink)]",
                    ].join(" ")}
                  >
                    {activeRoundTally.teamOneTotal}
                  </p>
                  <p className="mt-0.5 text-[10px] tabular-nums text-[var(--muted)]">
                    {activeRoundTally.teamOneGamePoints}p
                    {match.isHandicapped && picks.fargoHc === "RoundBased"
                      ? ` · +${activeRoundTally.teamOneHandicap}`
                      : ""}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {isMatchPointsRound ? "Totals" : "Round"}
                  </p>
                </div>
                <div className="min-w-0 text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                    Away
                  </p>
                  <p
                    className={[
                      "font-[family-name:var(--font-display)] text-xl tabular-nums leading-none",
                      activeRoundTally.roundWinner === 2
                        ? "text-[var(--felt-deep)]"
                        : "text-[var(--ink)]",
                    ].join(" ")}
                  >
                    {activeRoundTally.teamTwoTotal}
                  </p>
                  <p className="mt-0.5 text-[10px] tabular-nums text-[var(--muted)]">
                    {activeRoundTally.teamTwoGamePoints}p
                    {match.isHandicapped && picks.fargoHc === "RoundBased"
                      ? ` · +${activeRoundTally.teamTwoHandicap}`
                      : ""}
                  </p>
                </div>
              </div>
            ) : null}

            {matchWinMode && !isMatchPointsRound ? (
              <p className="text-xs text-[var(--muted)]">
                {raceClinched
                  ? `${raceClinched === 1 ? "Home" : "Away"} won the round (2 session pts) — remaining unscored matchups are locked.`
                  : scoringFormat.teamRaceTo && scoringFormat.fixedRaceWin === 1
                    ? `Round-robin matchups · first to ${scoringFormat.teamRaceTo} wins the round (2 session pts). Tap a matchup to score.`
                    : scoringFormat.teamRaceTo
                      ? `Each matchup is one game · first team to ${scoringFormat.teamRaceTo} wins. Tap a matchup to score.`
                      : `Each set win = ${scoringFormat.pointsPerMatchWin} team point${scoringFormat.pointsPerMatchWin === 1 ? "" : "s"}${
                          scoringFormat.raceMode === "fargo-race-chart"
                            ? ` · ${raceChartMeta(scoringFormat.raceChartId ?? "r6-hot").label}`
                            : (scoringFormat.fixedRaceWin ?? 0) <= 1
                              ? " · single-game matchups"
                              : ""
                        }. Tap a matchup to score.`}
              </p>
            ) : null}

            {isMatchPointsRound ? (
              <p className="text-xs text-[var(--muted)]">
                Totals is overall match points across all played rounds
                {fullMatchHc
                  ? ` plus night HC (Home +${fullMatchHc.teamOne} / Away +${fullMatchHc.teamTwo})`
                  : ""}
                — not an extra played round. Awarded when the other side can no
                longer catch up.
              </p>
            ) : (
              <div className="space-y-1">
                {currentRound?.games.map((game) => {
                  const key = gameKey(currentRound.roundNumber, game.index);
                  const state = draft.games[key];
                  const p1 = findPlayer(
                    match.teamOnePlayers,
                    state?.teamOnePlayerId,
                  );
                  const p2 = findPlayer(
                    match.teamTwoPlayers,
                    state?.teamTwoPlayerId,
                  );
                  const limits = padRaceLimits(
                    scoringFormat,
                    match,
                    state?.raceTargetOne,
                    state?.raceTargetTwo,
                  );
                  const winnerOpts = {
                    maxScore: limits.maxWin,
                    maxLosingScore: limits.maxLoss,
                    raceTargetOne: limits.raceTargetOne,
                    raceTargetTwo: limits.raceTargetTwo,
                  };
                  const winner = gameWinner(state, winnerOpts);
                  const homeScore = state?.teamOneScore ?? 0;
                  const awayScore = state?.teamTwoScore ?? 0;
                  const status = winner
                    ? "complete"
                    : homeScore > 0 || awayScore > 0
                      ? "in-progress"
                      : "not-started";
                  const locked = Boolean(raceClinched && !winner);
                  const homeRace = limits.raceTargetOne ?? limits.maxWin;
                  const awayRace = limits.raceTargetTwo ?? limits.maxWin;

                  const matchHcRow =
                    picks.fargoHc === "MatchBased"
                      ? typedHc.find((row) =>
                          row.matchups.some(
                            (m) =>
                              m.homeIndexes[0] === game.playerOne.index &&
                              m.awayIndexes[0] === game.playerTwo.index,
                          ),
                        )
                      : null;

                  return (
                    <div
                      key={key}
                      className={[
                        "overflow-hidden rounded-[var(--radius)] border",
                        locked
                          ? "border-[var(--line)] bg-[var(--surface-2)]/40 opacity-70"
                          : status === "complete"
                            ? "border-[var(--felt)]/55 bg-[color-mix(in_srgb,var(--felt)_10%,var(--surface))]"
                            : status === "in-progress"
                              ? "border-[var(--amber)]/65 bg-[color-mix(in_srgb,var(--amber)_12%,var(--surface))]"
                              : "border-[var(--line)] bg-[var(--surface)]",
                      ].join(" ")}
                    >
                      <button
                        type="button"
                        disabled={locked}
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-2.5 py-1.5 text-left disabled:cursor-not-allowed"
                        onClick={() => {
                          if (locked || !state) return;
                          setActiveGame({
                            roundNumber: currentRound.roundNumber,
                            gameIndex: game.index,
                          });
                        }}
                      >
                        <div className="min-w-0">
                          <p
                            className={[
                              "truncate text-sm font-semibold",
                              winner === 1
                                ? "text-[var(--felt-deep)]"
                                : "text-[var(--ink)]",
                            ].join(" ")}
                          >
                            {p1
                              ? playerDisplayName(p1)
                              : `H${game.playerOne.index}`}
                          </p>
                          <p className="truncate text-[10px] text-[var(--muted)]">
                            {p1?.fargoRating ?? "—"}
                            {state?.breakingTeam === 1 ? " · Breaks" : ""}
                            {matchHcRow
                              ? ` · HC +${matchHcRow.teamOne}`
                              : ""}
                          </p>
                        </div>
                        <div className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-center">
                          {locked ? (
                            <>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                                Locked
                              </p>
                              <p className="text-[9px] uppercase tracking-[0.1em] text-[var(--muted)]">
                                Not needed
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-sm font-semibold tabular-nums">
                                {homeScore}–{awayScore}
                              </p>
                              <p className="text-[9px] uppercase tracking-[0.1em] text-[var(--muted)]">
                                {limits.chartMode
                                  ? `${homeRace}–${awayRace}`
                                  : limits.maxWin <= 1
                                    ? "W/L"
                                    : `to ${limits.maxWin}`}
                              </p>
                            </>
                          )}
                        </div>
                        <div className="min-w-0 text-right">
                          <p
                            className={[
                              "truncate text-sm font-semibold",
                              winner === 2
                                ? "text-[var(--felt-deep)]"
                                : "text-[var(--ink)]",
                            ].join(" ")}
                          >
                            {p2
                              ? playerDisplayName(p2)
                              : `A${game.playerTwo.index}`}
                          </p>
                          <p className="truncate text-[10px] text-[var(--muted)]">
                            {p2?.fargoRating ?? "—"}
                            {state?.breakingTeam === 2 ? " · Breaks" : ""}
                            {matchHcRow
                              ? ` · HC +${matchHcRow.teamTwo}`
                              : ""}
                          </p>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </SubTabCard>

      {activeGame && draft.games[gameKey(activeGame.roundNumber, activeGame.gameIndex)]
        ? (() => {
            const padState =
              draft.games[
                gameKey(activeGame.roundNumber, activeGame.gameIndex)
              ]!;
            const padLimits = padRaceLimits(
              scoringFormat,
              match,
              padState.raceTargetOne,
              padState.raceTargetTwo,
            );
            const padWinner = gameWinner(padState, {
              maxScore: padLimits.maxWin,
              maxLosingScore: padLimits.maxLoss,
              raceTargetOne: padLimits.raceTargetOne,
              raceTargetTwo: padLimits.raceTargetTwo,
            });
            const padLocked = Boolean(raceClinched && !padWinner);
            const p1 = findPlayer(
              match.teamOnePlayers,
              padState.teamOnePlayerId,
            );
            const p2 = findPlayer(
              match.teamTwoPlayers,
              padState.teamTwoPlayerId,
            );
            return (
              <PreviewGamePad
                open
                roundNumber={activeGame.roundNumber}
                gameIndex={activeGame.gameIndex}
                homeName={
                  p1
                    ? playerDisplayName(p1)
                    : `Home ${padState.teamOnePlayerId ?? ""}`
                }
                awayName={
                  p2
                    ? playerDisplayName(p2)
                    : `Away ${padState.teamTwoPlayerId ?? ""}`
                }
                homeRating={p1?.fargoRating}
                awayRating={p2?.fargoRating}
                initial={padState}
                maxWin={padLimits.maxWin}
                maxLoss={padLimits.maxLoss}
                raceTargetOne={padLimits.raceTargetOne}
                raceTargetTwo={padLimits.raceTargetTwo}
                chartMode={padLimits.chartMode}
                readOnly={padLocked}
                onClose={() => setActiveGame(null)}
                onSave={(next) => {
                  if (padLocked) return;
                  updateGame(
                    activeGame.roundNumber,
                    activeGame.gameIndex,
                    () => next,
                  );
                  setActiveGame(null);
                }}
              />
            );
          })()
        : null}
    </div>
  );
}
