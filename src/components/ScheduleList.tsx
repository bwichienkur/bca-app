"use client";

import { normalizeTeamName } from "@/lib/matchups";
import type { ScheduleDay } from "@/lib/types";
import { EmptyState } from "./EmptyState";

type ScheduleListProps = {
  days: ScheduleDay[];
  teamName?: string | null;
};

export function ScheduleList({ days, teamName }: ScheduleListProps) {
  const filtered = teamName
    ? days
        .map((day) => ({
          ...day,
          matches: day.matches.filter((match) => {
            const target = normalizeTeamName(teamName);
            return (
              normalizeTeamName(match.home) === target ||
              normalizeTeamName(match.away) === target
            );
          }),
        }))
        .filter((day) => day.matches.length > 0)
    : days;

  if (!filtered.length) {
    return (
      <EmptyState
        title={teamName ? "No matches for this team" : "No scheduled matches"}
        body={
          teamName
            ? "Pick another team or clear the team filter."
            : "Schedule data wasn’t available for this division."
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      {teamName ? (
        <p className="text-sm text-[var(--muted)]">
          Showing matches for <span className="font-semibold text-[var(--ink)]">{teamName}</span>
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {filtered.map((day) => (
          <section
            key={day.date}
            className="animate-rise rounded-[1.3rem] border border-[var(--line)] bg-white/80 p-4 shadow-sm"
          >
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h3 className="font-[family-name:var(--font-display)] text-lg text-[var(--felt-deep)]">
                {day.date}
              </h3>
              <span className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                {day.matches.length} match{day.matches.length === 1 ? "" : "es"}
              </span>
            </div>
            <ul className="space-y-2">
              {day.matches.map((match, index) => {
                const content = (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-[var(--ink)]">{match.home}</p>
                        <p className="mt-0.5 text-sm text-[var(--muted)]">
                          vs {match.away}
                        </p>
                      </div>
                      {match.url ? (
                        <span className="mt-1 text-[var(--amber)]" aria-hidden>
                          →
                        </span>
                      ) : null}
                    </div>
                    {match.location ? (
                      <p className="mt-2 text-xs uppercase tracking-[0.12em] text-[var(--chalk)]">
                        {match.location}
                      </p>
                    ) : null}
                  </>
                );

                return (
                  <li key={`${day.date}-${index}-${match.matchId ?? match.home}`}>
                    {match.url ? (
                      <a
                        href={match.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-2xl border border-[var(--line)] bg-[var(--paper)]/60 px-4 py-3 transition hover:border-[var(--felt-soft)] hover:bg-white"
                      >
                        {content}
                      </a>
                    ) : (
                      <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)]/60 px-4 py-3">
                        {content}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
