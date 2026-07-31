import { DataTable } from "./DataTable";
import type { PlayersByTeamReport } from "@/lib/types";

export function PlayersByTeam({ report }: { report: PlayersByTeamReport }) {
  if (!report.teams.length) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted)]">
        No team player stats available.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {report.teams.map((team) => (
        <section key={team.team} className="animate-rise">
          <h3 className="mb-2 font-[family-name:var(--font-display)] text-lg text-[var(--felt-deep)]">
            {team.team}
          </h3>
          <DataTable headers={report.headers} rows={team.rows} />
        </section>
      ))}
    </div>
  );
}
