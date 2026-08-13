"use client";

import { memo } from "react";

export type MatchScoreboardProps = {
  dateLabel: string;
  location: string;
  teamOneName: string;
  teamTwoName: string;
  mySide: 1 | 2 | null;
  /** Round wins, or matchup-win race tally when matchWinTeamPoints. */
  roundWins: { teamOne: number; teamTwo: number };
  roundsAvailable: number;
  includeMatchPointsRound: boolean;
  matchWinTeamPoints?: boolean;
  /** First-to team matchup-win target (e.g. Beyond Teams race to 9). */
  teamRaceTo?: number | null;
  /**
   * Session points for the night (e.g. RDS×2 = 2 when the race is won).
   * When set with teamRaceTo, these are the hero numbers — not the race tally.
   */
  standingMatchPoints?: { teamOne: number; teamTwo: number } | null;
  /** Short hint under Session pts when shown (e.g. "RDS × 2"). */
  standingPtsHint?: string | null;
  formatHint?: string;
  pointTotals: { teamOne: number; teamTwo: number };
  gameWins: { teamOne: number; teamTwo: number };
  gamesPlayed: number;
  gamesTotal: number;
  isHandicapped: boolean;
  handicapTotals: { teamOne: number; teamTwo: number };
};

/** Big blue night scoreboard used on League Score and Format Score preview. */
export const MatchScoreboard = memo(function MatchScoreboard({
  dateLabel,
  location,
  teamOneName,
  teamTwoName,
  mySide,
  roundWins,
  roundsAvailable,
  includeMatchPointsRound: _includeMatchPointsRound,
  matchWinTeamPoints = false,
  teamRaceTo = null,
  standingMatchPoints = null,
  standingPtsHint = null,
  formatHint,
  pointTotals,
  gameWins,
  gamesPlayed,
  gamesTotal,
  isHandicapped,
  handicapTotals,
}: MatchScoreboardProps) {
  const roundsDecided = roundWins.teamOne + roundWins.teamTwo;
  const teamRaceTarget =
    matchWinTeamPoints && teamRaceTo != null && teamRaceTo > 0
      ? teamRaceTo
      : null;
  const showStandingHero =
    Boolean(teamRaceTarget) && standingMatchPoints != null;
  const heroAvailable = teamRaceTarget ?? roundsAvailable;
  const progress =
    teamRaceTarget != null
      ? Math.min(
          1,
          Math.max(roundWins.teamOne, roundWins.teamTwo) / teamRaceTarget,
        )
      : gamesTotal > 0
        ? Math.min(1, gamesPlayed / gamesTotal)
        : 0;

  const raceWinner: 1 | 2 | null = (() => {
    if (teamRaceTarget == null) return null;
    const oneHit = roundWins.teamOne >= teamRaceTarget;
    const twoHit = roundWins.teamTwo >= teamRaceTarget;
    if (oneHit && !twoHit) return 1;
    if (twoHit && !oneHit) return 2;
    if (oneHit && twoHit) {
      if (roundWins.teamOne === roundWins.teamTwo) return null;
      return roundWins.teamOne > roundWins.teamTwo ? 1 : 2;
    }
    return null;
  })();
  const winnerName =
    raceWinner === 1
      ? teamOneName.trim() || "Home"
      : raceWinner === 2
        ? teamTwoName.trim() || "Away"
        : null;

  const teamHeader = (side: 1 | 2, name: string, align: "left" | "right") => {
    const mine = mySide === side;
    const won = raceWinner === side;
    return (
      <div
        className={[
          "min-w-0",
          align === "right" ? "text-right" : "text-left",
        ].join(" ")}
      >
        <p className="font-[family-name:var(--font-display)] text-[15px] leading-snug break-words sm:text-lg">
          {name.trim()}
        </p>
        <p
          className={[
            "mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
            won
              ? "text-[var(--amber)]"
              : mine
                ? "text-[var(--amber)]"
                : "text-white/50",
          ].join(" ")}
        >
          {won ? "Winner" : mine ? "Your team" : side === 1 ? "Home" : "Away"}
        </p>
      </div>
    );
  };

  const metricRow = ({
    label,
    one,
    two,
    emphasis,
    hint,
  }: {
    label: string;
    one: number;
    two: number;
    emphasis: "hero" | "secondary" | "tertiary";
    hint?: string;
  }) => {
    const oneLeads = one > two;
    const twoLeads = two > one;
    const valueClass =
      emphasis === "hero"
        ? "font-[family-name:var(--font-display)] text-[2.35rem] leading-none tracking-tight sm:text-[2.75rem]"
        : emphasis === "secondary"
          ? "font-[family-name:var(--font-display)] text-[1.35rem] leading-none tabular-nums sm:text-[1.55rem]"
          : "text-sm font-semibold leading-none tabular-nums sm:text-[15px]";
    const leadClass = "text-white";
    const trailClass =
      emphasis === "hero" ? "text-white/70" : "text-white/55";
    const labelClass =
      emphasis === "hero"
        ? "text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--amber)]"
        : emphasis === "secondary"
          ? "text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55"
          : "text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40";

    return (
      <div
        className={[
          "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2",
          emphasis === "hero"
            ? "py-1"
            : emphasis === "secondary"
              ? "pt-2.5"
              : "pt-1.5",
        ].join(" ")}
      >
        <div className="min-w-0 text-right">
          <p
            className={[
              "tabular-nums",
              valueClass,
              oneLeads ? leadClass : trailClass,
            ].join(" ")}
          >
            {one}
          </p>
        </div>
        <div className="flex w-[4.5rem] flex-col items-center justify-center text-center sm:w-20">
          <p className={labelClass}>{label}</p>
          {hint ? (
            <p className="mt-0.5 text-[9px] tabular-nums text-white/40">
              {hint}
            </p>
          ) : null}
        </div>
        <div className="min-w-0 text-left">
          <p
            className={[
              "tabular-nums",
              valueClass,
              twoLeads ? leadClass : trailClass,
            ].join(" ")}
          >
            {two}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[linear-gradient(145deg,rgba(29,110,158,0.98),rgba(19,78,115,0.99))] px-3 py-3 text-white shadow-[var(--shadow)] sm:px-4 md:px-5 md:py-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[11px] uppercase tracking-[0.14em] text-white/60">
          {dateLabel}
          {location ? ` · ${location}` : ""}
        </p>
        {matchWinTeamPoints ? (
          <p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
            {teamRaceTarget ? `Race to ${teamRaceTarget}` : "Set wins"}
          </p>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {teamHeader(1, teamOneName, "left")}
        {teamHeader(2, teamTwoName, "right")}
      </div>

      <div className="mt-3 rounded-[var(--radius)] bg-black/30 px-2.5 py-2.5 ring-1 ring-white/10 sm:px-3.5 sm:py-3">
        {showStandingHero ? (
          <>
            {metricRow({
              label: "Session pts",
              one: standingMatchPoints!.teamOne,
              two: standingMatchPoints!.teamTwo,
              emphasis: "hero",
              hint: raceWinner
                ? standingPtsHint ?? "session"
                : standingPtsHint
                  ? `pending · ${standingPtsHint}`
                  : "pending",
            })}
            <div className="mx-auto mt-2 h-px w-[min(100%,16rem)] bg-gradient-to-r from-transparent via-white/18 to-transparent" />
            {metricRow({
              label: "Race",
              one: roundWins.teamOne,
              two: roundWins.teamTwo,
              emphasis: "secondary",
              hint: raceWinner
                ? "race complete"
                : `first to ${teamRaceTarget}`,
            })}
          </>
        ) : (
          metricRow({
            label: matchWinTeamPoints
              ? teamRaceTarget
                ? "Matchups"
                : "Set pts"
              : "Rounds",
            one: roundWins.teamOne,
            two: roundWins.teamTwo,
            emphasis: "hero",
            hint:
              heroAvailable > 0
                ? teamRaceTarget
                  ? raceWinner
                    ? "race complete"
                    : `first to ${teamRaceTarget}`
                  : `${roundsDecided}/${heroAvailable}`
                : undefined,
          })
        )}

        {matchWinTeamPoints && !teamRaceTarget ? (
          <>
            <div className="mx-auto mt-2 h-px w-[min(100%,16rem)] bg-gradient-to-r from-transparent via-white/18 to-transparent" />
            {metricRow({
              label: "Race games",
              one: pointTotals.teamOne,
              two: pointTotals.teamTwo,
              emphasis: "secondary",
            })}
          </>
        ) : null}

        {!matchWinTeamPoints ? (
          <>
            <div className="mx-auto mt-2 h-px w-[min(100%,16rem)] bg-gradient-to-r from-transparent via-white/18 to-transparent" />
            {metricRow({
              label: "Points",
              one: pointTotals.teamOne,
              two: pointTotals.teamTwo,
              emphasis: "secondary",
            })}
            {metricRow({
              label: "Games",
              one: gameWins.teamOne,
              two: gameWins.teamTwo,
              emphasis: "tertiary",
            })}
          </>
        ) : null}
      </div>

      {winnerName && teamRaceTarget ? (
        <div className="mt-2.5 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--amber)_22%,transparent)] px-3 py-2 text-center ring-1 ring-[color-mix(in_srgb,var(--amber)_45%,transparent)]">
          <p className="font-[family-name:var(--font-display)] text-base leading-tight text-white">
            {winnerName} wins the round
          </p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--amber)]">
            {showStandingHero && standingMatchPoints
              ? `${Math.max(standingMatchPoints.teamOne, standingMatchPoints.teamTwo)} session pts · remaining matchups locked`
              : `First to ${teamRaceTarget} · remaining matchups locked`}
          </p>
        </div>
      ) : null}

      <div className="mt-2.5 space-y-1.5">
        <div className="h-1 overflow-hidden rounded-full bg-black/35">
          <div
            className="h-full rounded-full bg-[color-mix(in_srgb,var(--amber)_75%,white)] transition-[width] duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[10px] tabular-nums text-white/55">
          <p>
            {gamesPlayed}/{gamesTotal} matchups scored
            {raceWinner ? " · clinched" : ""}
          </p>
          {isHandicapped &&
          (handicapTotals.teamOne > 0 || handicapTotals.teamTwo > 0) ? (
            <p>
              HC {handicapTotals.teamOne}–{handicapTotals.teamTwo}
            </p>
          ) : formatHint ? (
            <p className="truncate text-white/40">{formatHint}</p>
          ) : (
            <p className="text-white/35">Match scoreboard</p>
          )}
        </div>
      </div>
    </div>
  );
});
