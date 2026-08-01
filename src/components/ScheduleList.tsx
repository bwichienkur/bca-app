"use client";

import { useMemo, useState } from "react";
import { normalizeTeamName } from "@/lib/matchups";
import { isUpcomingScheduleDate } from "@/lib/schedule";
import type { ScheduleDay, ScheduleMatch } from "@/lib/types";
import { EmptyState } from "./EmptyState";
import { MatchListCard } from "./MatchListCard";

type ScheduleListProps = {
  days: ScheduleDay[];
  teamName?: string | null;
  onMatchClick?: (match: ScheduleMatch, day: ScheduleDay) => void;
};

type ScheduleView = "upcoming" | "past";

export function ScheduleList({
  days,
  teamName,
  onMatchClick,
}: ScheduleListProps) {
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
  const myTeam = teamName ? normalizeTeamName(teamName) : null;

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
        <div className="space-y-5">
          {visibleDays.map((day, dayIndex) => (
            <section
              key={`${view}-${day.date}`}
              className="animate-rise space-y-3"
              style={{ animationDelay: `${Math.min(dayIndex, 5) * 0.04}s` }}
            >
              <div className="flex items-baseline justify-between gap-3 px-0.5">
                <h3 className="font-[family-name:var(--font-display)] text-lg text-[var(--felt-deep)]">
                  {day.date}
                </h3>
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                  {day.matches.length} match
                  {day.matches.length === 1 ? "" : "es"}
                </span>
              </div>
              <ul className="space-y-2.5">
                {day.matches.map((match, index) => (
                  <li
                    key={`${day.date}-${index}-${match.matchId ?? match.home}`}
                  >
                    <MatchListCard
                      homeName={match.home}
                      awayName={match.away}
                      location={match.location || undefined}
                      emphasizeHome={
                        Boolean(
                          myTeam &&
                            normalizeTeamName(match.home) === myTeam,
                        )
                      }
                      emphasizeAway={
                        Boolean(
                          myTeam &&
                            normalizeTeamName(match.away) === myTeam,
                        )
                      }
                      onClick={() => onMatchClick?.(match, day)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
