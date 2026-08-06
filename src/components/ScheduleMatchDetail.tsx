"use client";

import { useEffect, useState } from "react";
import { normalizeTeamName } from "@/lib/matchups";
import type {
  DivisionTeam,
  PlayersByTeamReport,
  RosterPlayer,
  ScheduleMatch,
} from "@/lib/types";
import { TeamPlayerStats } from "./TeamPlayerStats";
import { BackButton } from "./BackButton";
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

type MatchSide = "home" | "away";

function displayTeamName(name: string): string {
  return name.replace(/^\((H|A)\)\s*/i, "").trim();
}

function playerLabel(player: RosterPlayer): string {
  return `${player.firstName} ${player.lastName}`.trim();
}

function avgFargo(team: DivisionTeam | null): string {
  if (!team?.players.length) return "—";
  return String(
    Math.round(
      team.players.reduce((sum, player) => sum + player.fargoRating, 0) /
        team.players.length,
    ),
  );
}

function MatchTeamPanel({
  sideLabel,
  teamName,
  team,
  playersByTeam,
  standingCells,
  isMyTeam,
}: {
  sideLabel: string;
  teamName: string;
  team: DivisionTeam | null;
  playersByTeam: PlayersByTeamReport | null;
  standingCells: StandingCell[] | null;
  isMyTeam: boolean;
}) {
  const statsTeam = playersByTeam?.teams.find(
    (item) => normalizeTeamName(item.team) === normalizeTeamName(teamName),
  );

  return (
    <article className="min-w-0 overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-sm">
      <div className="border-b border-[var(--line)] bg-[linear-gradient(135deg,rgba(29,110,158,0.16),transparent_55%)] px-3 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              {sideLabel}
              {isMyTeam ? " · My team" : ""}
            </p>
            <h4 className="mt-0.5 break-words font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--felt-deep)]">
              {teamName}
            </h4>
            {team ? (
              <p className="mt-1 text-xs text-[var(--muted)]">
                {team.players.length} rostered · avg Fargo {avgFargo(team)}
              </p>
            ) : null}
          </div>
          {isMyTeam ? (
            <span className="shrink-0 rounded-full bg-[var(--felt)]/20 px-2.5 py-1 text-[11px] font-semibold text-[var(--felt-deep)]">
              My team ✓
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 p-3">
        {standingCells ? (
          <TeamStandingSummary
            cells={standingCells}
            teamName={teamName}
            compact
          />
        ) : null}

        {statsTeam && playersByTeam ? (
          <section className="min-w-0">
            <h5 className="mb-2 px-0.5 text-sm font-semibold text-[var(--ink)]">
              Player statistics
            </h5>
            <div className="min-w-0 overflow-x-auto">
              <TeamPlayerStats
                headers={playersByTeam.headers}
                rows={statsTeam.rows}
                roster={team?.players}
              />
            </div>
          </section>
        ) : team ? (
          <section>
            <h5 className="mb-2 text-sm font-semibold text-[var(--ink)]">
              Roster & ratings
            </h5>
            <ul className="divide-y divide-[var(--line)] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]">
              {team.players.map((player) => (
                <li
                  key={player.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <p className="min-w-0 truncate font-medium text-[var(--ink)]">
                    {playerLabel(player)}
                  </p>
                  <span className="shrink-0 tabular-nums font-semibold text-[var(--felt)]">
                    {player.fargoRating}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Stats for this team aren’t loaded yet.
          </p>
        )}
      </div>
    </article>
  );
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
  const homeIsMine = Boolean(myNorm) && normalizeTeamName(homeName) === myNorm;
  const awayIsMine = Boolean(myNorm) && normalizeTeamName(awayName) === myNorm;

  const [mobileSide, setMobileSide] = useState<MatchSide>("home");

  useEffect(() => {
    setMobileSide(awayIsMine && !homeIsMine ? "away" : "home");
  }, [match.matchId, match.home, match.away, awayIsMine, homeIsMine]);

  const sides: {
    id: MatchSide;
    label: string;
    teamName: string;
    team: DivisionTeam | null;
    standingCells: StandingCell[] | null;
    isMyTeam: boolean;
  }[] = [
    {
      id: "home",
      label: "Home",
      teamName: homeName,
      team: homeTeam,
      standingCells: homeStandingCells,
      isMyTeam: homeIsMine,
    },
    {
      id: "away",
      label: "Away",
      teamName: awayName,
      team: awayTeam,
      standingCells: awayStandingCells,
      isMyTeam: awayIsMine,
    },
  ];

  const active = sides.find((side) => side.id === mobileSide) ?? sides[0];

  return (
    <section className="animate-rise mx-auto w-full max-w-6xl space-y-3 md:space-y-4">
      <div className="min-w-0">
        <BackButton onClick={onClose} className="mb-2 md:mb-3" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
          {date}
        </p>
        <h3 className="mt-1 break-words font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--felt-deep)] sm:text-2xl md:text-3xl">
          <span className="inline">{homeName}</span>
          <span className="mx-1.5 text-[var(--muted)]">vs</span>
          <span className="inline">{awayName}</span>
        </h3>
        {match.location ? (
          <p className="mt-1 text-sm text-[var(--muted)]">{match.location}</p>
        ) : null}
      </div>

      {/* Mobile: one team at a time so content fits the viewport width */}
      <div className="space-y-3 md:hidden">
        <div
          role="tablist"
          aria-label="Match teams"
          className="grid grid-cols-2 gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-1"
        >
          {sides.map((side) => {
            const selected = mobileSide === side.id;
            return (
              <button
                key={side.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setMobileSide(side.id)}
                className={[
                  "min-w-0 rounded-[var(--radius)] px-2.5 py-2.5 text-left transition",
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
                  {side.isMyTeam ? " · Mine" : ""}
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold leading-tight">
                  {side.teamName}
                </p>
              </button>
            );
          })}
        </div>

        <MatchTeamPanel
          sideLabel={active.label}
          teamName={active.teamName}
          team={active.team}
          playersByTeam={playersByTeam}
          standingCells={active.standingCells}
          isMyTeam={active.isMyTeam}
        />
      </div>

      {/* Desktop / tablet: both teams side by side */}
      <div className="hidden min-w-0 gap-4 md:grid md:grid-cols-2">
        {sides.map((side) => (
          <MatchTeamPanel
            key={side.id}
            sideLabel={side.label}
            teamName={side.teamName}
            team={side.team}
            playersByTeam={playersByTeam}
            standingCells={side.standingCells}
            isMyTeam={side.isMyTeam}
          />
        ))}
      </div>
    </section>
  );
}
