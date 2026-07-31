"use client";

import { useMemo, useState } from "react";
import { normalizeTeamName } from "@/lib/matchups";
import { isUpcomingScheduleDate } from "@/lib/schedule";
import type { ScheduleDay } from "@/lib/types";
import { EmptyState } from "./EmptyState";

type ScheduleListProps = {
  days: ScheduleDay[];
  teamName?: string | null;
};

type ScheduleView = "upcoming" | "past";

export function ScheduleList({ days, teamName }: ScheduleListProps) {
  const [view, setView] = useState<ScheduleView>("upcoming");

  const teamDays = useMemo(() => {
    if (!teamName) return days;
    const target = normalizeTeamName(teamName);
    return days
      .map((day) => ({
        ...day,
        matches: day.matches.filter(
          (match) =>
            normalizeTeamName(match.home) === target ||
            normalizeTeamName(match.away) === target,
        ),
      }))
      .filter((day) => day.matches.length > 0);
  }, [days, teamName]);

  const { upcomingDays, pastDays } = useMemo(() => {
    const upcoming: ScheduleDay[] = [];
    const past: ScheduleDay[] = [];
    for (const day of teamDays) {
      if (isUpcomingScheduleDate(day.date)) upcoming.push(day);
      else past.push(day);
    }
    return {
      upcomingDays: upcoming,
      pastDays: [...past].reverse(),
    };
  }, [teamDays]);

  const visibleDays = view === "upcoming" ? upcomingDays : pastDays;

  if (!teamDays.length) {
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { id: "upcoming", label: "Upcoming", count: upcomingDays.length },
            { id: "past", label: "Past", count: pastDays.length },
          ] as const
        ).map((item) => {
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={[
                "rounded-full px-3.5 py-1.5 text-sm font-semibold transition",
                active
                  ? "bg-[var(--felt)] text-white shadow-sm"
                  : "bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-2)]",
              ].join(" ")}
            >
              {item.label}
              <span
                className={[
                  "ml-1.5 tabular-nums",
                  active ? "text-white/80" : "text-[var(--muted)]",
                ].join(" ")}
              >
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {!visibleDays.length ? (
        <EmptyState
          title={view === "upcoming" ? "No upcoming matches" : "No past matches"}
          body={
            view === "upcoming"
              ? "Matches stay here through their scheduled day, then move to Past."
              : "Past match days will show up here after they pass."
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visibleDays.map((day) => (
            <section
              key={`${view}-${day.date}`}
              className="animate-rise rounded-[1.3rem] border border-[var(--line)] bg-[var(--surface)]/90 p-4 shadow-sm"
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
                          <p className="font-medium text-[var(--ink)]">
                            {match.home}
                          </p>
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
                    <li
                      key={`${day.date}-${index}-${match.matchId ?? match.home}`}
                    >
                      {match.url ? (
                        <a
                          href={match.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-2xl border border-[var(--line)] bg-[var(--paper)]/60 px-4 py-3 transition hover:border-[var(--felt-soft)] hover:bg-[var(--surface-2)]"
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
      )}
    </div>
  );
}
