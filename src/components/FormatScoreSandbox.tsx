"use client";

import { useEffect, useMemo, useState } from "react";
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
  tallyDraft,
  tallyMatchPointsRound,
  type GameScoreState,
  type ScoringDraft,
  type ScoringPlayer,
} from "@/lib/scoring";
import {
  buildPreviewDraft,
  buildPreviewMatch,
  defaultPreviewRatings,
  gameKey,
  previewFormatSignature,
  previewHandicapLabel,
  previewHandicaps,
} from "@/lib/format-score-preview";

const btnGhost =
  "inline-flex items-center justify-center rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink)] disabled:opacity-50";
const inputClass =
  "w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-sm tabular-nums text-[var(--ink)] outline-none ring-[var(--felt)] focus:ring-2";

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
  onBump,
  onSet,
  onWin,
}: {
  label: string;
  score: number;
  raceTo: number;
  options: number[];
  isWinner: boolean;
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
            "text-lg font-semibold tabular-nums leading-none",
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
          className="rounded-md border border-[var(--line)] bg-[var(--surface)] py-1.5 text-sm font-semibold text-[var(--muted)] active:scale-[0.98]"
          onClick={() => onBump(-1)}
        >
          −
        </button>
        <select
          aria-label={`Score for ${label}`}
          className={inputClass}
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
          className="rounded-md border border-[var(--felt)]/40 bg-[color-mix(in_srgb,var(--felt)_18%,var(--surface))] py-1.5 text-sm font-semibold text-[var(--felt-deep)] active:scale-[0.98]"
          onClick={() => onBump(1)}
        >
          +
        </button>
      </div>
      <button
        type="button"
        onClick={onWin}
        className={[
          "w-full rounded-md py-1.5 text-[11px] font-semibold transition active:scale-[0.98]",
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

export function FormatScoreSandbox({
  picks,
  result,
}: {
  picks: FormatGeneratorPicks;
  result: FormatGeneratorResult;
}) {
  const n = result.model.playerCount;
  const defaults = useMemo(() => defaultPreviewRatings(n), [n]);
  const [homeRatings, setHomeRatings] = useState(defaults.home);
  const [awayRatings, setAwayRatings] = useState(defaults.away);
  const [activeRound, setActiveRound] = useState(1);
  const [expandedGame, setExpandedGame] = useState<number | null>(null);

  const signature = previewFormatSignature(picks, result);

  const match = useMemo(
    () =>
      buildPreviewMatch({
        picks,
        result,
        homeRatings,
        awayRatings,
      }),
    [picks, result, homeRatings, awayRatings],
  );

  const [draft, setDraft] = useState<ScoringDraft>(() =>
    buildPreviewDraft(match, result.scoringFormat),
  );

  // Reset scores when night shape changes; keep ratings.
  useEffect(() => {
    const nextMatch = buildPreviewMatch({
      picks,
      result,
      homeRatings,
      awayRatings,
    });
    setDraft(buildPreviewDraft(nextMatch, result.scoringFormat));
    setActiveRound(1);
    setExpandedGame(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reshape on format signature
  }, [signature]);

  // Keep lineup length / default ratings aligned with player count.
  useEffect(() => {
    setHomeRatings((prev) => {
      if (prev.length === n) return prev;
      const next = defaultPreviewRatings(n).home;
      return next.map((value, i) => prev[i] ?? value);
    });
    setAwayRatings((prev) => {
      if (prev.length === n) return prev;
      const next = defaultPreviewRatings(n).away;
      return next.map((value, i) => prev[i] ?? value);
    });
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
    setExpandedGame(null);
  };

  const setRating = (side: 1 | 2, index: number, value: number) => {
    const rating = Math.max(0, Math.min(900, Math.round(value) || 0));
    if (side === 1) {
      setHomeRatings((prev) => prev.map((item, i) => (i === index ? rating : item)));
    } else {
      setAwayRatings((prev) => prev.map((item, i) => (i === index ? rating : item)));
    }
  };

  const fullMatchHc =
    picks.fargoHc === "FullMatchBased" ? typedHc[0] ?? null : null;

  return (
    <div className="space-y-3">
      <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/50 px-3 py-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--ink)]">
              Score preview
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Local sandbox — {formatScoringSummary(scoringFormat)}. Try
              scoring like the Score tab; nothing is saved to LMS.
            </p>
          </div>
          <button type="button" className={btnGhost} onClick={resetScores}>
            Reset scores
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-[var(--line)] bg-[var(--surface-2)] px-3 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Home
            </p>
            <p className="font-[family-name:var(--font-display)] text-2xl font-semibold tabular-nums text-[var(--felt-deep)]">
              {nightHomeWins}
            </p>
          </div>
          <div className="text-center text-xs text-[var(--muted)]">
            <p className="font-semibold text-[var(--ink)]">
              {matchWinMode ? "Match wins" : "Round wins"}
            </p>
            <p className="mt-0.5">
              {winTally.scored}/{winTally.total} games
            </p>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Away
            </p>
            <p className="font-[family-name:var(--font-display)] text-2xl font-semibold tabular-nums text-[var(--felt-deep)]">
              {nightAwayWins}
            </p>
          </div>
        </div>

        {picks.fargoHc !== "none" ? (
          <div className="border-b border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)]">
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
          </div>
        ) : null}

        <div className="space-y-2 border-b border-[var(--line)] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Lineup Fargo (edit to change race / HC)
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              {homeRatings.map((rating, index) => (
                <label
                  key={`h-${index}`}
                  className="grid grid-cols-[2.5rem_1fr] items-center gap-2 text-xs"
                >
                  <span className="font-semibold text-[var(--muted)]">
                    H{index + 1}
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    className={inputClass}
                    value={rating}
                    onChange={(event) =>
                      setRating(1, index, Number(event.target.value))
                    }
                  />
                </label>
              ))}
            </div>
            <div className="space-y-1">
              {awayRatings.map((rating, index) => (
                <label
                  key={`a-${index}`}
                  className="grid grid-cols-[2.5rem_1fr] items-center gap-2 text-xs"
                >
                  <span className="font-semibold text-[var(--muted)]">
                    A{index + 1}
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    className={inputClass}
                    value={rating}
                    onChange={(event) =>
                      setRating(2, index, Number(event.target.value))
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3 px-3 py-3">
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
              const tally =
                roundTallies.find(
                  (item) => item.roundNumber === round.roundNumber,
                ) ?? null;
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
                    setExpandedGame(null);
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
                  setExpandedGame(null);
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
            <div className="grid grid-cols-2 gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/50 p-2.5">
              {([1, 2] as const).map((side) => {
                const total =
                  side === 1
                    ? activeRoundTally.teamOneTotal
                    : activeRoundTally.teamTwoTotal;
                const gamePoints =
                  side === 1
                    ? activeRoundTally.teamOneGamePoints
                    : activeRoundTally.teamTwoGamePoints;
                const hc =
                  side === 1
                    ? activeRoundTally.teamOneHandicap
                    : activeRoundTally.teamTwoHandicap;
                const won = activeRoundTally.roundWinner === side;
                return (
                  <div
                    key={side}
                    className={[
                      "rounded-md px-2 py-1.5",
                      won
                        ? "bg-[color-mix(in_srgb,var(--felt)_18%,transparent)]"
                        : "bg-[var(--surface)]",
                    ].join(" ")}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      {side === 1 ? "Home" : "Away"}
                      {isMatchPointsRound ? " · match pts" : ""}
                    </p>
                    <p className="font-[family-name:var(--font-display)] text-xl tabular-nums text-[var(--felt-deep)]">
                      {total}
                    </p>
                    <p className="text-[11px] tabular-nums text-[var(--muted)]">
                      {gamePoints} pts
                      {match.isHandicapped && picks.fargoHc === "RoundBased"
                        ? ` · +${hc} HC`
                        : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : null}

          {matchWinMode && !isMatchPointsRound ? (
            <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/40 px-3 py-2 text-xs text-[var(--muted)]">
              Each individual match win = {scoringFormat.pointsPerMatchWin}{" "}
              team point
              {scoringFormat.pointsPerMatchWin === 1 ? "" : "s"}
              {scoringFormat.raceMode === "fargo-race-chart"
                ? ` · ${raceChartMeta(scoringFormat.raceChartId ?? "r6-hot").label}`
                : ""}
              .
            </p>
          ) : null}

          {isMatchPointsRound ? (
            <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/40 px-3 py-2 text-xs text-[var(--muted)]">
              Totals is overall match points across all played rounds
              {fullMatchHc
                ? ` plus night HC (Home +${fullMatchHc.teamOne} / Away +${fullMatchHc.teamTwo})`
                : ""}
              — not an extra played round. Awarded when the other side can no
              longer catch up.
            </p>
          ) : (
            <div className="space-y-1.5">
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
                const open = expandedGame === game.index;
                const homeRace = limits.raceTargetOne ?? limits.maxWin;
                const awayRace = limits.raceTargetTwo ?? limits.maxWin;
                const homeOptions = raceScoreOptions(homeRace);
                const awayOptions = raceScoreOptions(awayRace);

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

                const applyScore = (side: 1 | 2, value: number) => {
                  updateGame(currentRound.roundNumber, game.index, (current) =>
                    applyRaceScore(current, side, value, {
                      maxScore: limits.maxWin,
                      maxLosingScore: limits.maxLoss,
                      raceTargetOne: limits.raceTargetOne,
                      raceTargetTwo: limits.raceTargetTwo,
                      allowedScores:
                        side === 1 ? homeOptions : awayOptions,
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
                        Math.min(
                          options.length - 1,
                          (idx >= 0 ? idx : 0) + delta,
                        ),
                      )
                    ] ?? current;
                  applyScore(side, next);
                };

                const markWin = (side: 1 | 2) => {
                  updateGame(currentRound.roundNumber, game.index, (current) =>
                    applyQuickWin(current, side, {
                      maxScore: limits.maxWin,
                      maxLosingScore: limits.maxLoss,
                      raceTargetOne: limits.raceTargetOne,
                      raceTargetTwo: limits.raceTargetTwo,
                    }),
                  );
                };

                return (
                  <div
                    key={key}
                    className={[
                      "overflow-hidden rounded-[var(--radius)] border",
                      status === "complete"
                        ? "border-[var(--felt)]/55 bg-[color-mix(in_srgb,var(--felt)_10%,var(--surface))]"
                        : status === "in-progress"
                          ? "border-[var(--amber)]/65 bg-[color-mix(in_srgb,var(--amber)_12%,var(--surface))]"
                          : "border-[var(--line)] bg-[var(--surface)]",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-2.5 py-2 text-left"
                      onClick={() =>
                        setExpandedGame((prev) =>
                          prev === game.index ? null : game.index,
                        )
                      }
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
                          {p1 ? playerDisplayName(p1) : `H${game.playerOne.index}`}
                        </p>
                        <p className="truncate text-[10px] text-[var(--muted)]">
                          {p1?.fargoRating ?? "—"}
                          {state?.breakingTeam === 1 ? " · Breaks" : ""}
                          {matchHcRow
                            ? ` · HC +${matchHcRow.teamOne}`
                            : ""}
                        </p>
                      </div>
                      <div className="rounded-md bg-[var(--surface-2)] px-2 py-1 text-center">
                        <p className="text-sm font-semibold tabular-nums">
                          {homeScore}–{awayScore}
                        </p>
                        <p className="text-[9px] uppercase tracking-[0.1em] text-[var(--muted)]">
                          {limits.chartMode
                            ? `${homeRace}–${awayRace}`
                            : `to ${limits.maxWin}`}
                        </p>
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
                          {p2 ? playerDisplayName(p2) : `A${game.playerTwo.index}`}
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

                    {open ? (
                      <div className="grid gap-3 border-t border-[var(--line)] px-2.5 py-2.5 sm:grid-cols-2">
                        <SideScoreControls
                          label={
                            p1
                              ? playerDisplayName(p1)
                              : `H${game.playerOne.index}`
                          }
                          score={homeScore}
                          raceTo={homeRace}
                          options={homeOptions}
                          isWinner={winner === 1}
                          onBump={(delta) => bump(1, delta)}
                          onSet={(value) => applyScore(1, value)}
                          onWin={() => markWin(1)}
                        />
                        <SideScoreControls
                          label={
                            p2
                              ? playerDisplayName(p2)
                              : `A${game.playerTwo.index}`
                          }
                          score={awayScore}
                          raceTo={awayRace}
                          options={awayOptions}
                          isWinner={winner === 2}
                          onBump={(delta) => bump(2, delta)}
                          onSet={(value) => applyScore(2, value)}
                          onWin={() => markWin(2)}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
