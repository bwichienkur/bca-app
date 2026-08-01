"use client";

import { normalizeTeamName } from "@/lib/matchups";
import type {
  DivisionTeam,
  PlayersByTeamReport,
  ScheduleMatch,
} from "@/lib/types";
import { TeamDetail } from "./TeamDetail";
import { TeamStandingSummary } from "./TeamStandingSummary";

type StandingCell = {
  label: string;
  value: string;
};

type ScheduleMatchDetailProps = {
  date: string;
  match: ScheduleMatch;
  homeTeam: DivisionTeam | null;
  awayTeam: DivisionTeam | null;
  playersByTeam: PlayersByTeamReport | null;
  homeStandingCells: StandingCell[] | null;
  awayStandingCells: StandingCell[] | null;
  myTeamName?: string | null;
  onClose: () => void;
};

function displayTeamName(name: string): string {
  return name.replace(/^\((H|A)\)\s*/i, "").trim();
}

export function ScheduleMatchDetail({
  date,
  match,
  homeTeam,
  awayTeam,
  playersByTeam,
  homeStandingCells,
  awayStandingCells,
  myTeamName,
  onClose,
}: ScheduleMatchDetailProps) {
  const homeName = homeTeam?.name ?? displayTeamName(match.home);
  const awayName = awayTeam?.name ?? displayTeamName(match.away);
  const myNorm = normalizeTeamName(myTeamName ?? "");

  return (
    <section className="animate-rise space-y-4">
      <div>
        <button
          type="button"
          onClick={onClose}
          className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--line-strong)]"
        >
          <span aria-hidden>←</span>
          Back to schedule
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
          {date}
        </p>
        <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--felt-deep)] md:text-3xl">
          {homeName}{" "}
          <span className="text-[var(--muted)]">vs</span> {awayName}
        </h3>
        {match.location ? (
          <p className="mt-1 text-sm text-[var(--muted)]">{match.location}</p>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-3">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Home
          </p>
          {homeStandingCells ? (
            <TeamStandingSummary cells={homeStandingCells} teamName={homeName} />
          ) : null}
          <TeamDetail
            teamName={homeName}
            team={homeTeam}
            playersByTeam={playersByTeam}
            isMyTeam={
              Boolean(myNorm) && normalizeTeamName(homeName) === myNorm
            }
          />
        </div>
        <div className="space-y-3">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Away
          </p>
          {awayStandingCells ? (
            <TeamStandingSummary cells={awayStandingCells} teamName={awayName} />
          ) : null}
          <TeamDetail
            teamName={awayName}
            team={awayTeam}
            playersByTeam={playersByTeam}
            isMyTeam={
              Boolean(myNorm) && normalizeTeamName(awayName) === myNorm
            }
          />
        </div>
      </div>
    </section>
  );
}
