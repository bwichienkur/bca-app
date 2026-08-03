"use client";

import { normalizeTeamName } from "@/lib/matchups";
import type { DivisionTeam, PlayersByTeamReport, RosterPlayer } from "@/lib/types";
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
  /**
   * My Team tab context: omit the branded team header (name already lives
   * on the page context card). Standings drill-in keeps the full header.
   */
  embedded?: boolean;
  /** When embedded inside SectionCard, flush the stats grid to the shell. */
  flushStats?: boolean;
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
  embedded = false,
  flushStats = false,
}: TeamDetailProps) {
  const statsTeam = playersByTeam?.teams.find(
    (item) =>
      normalizeTeamName(item.team) === normalizeTeamName(teamName),
  );

  const useFlushStats = flushStats || !embedded;

  const body = (
    <div
      className={[
        "flex-1 overflow-y-auto",
        useFlushStats
          ? "min-w-0"
          : embedded
            ? "space-y-5 pt-1"
            : "space-y-5 px-3 py-4 md:px-5",
      ].join(" ")}
    >
      {statsTeam && playersByTeam ? (
        <section>
          <TeamPlayerStats
            headers={playersByTeam.headers}
            rows={statsTeam.rows}
            roster={team?.players}
            flush={useFlushStats}
          />
        </section>
      ) : (
        <p
          className={[
            "text-sm text-[var(--muted)]",
            useFlushStats ? "px-4 py-6" : "px-1",
          ].join(" ")}
        >
          Player standings for this team aren’t loaded yet.
        </p>
      )}

      {team && !statsTeam ? (
        <section className={useFlushStats ? "p-3 sm:p-4" : "px-1"}>
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
  );

  if (embedded) {
    return <div className="min-w-0">{body}</div>;
  }

  const avg =
    team && team.players.length
      ? Math.round(
          team.players.reduce((sum, player) => sum + player.fargoRating, 0) /
            team.players.length,
        )
      : null;

  return (
    <aside className="flex h-full flex-col overflow-hidden rounded-[1.35rem] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
      <div className="relative overflow-hidden bg-[linear-gradient(145deg,rgba(29,110,158,0.98),rgba(19,78,115,0.96))] px-4 py-4 text-white sm:px-5 sm:py-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(120% 80% at 100% 0%, rgba(224,163,90,0.28), transparent 55%)",
          }}
        />
        <div className="relative">
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/20 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black/30"
            >
              <span aria-hidden>←</span>
              {backLabel}
            </button>
          ) : null}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/65">
                {isMyTeam ? "My team" : "Team detail"}
              </p>
              <h3 className="mt-1.5 break-words font-[family-name:var(--font-display)] text-2xl font-semibold leading-[1.15] tracking-tight text-white sm:text-3xl">
                {teamName}
              </h3>
              {team ? (
                <p className="mt-2 text-xs text-white/70">
                  {team.players.length} rostered
                  {avg != null ? ` · avg Fargo ${avg}` : ""}
                </p>
              ) : null}
            </div>
            {team?.players.length ? (
              <div className="shrink-0 rounded-2xl bg-black/25 px-3.5 py-2.5 text-center ring-1 ring-white/15">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/65">
                  Players
                </p>
                <p className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tabular-nums leading-none">
                  {team.players.length}
                </p>
              </div>
            ) : null}
          </div>
          {onSetAsMyTeam && !isMyTeam ? (
            <button
              type="button"
              onClick={onSetAsMyTeam}
              className="mt-3 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/25"
            >
              Set as my team
            </button>
          ) : null}
          {isMyTeam ? (
            <p className="mt-3 inline-flex rounded-full bg-black/25 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15">
              My team ✓
            </p>
          ) : null}
        </div>
      </div>
      {body}
    </aside>
  );
}
