"use client";

import { DataTable } from "./DataTable";
import type { DivisionTeam, PlayersByTeamReport, RosterPlayer } from "@/lib/types";

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
    (item) => item.team.trim().toLowerCase() === teamName.trim().toLowerCase(),
  );

  return (
    <aside className="animate-panel flex h-full flex-col rounded-[1.4rem] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
      <div className="border-b border-[var(--line)] px-4 py-4 md:px-5">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--line-strong)]"
          >
            <span aria-hidden>←</span>
            {backLabel}
          </button>
        ) : null}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
              {isMyTeam ? "My team" : "Team detail"}
            </p>
            <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--felt-deep)]">
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
          <button
            type="button"
            onClick={onSetAsMyTeam}
            className="mt-3 rounded-full bg-[var(--felt)] px-3 py-1.5 text-xs font-semibold text-white"
          >
            Set as my team
          </button>
        ) : null}
        {isMyTeam ? (
          <p className="mt-3 inline-flex rounded-full bg-[var(--felt)]/20 px-3 py-1.5 text-xs font-semibold text-[var(--felt-deep)]">
            My team ✓
          </p>
        ) : null}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 md:px-5">
        {statsTeam && playersByTeam ? (
          <section>
            <h4 className="mb-2 text-sm font-semibold text-[var(--ink)]">
              Player statistics
            </h4>
            <DataTable
              headers={playersByTeam.headers}
              rows={statsTeam.rows}
              stickyFirst
            />
          </section>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Player standings for this team aren’t loaded yet.
          </p>
        )}

        {team ? (
          <section>
            <h4 className="mb-2 text-sm font-semibold text-[var(--ink)]">
              Roster & ratings
            </h4>
            <ul className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]">
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
                  <span className="tabular-nums font-semibold text-[var(--felt)]">
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
