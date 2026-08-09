"use client";

import { normalizeTeamName } from "@/lib/matchups";
import type { DivisionTeam, PlayersByTeamReport, RosterPlayer } from "@/lib/types";
import { BackButton } from "./BackButton";
import { PanelHeader, PanelHeaderCount } from "./PanelHeader";
import { TeamPlayerStats } from "./TeamPlayerStats";

type TeamDetailProps = {
  teamName: string;
  team: DivisionTeam | null;
  playersByTeam: PlayersByTeamReport | null;
  onClose?: () => void;
  onSetAsMyTeam?: () => void;
  isMyTeam?: boolean;
  /**
   * My Team tab context: omit the branded team header (title lives on the
   * section card above). Standings drill-in keeps its own header card.
   */
  embedded?: boolean;
};

function playerLabel(player: RosterPlayer): string {
  return `${player.firstName} ${player.lastName}`.trim();
}

export function TeamDetail({
  teamName,
  team,
  playersByTeam,
  onClose,
  onSetAsMyTeam,
  isMyTeam,
  embedded = false,
}: TeamDetailProps) {
  const statsTeam = playersByTeam?.teams.find(
    (item) =>
      normalizeTeamName(item.team) === normalizeTeamName(teamName),
  );

  const avg =
    team && team.players.length
      ? Math.round(
          team.players.reduce((sum, player) => sum + player.fargoRating, 0) /
            team.players.length,
        )
      : null;

  const stats = (
    <div className="min-w-0">
      {statsTeam && playersByTeam ? (
        <TeamPlayerStats
          headers={playersByTeam.headers}
          rows={statsTeam.rows}
          roster={team?.players}
        />
      ) : (
        <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--muted)] shadow-[var(--shadow)]">
          Player standings for this team aren’t loaded yet.
        </p>
      )}

      {team && !statsTeam ? (
        <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
          {team.players.map((player) => (
            <li
              key={player.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
            >
              <div>
                <p className="font-medium text-[var(--ink)]">
                  {playerLabel(player)}
                </p>
                <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
                  {player.teamName}
                  {player.robustness ? ` · robust ${player.robustness}` : ""}
                </p>
              </div>
              <span className="tabular-nums font-semibold text-[var(--felt)]">
                {player.fargoRating}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );

  if (embedded) {
    return stats;
  }

  return (
    <div className="space-y-3">
      {onClose ? <BackButton onClick={onClose} /> : null}

      <PanelHeader
        title={teamName}
        description={
          team
            ? `${isMyTeam ? "My team · " : ""}${team.players.length} rostered${avg != null ? ` · avg Fargo ${avg}` : ""}`
            : isMyTeam
              ? "My team"
              : "Team detail"
        }
        action={
          team?.players.length ? (
            <PanelHeaderCount
              label="Players"
              value={String(team.players.length)}
            />
          ) : onSetAsMyTeam && !isMyTeam ? (
            <button
              type="button"
              onClick={onSetAsMyTeam}
              className="rounded-[var(--radius)] bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white"
            >
              Set as my team
            </button>
          ) : undefined
        }
      />
      {onSetAsMyTeam && !isMyTeam && team?.players.length ? (
        <button
          type="button"
          onClick={onSetAsMyTeam}
          className="rounded-[var(--radius)] bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white"
        >
          Set as my team
        </button>
      ) : null}

      {stats}
    </div>
  );
}
