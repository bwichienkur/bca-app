"use client";

import { useEffect, useState } from "react";
import { normalizeTeamName } from "@/lib/matchups";
import type {
  DivisionTeam,
  PlayersByTeamReport,
  RosterPlayer,
  ScheduleMatch,
} from "@/lib/types";
import {
  IconSubTabs,
  RosterSubIcon,
  StandingSubIcon,
} from "./IconSubTabs";
import { TeamPlayerStats } from "./TeamPlayerStats";
import { BackButton } from "./BackButton";
import { SubTabCard } from "./SubTabCard";
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
  /** Bright / operator: jump to Score with this match’s scoresheet. */
  onOpenScoresheet?: () => void;
};

type MatchSide = "home" | "away";
type TeamPanelTab = "standing" | "players";

function displayTeamName(name: string): string {
  return name.replace(/^\((H|A)\)\s*/i, "").trim();
}

function playerLabel(player: RosterPlayer): string {
  return `${player.firstName} ${player.lastName}`.trim();
}

function MatchTeamPanel({
  teamName,
  team,
  playersByTeam,
  standingCells,
}: {
  teamName: string;
  team: DivisionTeam | null;
  playersByTeam: PlayersByTeamReport | null;
  standingCells: StandingCell[] | null;
}) {
  const statsTeam = playersByTeam?.teams.find(
    (item) => normalizeTeamName(item.team) === normalizeTeamName(teamName),
  );
  const hasPlayers = Boolean(statsTeam || team?.players.length);
  const defaultTab: TeamPanelTab = standingCells ? "standing" : "players";
  const [subTab, setSubTab] = useState<TeamPanelTab>(defaultTab);

  useEffect(() => {
    setSubTab(standingCells ? "standing" : "players");
  }, [teamName, standingCells]);

  return (
    <SubTabCard
      className="min-w-0 overflow-hidden"
      tabs={
        <IconSubTabs
          aria-label={`${teamName} sections`}
          value={subTab}
          onChange={setSubTab}
          className="rounded-none border-0 bg-transparent p-0"
          items={[
            { id: "standing", label: "Standing", icon: StandingSubIcon },
            { id: "players", label: "Players", icon: RosterSubIcon },
          ]}
        />
      }
    >
      {subTab === "standing" ? (
        standingCells ? (
          <TeamStandingSummary cells={standingCells} hideTeamName compact />
        ) : (
          <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-4 text-sm text-[var(--muted)]">
            Standing isn’t available for this team yet.
          </p>
        )
      ) : statsTeam && playersByTeam ? (
        <div className="min-w-0 overflow-x-auto">
          <TeamPlayerStats
            headers={playersByTeam.headers}
            rows={statsTeam.rows}
            roster={team?.players}
          />
        </div>
      ) : team ? (
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
      ) : (
        <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-4 text-sm text-[var(--muted)]">
          {hasPlayers
            ? "Stats for this team aren’t loaded yet."
            : "Player stats aren’t loaded yet."}
        </p>
      )}
    </SubTabCard>
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
  onOpenScoresheet,
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

  const active = sides.find((side) => side.id === mobileSide) ?? sides[0]!;
  const showScore = Boolean(onOpenScoresheet && match.matchId);

  return (
    <section className="animate-rise w-full min-w-0 space-y-3 overflow-x-hidden">
      <div className="flex items-center justify-between gap-3 px-3 pt-3 sm:px-4 sm:pt-4">
        <BackButton onClick={onClose} />
        {showScore ? (
          <button
            type="button"
            onClick={onOpenScoresheet}
            className="inline-flex shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white"
          >
            Score
          </button>
        ) : null}
      </div>

      <div className="space-y-3 px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow)] sm:p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--amber)]">
            {date}
          </p>
          <h3 className="mt-1 break-words font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--felt-deep)] sm:text-2xl">
            <span className="inline">{homeName}</span>
            <span className="mx-1.5 font-medium text-[var(--muted)]">vs</span>
            <span className="inline">{awayName}</span>
          </h3>
          {match.location ? (
            <p className="mt-1.5 text-sm text-[var(--muted)]">{match.location}</p>
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
            teamName={active.teamName}
            team={active.team}
            playersByTeam={playersByTeam}
            standingCells={active.standingCells}
          />
        </div>

        {/* Desktop / tablet: both teams side by side */}
        <div className="hidden min-w-0 gap-4 md:grid md:grid-cols-2">
          {sides.map((side) => (
            <MatchTeamPanel
              key={side.id}
              teamName={side.teamName}
              team={side.team}
              playersByTeam={playersByTeam}
              standingCells={side.standingCells}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
