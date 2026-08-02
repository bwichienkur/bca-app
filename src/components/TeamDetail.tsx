"use client";

import { normalizeTeamName } from "@/lib/matchups";
import type { DivisionTeam, PlayersByTeamReport, RosterPlayer } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { StatBadge } from "@/components/ui/StatBadge";
import { TeamPlayerStats } from "./TeamPlayerStats";

type TeamDetailProps = {
  teamName: string;
  team: DivisionTeam | null;
  playersByTeam: PlayersByTeamReport | null;
  onClose?: () => void;
  /** Label for the back/close control (e.g. “Back to standings”) */
  backLabel?: string;
  onSetAsMyTeam?: () => void;
  isMyTeam?: boolean;
};

function playerLabel(player: RosterPlayer): string {
  return `${player.firstName} ${player.lastName}`.trim();
}

export function TeamDetail({
  teamName,
  team,
  playersByTeam,
  onClose,
  backLabel = "Back",
  onSetAsMyTeam,
  isMyTeam,
}: TeamDetailProps) {
  const statsTeam = playersByTeam?.teams.find(
    (item) =>
      normalizeTeamName(item.team) === normalizeTeamName(teamName),
  );

  return (
    <aside className="animate-panel ui-glass flex h-full flex-col overflow-hidden rounded-[var(--radius)] shadow-[var(--shadow)]">
      <div className="border-b border-[var(--line)] bg-[linear-gradient(135deg,rgba(91,140,255,0.1),transparent_55%)] px-4 py-5 md:px-6">
        {onClose ? (
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="mb-4 !rounded-full !px-3 !py-1.5 !text-xs"
          >
            <span aria-hidden>←</span>
            {backLabel}
          </Button>
        ) : null}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
              {isMyTeam ? "My team" : "Team detail"}
            </p>
            <h3 className="mt-2 font-[family-name:var(--font-display)] text-2xl tracking-tight text-[var(--ink)] md:text-3xl">
              {teamName}
            </h3>
            {team ? (
              <p className="mt-1 text-sm text-[var(--muted)]">
                {team.players.length} rostered · avg Fargo{" "}
                {team.players.length
                  ? Math.round(
                      team.players.reduce((sum, p) => sum + p.fargoRating, 0) /
                        team.players.length,
                    )
                  : "—"}
              </p>
            ) : null}
          </div>
        </div>
        {onSetAsMyTeam && !isMyTeam ? (
          <Button
            type="button"
            onClick={onSetAsMyTeam}
            className="mt-4 !rounded-full !px-3.5 !py-1.5 !text-xs"
          >
            Set as my team
          </Button>
        ) : null}
        {isMyTeam ? (
          <div className="mt-4">
            <StatBadge tone="primary">My team ✓</StatBadge>
          </div>
        ) : null}
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5 md:px-6">
        {statsTeam && playersByTeam ? (
          <section>
            <div className="mb-3 px-1">
              <h4 className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
                Player statistics
              </h4>
            </div>
            <TeamPlayerStats
              headers={playersByTeam.headers}
              rows={statsTeam.rows}
              roster={team?.players}
            />
          </section>
        ) : (
          <p className="px-1 text-sm text-[var(--muted)]">
            Player standings for this team aren’t loaded yet.
          </p>
        )}

        {team && !statsTeam ? (
          <section className="px-1">
            <h4 className="mb-2 text-sm font-semibold text-[var(--ink)]">
              Roster & ratings
            </h4>
            <ul className="ui-card divide-y divide-[var(--line)] overflow-hidden">
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
                      {player.robustness
                        ? ` · robust ${player.robustness}`
                        : ""}
                    </p>
                  </div>
                  <span className="tabular-nums font-semibold text-[var(--chalk)]">
                    {player.fargoRating}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
